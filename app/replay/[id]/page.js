'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  createChart,
  CandlestickSeries,
  BarSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  createSeriesMarkers,
  LineStyle,
  CrosshairMode,
} from 'lightweight-charts'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { calculateReplayPnl, getInstrumentSpec } from '@/lib/instrumentSpecs'

function padTimePart(t) {
  const parts = String(t || '09:30').trim().split(':')
  const hh = String(Number(parts[0]) || 0).padStart(2, '0')
  const mm = String(Number(parts[1]) || 0).padStart(2, '0')
  const ss = parts[2] != null ? String(Number(parts[2]) || 0).padStart(2, '0') : '00'
  return `${hh}:${mm}:${ss}`
}

function tradeTimeToUnixSec(dateStr, timeStr) {
  const iso = `${dateStr}T${padTimePart(timeStr)}`
  return Math.floor(new Date(iso).getTime() / 1000)
}

function closestBarIndexByTime(formatted, targetSec) {
  if (!formatted.length) return 0
  let best = 0
  let bestDiff = Infinity
  for (let i = 0; i < formatted.length; i++) {
    const d = Math.abs(formatted[i].time - targetSec)
    if (d < bestDiff) {
      bestDiff = d
      best = i
    }
  }
  return best
}

function heikinAshiFrom(ohlc) {
  const out = []
  let prevHaOpen = null
  let prevHaClose = null
  for (let i = 0; i < ohlc.length; i++) {
    const { open, high, low, close, time, volume } = ohlc[i]
    const haClose = (open + high + low + close) / 4
    const haOpen = i === 0 ? (open + close) / 2 : (prevHaOpen + prevHaClose) / 2
    const haHigh = Math.max(high, haOpen, haClose)
    const haLow = Math.min(low, haOpen, haClose)
    out.push({ time, open: haOpen, high: haHigh, low: haLow, close: haClose, volume })
    prevHaOpen = haOpen
    prevHaClose = haClose
  }
  return out
}

function fullOhlcForMode(allRaw, displayMode) {
  if (displayMode === 'heikin') return heikinAshiFrom(allRaw)
  return allRaw
}

function visibleOhlcRows(allRaw, endIdx, displayMode) {
  const slice = allRaw.slice(0, endIdx + 1)
  if (displayMode === 'heikin') return heikinAshiFrom(slice)
  return slice
}

function smaLine(fullRows, period, maxIdx) {
  if (!fullRows.length || maxIdx < period - 1) return []
  const out = []
  for (let i = period - 1; i <= maxIdx; i++) {
    let s = 0
    for (let j = i - period + 1; j <= i; j++) s += fullRows[j].close
    out.push({ time: fullRows[i].time, value: s / period })
  }
  return out
}

function emaLine(fullRows, period, maxIdx) {
  if (!fullRows.length || maxIdx < period - 1) return []
  let sum = 0
  for (let i = 0; i < period; i++) sum += fullRows[i].close
  let ema = sum / period
  const out = [{ time: fullRows[period - 1].time, value: ema }]
  const k = 2 / (period + 1)
  for (let i = period; i <= maxIdx; i++) {
    const c = fullRows[i].close
    ema = c * k + ema * (1 - k)
    out.push({ time: fullRows[i].time, value: ema })
  }
  return out
}

