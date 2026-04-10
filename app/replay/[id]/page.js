'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  createSeriesMarkers,
} from 'lightweight-charts'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { calculateReplayPnl, getInstrumentSpec } from '@/lib/instrumentSpecs'

function padTimePart(t) {
  const parts = String(t || '09:30').trim().split(':')
  const hh = String(Number(parts[0]) || 0).padStart(2, '0')
  const mm = String(Number(parts[1]) || 0).padStart(2, '0')
  return `${hh}:${mm}`
}

function tradeTimeToUnixSec(dateStr, timeStr) {
  return new Date(`${dateStr}T${padTimePart(timeStr)}:00`).getTime() / 1000
}

function tradingViewChartUrl(symbol) {
  const raw = String(symbol || '').trim().toUpperCase()
  const compact = raw.replace(/[^A-Z0-9]/g, '')
  const map = {
    XAUUSD: 'FOREXCOM:XAUUSD',
    XAGUSD: 'FOREXCOM:XAGUSD',
    EURUSD: 'FX_IDC:EURUSD',
    GBPUSD: 'FX_IDC:GBPUSD',
    USDJPY: 'FX_IDC:USDJPY',
  }
  const tv = map[compact] || (compact.length >= 6 ? `FX_IDC:${compact}` : `NASDAQ:${compact}`)
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tv)}`
}

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
  const [entryBarIdx, setEntryBarIdx] = useState(0)
  const [exitBarIdx, setExitBarIdx] = useState(0)

  const chartContainerRef = useRef()
  const chartRef = useRef()
  const candlestickSeriesRef = useRef()
  const volumeSeriesRef = useRef()
  const markersPluginRef = useRef()
  const playbackRef = useRef(null)
  /** Index to show when chart is (re)built — avoids depending on currentIndex in the chart effect */
  const chartBuildIndexRef = useRef(0)

  const replayPnlAtIndex = useCallback((t, candleRows, idx, entryIdx, exitIdx) => {
    if (!t || !candleRows.length || idx < 0 || entryIdx < 0) return 0
    if (idx < entryIdx) return 0
    const spec = getInstrumentSpec({ symbol: t.symbol })
    const exitPx = Number(t.exit_price)
    const hasExit = Number.isFinite(exitPx) && exitPx > 0
    let markPrice = candleRows[idx]?.close
    if (exitIdx >= 0 && idx >= exitIdx) {
      markPrice = hasExit ? exitPx : candleRows[exitIdx]?.close
    }
    if (!Number.isFinite(markPrice)) return 0
    return calculateReplayPnl({
      entryPrice: t.entry_price,
      currentPrice: markPrice,
      contracts: t.contracts,
      direction: t.direction,
      spec,
    })
  }, [])

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

        // Format for lightweight-charts (no synthetic rescaling — that warped real price action vs your journal)
        let formatted = data.candles.map(c => ({
          time: new Date(c.time).getTime() / 1000,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: Number(c.volume) || 0,
        }))

        // Deduplicate timestamps (lightweight-charts throws if there are duplicates)
        const seen = new Set()
        formatted = formatted.filter(item => {
          if (seen.has(item.time)) return false
          seen.add(item.time)
          return true
        })

        // Sort ascending
        formatted.sort((a, b) => a.time - b.time)

        const entryTarget = tradeTimeToUnixSec(tData.date, tData.entry_time || '09:30')
        let eIdx = 0
        for (let i = 0; i < formatted.length; i++) {
          if (formatted[i].time >= entryTarget) {
            eIdx = i
            break
          }
        }

        let xIdx = formatted.length - 1
        if (tData.exit_time) {
          const exitTarget = tradeTimeToUnixSec(tData.date, tData.exit_time)
          for (let i = 0; i < formatted.length; i++) {
            if (formatted[i].time >= exitTarget) {
              xIdx = i
              break
            }
          }
        }

        setEntryBarIdx(eIdx)
        setExitBarIdx(xIdx)
        setCandles(formatted)

        let sIdx = Math.max(0, eIdx - 15)
        if (sIdx === 0 && formatted.length > 50) sIdx = 10
        chartBuildIndexRef.current = sIdx
        setCurrentIndex(sIdx)

      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (tradeId) loadData()
  }, [tradeId])

  useEffect(() => {
    if (loading || !trade || candles.length === 0) return
    setRunningPnl(replayPnlAtIndex(trade, candles, currentIndex, entryBarIdx, exitBarIdx))
  }, [loading, trade, candles, currentIndex, entryBarIdx, exitBarIdx, replayPnlAtIndex])

  // Initialize chart
  useEffect(() => {
    if (loading || error || candles.length === 0 || !chartContainerRef.current || !trade) return

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

    const volSeries = chart.addSeries(
      HistogramSeries,
      {
        color: 'rgba(59, 130, 246, 0.45)',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      },
      1
    )

    chartRef.current = chart
    candlestickSeriesRef.current = series
    volumeSeriesRef.current = volSeries

    const sliceEnd = Math.max(chartBuildIndexRef.current + 1, 1)
    const vis = candles.slice(0, sliceEnd)
    series.setData(vis)
    volSeries.setData(
      vis.map(c => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)',
      }))
    )

    const entryPx = Number(trade.entry_price)
    const exitPx = Number(trade.exit_price)
    const eIdx = entryBarIdx
    const xIdx = exitBarIdx

    if (Number.isFinite(entryPx) && entryPx > 0) {
      series.createPriceLine({
        price: entryPx,
        color: '#22C55E',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: 'Entry',
      })
    }
    if (Number.isFinite(exitPx) && exitPx > 0) {
      series.createPriceLine({
        price: exitPx,
        color: '#A855F7',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: 'Exit',
      })
    }

    if (trade.stop_loss) {
      series.createPriceLine({
        price: Number(trade.stop_loss),
        color: '#EF4444',
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'SL',
      })
    }
    if (trade.take_profit) {
      series.createPriceLine({
        price: Number(trade.take_profit),
        color: '#3B82F6',
        lineWidth: 2,
        lineStyle: 1,
        axisLabelVisible: true,
        title: 'TP',
      })
    }

    const markerItems = []
    if (eIdx >= 0 && eIdx < candles.length && Number.isFinite(entryPx) && entryPx > 0) {
      markerItems.push({
        time: candles[eIdx].time,
        position: 'atPriceMiddle',
        shape: 'arrowUp',
        color: '#22C55E',
        price: entryPx,
        text: 'Entry',
        size: 1.5,
      })
    }
    if (
      xIdx >= 0 &&
      xIdx < candles.length &&
      xIdx !== eIdx &&
      (Number.isFinite(exitPx) && exitPx > 0 || Number.isFinite(candles[xIdx]?.close))
    ) {
      markerItems.push({
        time: candles[xIdx].time,
        position: 'atPriceMiddle',
        shape: 'arrowDown',
        color: '#A855F7',
        price: Number.isFinite(exitPx) && exitPx > 0 ? exitPx : candles[xIdx].close,
        text: 'Exit',
        size: 1.5,
      })
    }

    const markersApi = createSeriesMarkers(series, markerItems)
    markersPluginRef.current = markersApi

    chart.timeScale().fitContent()

    const layoutFrame = requestAnimationFrame(() => {
      const el = chartContainerRef.current
      if (!el) return
      const w = el.clientWidth
      const h = el.clientHeight
      if (w > 0 && h > 0) chart.resize(w, h, true)
      chart.timeScale().fitContent()
    })

    return () => {
      cancelAnimationFrame(layoutFrame)
      if (markersPluginRef.current) {
        try {
          markersPluginRef.current.detach()
        } catch (_) {
          /* ignore */
        }
        markersPluginRef.current = null
      }
      chart.remove()
      chartRef.current = null
      candlestickSeriesRef.current = null
      volumeSeriesRef.current = null
    }
  }, [loading, error, candles, trade, entryBarIdx, exitBarIdx])

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
          const nextCandle = candles[nextIdx]
          if (candlestickSeriesRef.current && nextCandle) {
            candlestickSeriesRef.current.update(nextCandle)
          }
          if (volumeSeriesRef.current && nextCandle) {
            volumeSeriesRef.current.update({
              time: nextCandle.time,
              value: nextCandle.volume,
              color:
                nextCandle.close >= nextCandle.open
                  ? 'rgba(34, 197, 94, 0.35)'
                  : 'rgba(239, 68, 68, 0.35)',
            })
          }
          return nextIdx
        })
      }, msPerTick)
    } else {
      clearInterval(playbackRef.current)
    }

    return () => clearInterval(playbackRef.current)
  }, [isPlaying, speed, candles])

  const handleScrub = (e) => {
    const val = Number(e.target.value)
    setCurrentIndex(val)
    const vis = candles.slice(0, val + 1)
    if (candlestickSeriesRef.current) {
      candlestickSeriesRef.current.setData(vis)
    }
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.setData(
        vis.map(c => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)',
        }))
      )
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
    <div style={{ height: '100vh', minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#09090b', color: 'var(--text)', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
      
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

      <div
        style={{
          padding: '8px 24px',
          fontSize: '12px',
          color: 'var(--text3)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
          lineHeight: 1.45,
        }}
      >
        <span>
          Indicators and the full TradingView drawing toolbar live in TradingView’s licensed Charting Library, not in Lightweight Charts. This replay shows candles, volume, entry/exit, and SL/TP from your journal.
        </span>
        <a
          href={tradingViewChartUrl(trade?.symbol)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ flexShrink: 0, color: '#3B82F6', fontWeight: 600, textDecoration: 'none' }}
        >
          Open on TradingView →
        </a>
      </div>

      {/* Main Chart Area — flex + height:100% often yields 0px; absolute inset fills the flex slot */}
      <main style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        <div
          ref={chartContainerRef}
          style={{ position: 'absolute', inset: 0, width: '100%', minHeight: 0 }}
        />
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
