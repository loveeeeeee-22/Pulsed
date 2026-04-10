'use client'

import { useEffect, useState, useRef } from 'react'
import { createChart, CandlestickSeries } from 'lightweight-charts'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function TradeReplayPage() {
  const params = useParams()
  const tradeId = params?.id

  const [trade, setTrade] = useState(null)
  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  // Plaback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(10) // 1x, 5x, 10x, 50x
  const [currentIndex, setCurrentIndex] = useState(0)
  const [runningPnl, setRunningPnl] = useState(0)

  const chartContainerRef = useRef()
  const chartRef = useRef()
  const candlestickSeriesRef = useRef()
  const entryMarkerRef = useRef()
  const exitMarkerRef = useRef()
  
  // Timer ref for playback
  const playbackRef = useRef(null)

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        
        // 1. Fetch trade directly from Supabase
        const { data: tData, error: tErr } = await supabase
          .from('trades')
          .select('*')
          .eq('id', tradeId)
          .single()

        if (tErr || !tData) throw new Error(tErr?.message || 'Trade not found')
        
        // Check 30-day limit
        const tradeDate = new Date(`${tData.date}T00:00:00`)
        const daysAgo = (Date.now() - tradeDate.getTime()) / (1000 * 60 * 60 * 24)
        if (daysAgo > 30) {
          throw new Error('Replay data is only available for trades taken in the last 30 days due to data provider limits.')
        }

        setTrade(tData)

        // 2. Fetch candles
        const url = new URL(window.location.origin + '/api/market-data')
        url.searchParams.set('symbol', tData.symbol)
        url.searchParams.set('date', tData.date)
        url.searchParams.set('entry_time', tData.entry_time || '09:30')
        url.searchParams.set('exit_time', tData.exit_time || '16:00')
        url.searchParams.set('timeframe', '1min')
        url.searchParams.set('count', '800')

        const res = await fetch(url.toString())
        const data = await res.json()
        
        if (!res.ok || data.error) {
          throw new Error(data.error || 'Failed to load market data')
        }

        if (!data.candles || data.candles.length === 0) {
          throw new Error('No candle data returned for this timeframe.')
        }

        // Format for lightweight-charts
        let formatted = data.candles.map(c => ({
          time: new Date(c.time).getTime() / 1000,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close
        }))

        // Auto-scale fallback ETFs to CFD scale
        if (formatted.length > 0 && tData.entry_price) {
          const entryPrice = Number(tData.entry_price)
          const firstClose = formatted[0].close
          if (entryPrice > 0 && firstClose > 0) {
            const ratio = entryPrice / firstClose
            if (ratio > 1.5 || ratio < 0.6) {
              const scale = Math.round(ratio) // usually ~10 or ~100
              formatted.forEach(c => {
                c.open *= scale
                c.high *= scale
                c.low *= scale
                c.close *= scale
              })
            }
          }
        }

        // Deduplicate timestamps (lightweight-charts throws if there are duplicates)
        const seen = new Set()
        formatted = formatted.filter(item => {
          if (seen.has(item.time)) return false
          seen.add(item.time)
          return true
        })

        // Sort ascending
        formatted.sort((a, b) => a.time - b.time)
        setCandles(formatted)
        
        // Find rough starting point index (a bit before the entry time)
        // Remove 'Z' to parse in same local timezone context as the candles
        const entryTarget = new Date(`${tData.date}T${tData.entry_time || '09:30'}:00`).getTime() / 1000
        let sIdx = 0
        for (let i = 0; i < formatted.length; i++) {
          if (formatted[i].time >= entryTarget) {
            sIdx = Math.max(0, i - 15) // start 15 min before entry
            break
          }
        }
        if (sIdx === 0 && formatted.length > 50) sIdx = 10;
        setCurrentIndex(sIdx)

      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (tradeId) loadData()
  }, [tradeId])

  // Initialize chart
  useEffect(() => {
    if (loading || error || candles.length === 0 || !chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#9CA3AF',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      autoSize: true,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22C55E',
      downColor: '#EF4444',
      borderVisible: false,
      wickUpColor: '#22C55E',
      wickDownColor: '#EF4444',
    })

    chartRef.current = chart
    candlestickSeriesRef.current = series

    // Set initial visible candles up to currentIndex
    series.setData(candles.slice(0, Math.max(currentIndex + 1, 1)))
    
    // Add SL / TP lines if they exist
    if (trade?.stop_loss) {
      series.createPriceLine({
        price: Number(trade.stop_loss),
        color: '#EF4444',
        lineWidth: 2,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: 'SL',
      })
    }
    if (trade?.take_profit) {
      series.createPriceLine({
        price: Number(trade.take_profit),
        color: '#3B82F6',
        lineWidth: 2,
        lineStyle: 1, // Dotted
        axisLabelVisible: true,
        title: 'TP',
      })
    }
    
    chart.timeScale().fitContent()

    return () => {
      chart.remove()
      chartRef.current = null
      candlestickSeriesRef.current = null
    }
  }, [loading, error, candles]) // Note: intentionally don't re-run on currentIndex to avoid recreating chart

  // Playback loop
  useEffect(() => {
    if (isPlaying) {
      const msPerTick = speed === 1 ? 1000 : speed === 5 ? 200 : speed === 10 ? 100 : 20
      
      playbackRef.current = setInterval(() => {
        setCurrentIndex(prev => {
          if (prev >= candles.length - 1) {
            setIsPlaying(false)
            return prev
          }
          const nextIdx = prev + 1
          
          // Update chart
          if (candlestickSeriesRef.current) {
            const nextCandle = candles[nextIdx]
            candlestickSeriesRef.current.update(nextCandle)
            
            // Re-calculate running P&L if within trade bounds
            if (trade && trade.entry_price && trade.direction) {
              const eTime = new Date(`${trade.date}T${trade.entry_time || '09:30'}:00`).getTime() / 1000
              const xTime = trade.exit_time ? new Date(`${trade.date}T${trade.exit_time}:00`).getTime() / 1000 : Infinity
              
              if (nextCandle.time >= eTime && nextCandle.time <= xTime) {
                const diff = (nextCandle.close - trade.entry_price) / trade.entry_price
                const pos = trade.direction.toLowerCase() === 'long' ? 1 : -1
                const riskOrContracts = Number(trade.contracts) || 1
                // Rough estimate based on points/contracts if precise math isn't available
                const estPnl = diff * pos * 100000 * riskOrContracts // very rough!
                setRunningPnl(estPnl)
              }
            }
          }
          return nextIdx
        })
      }, msPerTick)
    } else {
      clearInterval(playbackRef.current)
    }

    return () => clearInterval(playbackRef.current)
  }, [isPlaying, speed, candles, trade])

  // Scrubbing handler
  const handleScrub = (e) => {
    const val = Number(e.target.value)
    setCurrentIndex(val)
    if (candlestickSeriesRef.current) {
      candlestickSeriesRef.current.setData(candles.slice(0, val + 1))
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#09090b', color: '#fff' }}>
        <div style={{ fontFamily: 'monospace', fontSize: '18px' }}>Loading replay data...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDir: 'column', alignItems: 'center', justifyContent: 'center', background: '#09090b', color: '#fff', gap: '20px' }}>
        <div style={{ fontSize: '48px' }}>⚠️</div>
        <div style={{ fontFamily: 'monospace', fontSize: '18px', maxWidth: '500px', textAlign: 'center', lineHeight: 1.5 }}>
          {error}
        </div>
        <Link href="/dashboard" style={{ background: '#3B82F6', color: '#fff', padding: '10px 20px', borderRadius: '8px', textDecoration: 'none', fontWeight: 600 }}>
          Back to Journal
        </Link>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#09090b', color: 'var(--text)', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Top Bar */}
      <header style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <Link href="/dashboard" style={{ color: 'var(--text3)', textDecoration: 'none', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            ← Back
          </Link>
          <div style={{ height: '24px', width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
          <div style={{ fontWeight: 600, fontSize: '16px' }}>
            {trade?.symbol} <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: '8px' }}>{trade?.date}</span>
          </div>
          <span style={{ 
            fontSize: '11px', 
            background: trade?.direction?.toLowerCase() === 'long' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', 
            color: trade?.direction?.toLowerCase() === 'long' ? '#22C55E' : '#EF4444', 
            padding: '4px 10px', 
            borderRadius: '999px', 
            fontWeight: 700, 
            textTransform: 'uppercase'
          }}>
            {trade?.direction}
          </span>
        </div>

        {/* Live P&L estimate during replay */}
        <div style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'var(--text3)', fontSize: '12px', fontWeight: 500 }}>REPLAY P&L</span>
          <span style={{ color: runningPnl >= 0 ? '#22C55E' : '#EF4444' }}>
            {runningPnl >= 0 ? '+' : ''}${Math.abs(runningPnl).toFixed(2)}
          </span>
        </div>
      </header>

      {/* Main Chart Area */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
      </main>

      {/* Bottom Controls Bar */}
      <footer style={{ padding: '20px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', background: '#111113', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Scrubber */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'monospace', width: '40px' }}>
            {candles[currentIndex]?.time ? new Date(candles[currentIndex].time * 1000).toISOString().slice(11, 16) : '--:--'}
          </span>
          <input 
            type="range" 
            min={0} 
            max={candles.length - 1} 
            value={currentIndex}
            onChange={handleScrub}
            style={{ 
              flex: 1, 
              accentColor: '#3B82F6', 
              height: '4px', 
              cursor: 'pointer',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '2px',
              appearance: 'none'
            }} 
          />
          <span style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'monospace', width: '40px' }}>
            {candles[candles.length - 1]?.time ? new Date(candles[candles.length - 1].time * 1000).toISOString().slice(11, 16) : '--:--'}
          </span>
        </div>

        {/* Playback Actions */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '24px' }}>
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              width: '44px', height: '44px', borderRadius: '50%', background: isPlaying ? 'rgba(255,255,255,0.1)' : '#3B82F6',
              color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px', transition: 'background 0.2s'
            }}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px' }}>
            {[1, 5, 10, 50].map(s => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                style={{
                  padding: '6px 12px',
                  background: speed === s ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: speed === s ? '#fff' : 'var(--text3)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: 'monospace'
                }}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>

      </footer>
      
    </div>
  )
}