function setMainSeriesData(series, displayMode, rows) {
  if (displayMode === 'line' || displayMode === 'area') {
    series.setData(rows.map(c => ({ time: c.time, value: c.close })))
  } else {
    series.setData(
      rows.map(c => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    )
  }
}

function updateMainSeriesBar(series, displayMode, c) {
  if (displayMode === 'line' || displayMode === 'area') {
    series.update({ time: c.time, value: c.close })
  } else {
    series.update({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })
  }
}

function formatPnl(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0.00'
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}`
}

function buildTradeMarkers(trade, candles, entryIdx, exitIdx, visibleLastTime, highlightEntry) {
  const isLong = String(trade?.direction || '').toLowerCase() === 'long'
  const entryPx = Number(trade?.entry_price)
  const exitPx = Number(trade?.exit_price)
  const netPnl = trade?.net_pnl

  const markers = []
  const entryTime = candles[entryIdx]?.time
  const exitTime = candles[exitIdx]?.time

  const entryVisible =
    entryIdx >= 0 &&
    entryIdx < candles.length &&
    Number.isFinite(entryPx) &&
    entryPx > 0 &&
    entryTime != null &&
    visibleLastTime != null &&
    entryTime <= visibleLastTime

  const exitVisible =
    exitIdx >= 0 &&
    exitIdx < candles.length &&
    exitTime != null &&
    visibleLastTime != null &&
    exitTime <= visibleLastTime &&
    exitIdx !== entryIdx &&
    ((Number.isFinite(exitPx) && exitPx > 0) || Number.isFinite(candles[exitIdx]?.close))

  if (entryVisible && highlightEntry) {
    markers.push({
      time: entryTime,
      position: 'inBar',
      shape: 'circle',
      color: isLong ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)',
      size: 2,
      id: 'entry-highlight',
    })
  }

  if (entryVisible) {
    markers.push({
      time: entryTime,
      position: isLong ? 'belowBar' : 'aboveBar',
      shape: isLong ? 'arrowUp' : 'arrowDown',
      color: isLong ? '#22C55E' : '#EF4444',
      text: `Entry ${entryPx}`,
    })
  }

  if (exitVisible) {
    const xText =
      Number.isFinite(exitPx) && exitPx > 0
        ? `Exit ${exitPx} | P&L: ${formatPnl(netPnl)}`
        : `Exit | P&L: ${formatPnl(netPnl)}`
    markers.push({
      time: exitTime,
      position: isLong ? 'aboveBar' : 'belowBar',
      shape: isLong ? 'arrowDown' : 'arrowUp',
      color: isLong ? '#EF4444' : '#22C55E',
      text: xText,
    })
  }

  return markers.sort((a, b) => a.time - b.time)
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

const TIMEFRAME_OPTIONS = [
  { label: '1m', api: '1min' },
  { label: '5m', api: '5min' },
  { label: '15m', api: '15min' },
  { label: '1h', api: '1h' },
]

const CHART_MODES = [
  { id: 'candle', label: 'Candles', icon: '■' },
  { id: 'hollow', label: 'Hollow', icon: '▣' },
  { id: 'heikin', label: 'Heikin', icon: '~' },
  { id: 'line', label: 'Line', icon: '/' },
  { id: 'area', label: 'Area', icon: '◿' },
  { id: 'bar', label: 'Bars', icon: '‖' },
]

export default function TradeReplayPage() {
  const params = useParams()
  const tradeId = params?.id

  const [trade, setTrade] = useState(null)
  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(10)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [runningPnl, setRunningPnl] = useState(0)
  const [entryBarIdx, setEntryBarIdx] = useState(0)
  const [exitBarIdx, setExitBarIdx] = useState(0)

  const [dataTimeframe, setDataTimeframe] = useState('1min')

  const [displayMode, setDisplayMode] = useState('candle')
  const [showVolume, setShowVolume] = useState(true)
  const [showMa20, setShowMa20] = useState(false)
  const [showMa50, setShowMa50] = useState(false)
  const [showEma9, setShowEma9] = useState(false)
  const [crosshairMagnet, setCrosshairMagnet] = useState(true)
  const [indicatorsOpen, setIndicatorsOpen] = useState(false)

  const [ohlcvTooltip, setOhlcvTooltip] = useState(null)

  const chartOuterRef = useRef()
  const chartContainerRef = useRef()
  const chartRef = useRef()
  const mainSeriesRef = useRef()
  const volumeSeriesRef = useRef()
  const markersPluginRef = useRef()
  const ma20Ref = useRef()
  const ma50Ref = useRef()
  const ema9Ref = useRef()
  const playbackRef = useRef(null)
  const chartBuildIndexRef = useRef(0)
  const displayModeRef = useRef('candle')
  const crosshairHandlerRef = useRef(null)

  displayModeRef.current = displayMode

  const replayPnlAtIndex = useCallback((t, candleRows, idx, entryIdx, exitIdx) => {
    if (!t || !candleRows.length || idx < 0 || entryIdx < 0) return 0
    if (idx < entryIdx) return 0

    if (exitIdx >= 0 && idx >= exitIdx) {
      const realized = Number(t.net_pnl)
      if (Number.isFinite(realized)) return realized
    }

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
        setError('')

        const { data: tData, error: tErr } = await supabase
          .from('trades')
          .select('*')
          .eq('id', tradeId)
          .single()

        if (tErr || !tData) throw new Error(tErr?.message || 'Trade not found')

        const tradeDate = new Date(`${tData.date}T00:00:00`)
        const daysAgo = (Date.now() - tradeDate.getTime()) / (1000 * 60 * 60 * 24)
        if (daysAgo > 30) {
          throw new Error('Replay data is only available for trades taken in the last 30 days due to data provider limits.')
        }

        setTrade(tData)

        const url = new URL(window.location.origin + '/api/market-data')
        url.searchParams.set('symbol', tData.symbol)
        url.searchParams.set('date', tData.date)
        url.searchParams.set('entry_time', tData.entry_time || '09:30')
        url.searchParams.set('exit_time', tData.exit_time || '16:00')
        url.searchParams.set('timeframe', dataTimeframe)
        url.searchParams.set('count', '800')

        const res = await fetch(url.toString())
        const data = await res.json()

        if (!res.ok || data.error) {
          throw new Error(data.error || 'Failed to load market data')
        }

        if (!data.candles || data.candles.length === 0) {
          throw new Error('No candle data returned for this timeframe.')
        }

        let formatted = data.candles.map(c => ({
          time: Math.floor(new Date(c.time).getTime() / 1000),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: Number(c.volume) || 0,
        }))

        const seen = new Set()
        formatted = formatted.filter(item => {
          if (seen.has(item.time)) return false
          seen.add(item.time)
          return true
        })
        formatted.sort((a, b) => a.time - b.time)

        const entryTarget = tradeTimeToUnixSec(tData.date, tData.entry_time || '09:30')
        const eIdx = closestBarIndexByTime(formatted, entryTarget)

        let xIdx = formatted.length - 1
        if (tData.exit_time) {
          const exitTarget = tradeTimeToUnixSec(tData.date, tData.exit_time)
          xIdx = closestBarIndexByTime(formatted, exitTarget)
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
  }, [tradeId, dataTimeframe])

  useEffect(() => {
    if (loading || !trade || candles.length === 0) return
    setRunningPnl(replayPnlAtIndex(trade, candles, currentIndex, entryBarIdx, exitBarIdx))
  }, [loading, trade, candles, currentIndex, entryBarIdx, exitBarIdx, replayPnlAtIndex])

  useEffect(() => {
    if (!chartRef.current) return
    chartRef.current.applyOptions({
      crosshair: { mode: crosshairMagnet ? CrosshairMode.Magnet : CrosshairMode.Normal },
    })
  }, [crosshairMagnet])

  useEffect(() => {
    const full = fullOhlcForMode(candles, displayMode)
    if (showMa20 && ma20Ref.current) {
      ma20Ref.current.setData(smaLine(full, 20, currentIndex))
    }
    if (showMa50 && ma50Ref.current) {
      ma50Ref.current.setData(smaLine(full, 50, currentIndex))
    }
    if (showEma9 && ema9Ref.current) {
      ema9Ref.current.setData(emaLine(full, 9, currentIndex))
    }
  }, [candles, currentIndex, displayMode, showMa20, showMa50, showEma9])

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
      crosshair: {
        mode: crosshairMagnet ? CrosshairMode.Magnet : CrosshairMode.Normal,
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

    let mainSeries
    if (displayMode === 'candle' || displayMode === 'heikin') {
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22C55E',
        downColor: '#EF4444',
        borderVisible: false,
        wickUpColor: '#22C55E',
        wickDownColor: '#EF4444',
      })
    } else if (displayMode === 'hollow') {
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: 'rgba(34, 197, 94, 0.12)',
        downColor: '#EF4444',
        borderVisible: true,
        borderUpColor: '#22C55E',
        borderDownColor: '#EF4444',
        wickUpColor: '#22C55E',
        wickDownColor: '#EF4444',
      })
    } else if (displayMode === 'line') {
      mainSeries = chart.addSeries(LineSeries, {
        color: '#E5E7EB',
        lineWidth: 2,
        priceLineVisible: false,
      })
    } else if (displayMode === 'area') {
      mainSeries = chart.addSeries(AreaSeries, {
        lineColor: '#3B82F6',
        topColor: 'rgba(59, 130, 246, 0.45)',
        bottomColor: 'rgba(59, 130, 246, 0.02)',
        priceLineVisible: false,
      })
    } else {
      mainSeries = chart.addSeries(BarSeries, {
        upColor: '#22C55E',
        downColor: '#EF4444',
        thinBars: false,
      })
    }

    let volSeries = null
    if (showVolume) {
      volSeries = chart.addSeries(
        HistogramSeries,
        {
          color: 'rgba(59, 130, 246, 0.45)',
          priceFormat: { type: 'volume' },
          priceScaleId: '',
        },
        1
      )
    }

    const sliceEnd = Math.max(chartBuildIndexRef.current + 1, 1)
    const vis = visibleOhlcRows(candles, sliceEnd - 1, displayMode)
    setMainSeriesData(mainSeries, displayMode, vis)
    if (volSeries) {
      const rawVis = candles.slice(0, sliceEnd)
      volSeries.setData(
        rawVis.map(c => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)',
        }))
      )
    }

    const isLong = String(trade.direction || '').toLowerCase() === 'long'
    const entryPx = Number(trade.entry_price)
    const exitPx = Number(trade.exit_price)
    const sl = trade.stop_loss != null ? Number(trade.stop_loss) : NaN
    const tpRaw = trade.profit_target ?? trade.take_profit
    const tp = tpRaw != null ? Number(tpRaw) : NaN

    if (Number.isFinite(entryPx) && entryPx > 0) {
      mainSeries.createPriceLine({
        price: entryPx,
        color: isLong ? '#22C55E' : '#EF4444',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Entry',
      })
    }
    if (Number.isFinite(exitPx) && exitPx > 0) {
      mainSeries.createPriceLine({
        price: exitPx,
        color: isLong ? '#EF4444' : '#22C55E',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Exit',
      })
    }
    if (Number.isFinite(sl)) {
      mainSeries.createPriceLine({
        price: sl,
        color: '#EF4444',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: 'SL',
      })
    }
    if (Number.isFinite(tp)) {
      mainSeries.createPriceLine({
        price: tp,
        color: '#22C55E',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: 'TP',
      })
    }

    const markersApi = createSeriesMarkers(mainSeries, [], { autoScale: true })
    markersPluginRef.current = markersApi

    const full = fullOhlcForMode(candles, displayMode)
    const maxIdx = chartBuildIndexRef.current

    if (showMa20) {
      const s = chart.addSeries(LineSeries, { color: '#2563EB', lineWidth: 2, priceLineVisible: false }, 0)
      s.setData(smaLine(full, 20, maxIdx))
      ma20Ref.current = s
    } else ma20Ref.current = null

    if (showMa50) {
      const s = chart.addSeries(LineSeries, { color: '#F59E0B', lineWidth: 2, priceLineVisible: false }, 0)
      s.setData(smaLine(full, 50, maxIdx))
      ma50Ref.current = s
    } else ma50Ref.current = null

    if (showEma9) {
      const s = chart.addSeries(LineSeries, { color: '#A78BFA', lineWidth: 2, priceLineVisible: false }, 0)
      s.setData(emaLine(full, 9, maxIdx))
      ema9Ref.current = s
    } else ema9Ref.current = null

    crosshairHandlerRef.current = param => {
      if (!param?.point || param.time === undefined) {
        setOhlcvTooltip(null)
        return
      }
      const main = mainSeriesRef.current
      if (!main) return
      const bar = param.seriesData?.get(main)
      const volS = volumeSeriesRef.current
      const volPt = volS ? param.seriesData?.get(volS) : null

      let o, h, l, c, v
      if (bar && 'close' in bar) {
        o = bar.open
        h = bar.high
        l = bar.low
        c = bar.close
      } else if (bar && 'value' in bar) {
        o = h = l = c = bar.value
      } else {
        setOhlcvTooltip(null)
        return
      }
      v = volPt && 'value' in volPt ? volPt.value : null

      const ts = typeof param.time === 'number' ? param.time * 1000 : Date.now()
      const d = new Date(ts)
      setOhlcvTooltip({
        date: d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
        time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        o,
        h,
        l,
        c,
        v,
      })
    }
    chart.subscribeCrosshairMove(crosshairHandlerRef.current)

    chartRef.current = chart
    mainSeriesRef.current = mainSeries
    volumeSeriesRef.current = volSeries

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
      if (crosshairHandlerRef.current) {
        try {
          chart.unsubscribeCrosshairMove(crosshairHandlerRef.current)
        } catch (_) {
          /* ignore */
        }
        crosshairHandlerRef.current = null
      }
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
      mainSeriesRef.current = null
      volumeSeriesRef.current = null
      ma20Ref.current = null
      ma50Ref.current = null
      ema9Ref.current = null
      setOhlcvTooltip(null)
    }
  }, [
    loading,
    error,
    candles,
    trade,
    entryBarIdx,
    exitBarIdx,
    displayMode,
    showVolume,
    showMa20,
    showMa50,
    showEma9,
    dataTimeframe,
  ])

  useEffect(() => {
    const api = markersPluginRef.current
    if (!api || !trade || !candles.length) return
    const visibleLast = candles[currentIndex]?.time
    const highlightEntry = currentIndex >= entryBarIdx
    api.setMarkers(buildTradeMarkers(trade, candles, entryBarIdx, exitBarIdx, visibleLast, highlightEntry))
  }, [trade, candles, currentIndex, entryBarIdx, exitBarIdx])

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
          const mode = displayModeRef.current
          const visRow = visibleOhlcRows(candles, nextIdx, mode)
          const row = visRow[visRow.length - 1]

          if (mainSeriesRef.current && row) {
            updateMainSeriesBar(mainSeriesRef.current, mode, row)
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
          chartRef.current?.timeScale().scrollToRealTime()
          return nextIdx
        })
      }, msPerTick)
    } else {
      clearInterval(playbackRef.current)
    }

    return () => clearInterval(playbackRef.current)
  }, [isPlaying, speed, candles])

  const handleScrub = e => {
    const val = Number(e.target.value)
    setCurrentIndex(val)
    const mode = displayModeRef.current
    const vis = visibleOhlcRows(candles, val, mode)
    if (mainSeriesRef.current) {
      setMainSeriesData(mainSeriesRef.current, mode, vis)
    }
    if (volumeSeriesRef.current) {
      const rawVis = candles.slice(0, val + 1)
      volumeSeriesRef.current.setData(
        rawVis.map(c => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)',
        }))
      )
    }
  }

  const handleResetZoom = () => {
    chartRef.current?.timeScale().fitContent()
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#09090b',
          color: '#fff',
        }}
      >
        <div style={{ fontFamily: 'monospace', fontSize: '18px' }}>Loading replay data...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#09090b',
          color: '#fff',
          gap: '20px',
        }}
      >
        <div style={{ fontSize: '48px' }}>⚠️</div>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '18px',
            maxWidth: '500px',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
        <Link
          href="/dashboard"
          style={{
            background: '#3B82F6',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Back to Journal
        </Link>
      </div>
    )
  }

  const toolbarBtn = (active, onClick, children) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 28,
        padding: '0 10px',
        borderRadius: 6,
        border: 'none',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 500,
        color: active ? '#fff' : 'rgba(255,255,255,0.55)',
        background: active ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
      }}
    >
      {children}
    </button>
  )

  return (
    <div
      style={{
        height: '100vh',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#09090b',
        color: 'var(--text)',
        fontFamily: 'Inter, sans-serif',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <Link
            href="/dashboard"
            style={{
              color: 'var(--text3)',
              textDecoration: 'none',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            ← Back
          </Link>
          <div style={{ height: '24px', width: '1px', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ fontWeight: 600, fontSize: '16px' }}>
            {trade?.symbol}{' '}
            <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: '8px' }}>{trade?.date}</span>
          </div>
          <span
            style={{
              fontSize: '11px',
              background:
                trade?.direction?.toLowerCase() === 'long' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              color: trade?.direction?.toLowerCase() === 'long' ? '#22C55E' : '#EF4444',
              padding: '4px 10px',
              borderRadius: '999px',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            {trade?.direction}
          </span>
        </div>

        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '16px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span style={{ color: 'var(--text3)', fontSize: '12px', fontWeight: 500 }}>REPLAY P&L</span>
          <span style={{ color: runningPnl >= 0 ? '#22C55E' : '#EF4444' }}>
            {runningPnl >= 0 ? '+' : '-'}${Math.abs(Number(runningPnl) || 0).toFixed(2)}
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
          Custom toolbar above the chart replaces TradingView&apos;s licensed Charting Library. Full drawing tools live on{' '}
          <a
            href={tradingViewChartUrl(trade?.symbol)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#3B82F6', fontWeight: 600, textDecoration: 'none' }}
          >
            TradingView
          </a>
          .
        </span>
      </div>

      <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div ref={chartOuterRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <div
            style={{
              height: 36,
              flexShrink: 0,
              background: '#1C1C1C',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 10px',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', minWidth: 0 }}>
              {CHART_MODES.map(m =>
                toolbarBtn(
                  displayMode === m.id,
                  () => setDisplayMode(m.id),
                  <>
                    <span style={{ fontSize: 13, opacity: 0.9 }}>{m.icon}</span>
                    {m.label}
                  </>
                )
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {TIMEFRAME_OPTIONS.map(tf =>
                toolbarBtn(
                  dataTimeframe === tf.api,
                  () => {
                    if (dataTimeframe !== tf.api) setDataTimeframe(tf.api)
                  },
                  tf.label
                )
              )}
              <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
              <div style={{ position: 'relative' }}>
                {toolbarBtn(indicatorsOpen, () => setIndicatorsOpen(o => !o), 'Indicators ▾')}
                {indicatorsOpen ? (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: 6,
                      minWidth: 220,
                      background: '#252525',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      zIndex: 50,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
                    }}
                  >
                    {[
                      ['Volume', showVolume, () => setShowVolume(v => !v)],
                      ['MA 20', showMa20, () => setShowMa20(v => !v)],
                      ['MA 50', showMa50, () => setShowMa50(v => !v)],
                      ['EMA 9', showEma9, () => setShowEma9(v => !v)],
                    ].map(([label, on, toggle]) => (
                      <label
                        key={label}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          fontSize: 12,
                          color: 'rgba(255,255,255,0.85)',
                          marginBottom: 8,
                          cursor: 'pointer',
                        }}
                      >
                        <span>{label}</span>
                        <input type="checkbox" checked={on} onChange={toggle} />
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
              {toolbarBtn(crosshairMagnet, () => setCrosshairMagnet(m => !m), crosshairMagnet ? 'Magnet' : 'Cross')}
              {toolbarBtn(false, handleResetZoom, 'Reset')}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 500, position: 'relative', width: '100%' }}>
            <div
              ref={chartContainerRef}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', minHeight: 500 }}
            />
            {ohlcvTooltip ? (
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  zIndex: 20,
                  background: 'rgba(17,17,19,0.92)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 11,
                  fontFamily: 'ui-monospace, monospace',
                  color: 'rgba(255,255,255,0.9)',
                  pointerEvents: 'none',
                  minWidth: 160,
                  lineHeight: 1.45,
                }}
              >
                <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                  {ohlcvTooltip.date} {ohlcvTooltip.time}
                </div>
                <div>O {Number(ohlcvTooltip.o).toFixed(4)}</div>
                <div>H {Number(ohlcvTooltip.h).toFixed(4)}</div>
                <div>L {Number(ohlcvTooltip.l).toFixed(4)}</div>
                <div>C {Number(ohlcvTooltip.c).toFixed(4)}</div>
                <div>V {ohlcvTooltip.v != null ? Number(ohlcvTooltip.v).toLocaleString() : '—'}</div>
              </div>
            ) : null}
          </div>
        </div>
      </main>

      <footer
        style={{
          padding: '20px 24px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          background: '#111113',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'monospace', width: '40px' }}>
            {candles[currentIndex]?.time
              ? new Date(candles[currentIndex].time * 1000).toISOString().slice(11, 16)
              : '--:--'}
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
              appearance: 'none',
            }}
          />
          <span style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'monospace', width: '40px' }}>
            {candles[candles.length - 1]?.time
              ? new Date(candles[candles.length - 1].time * 1000).toISOString().slice(11, 16)
              : '--:--'}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '24px' }}>
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: isPlaying ? 'rgba(255,255,255,0.1)' : '#3B82F6',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              transition: 'background 0.2s',
            }}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px' }}>
            {[1, 5, 10, 50].map(s => (
              <button
                type="button"
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
                  fontFamily: 'monospace',
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
