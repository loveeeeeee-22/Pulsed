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
import { useParams, useRouter } from 'next/navigation'
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

function closestCandleByTime(candles, targetSec) {
  if (!candles?.length) return null
  return candles.reduce((prev, curr) =>
    Math.abs(curr.time - targetSec) < Math.abs(prev.time - targetSec) ? curr : prev
  )
}

function volBarColor(c) {
  return c.close >= c.open ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'
}

function tradeDurationMinutes(trade) {
  if (!trade?.date) return null
  const entryIso = `${trade.date}T${padTimePart(trade.entry_time || '09:30')}`
  const exitIso = `${trade.date}T${padTimePart(trade.exit_time || trade.entry_time || '09:30')}`
  const a = new Date(entryIso).getTime()
  const b = new Date(exitIso).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.max(0, Math.round((b - a) / 60000))
}

function buildTradeMarkers(trade, candles, entryIdx, exitIdx, visibleLastTime) {
  const isLong = String(trade?.direction || '').toLowerCase() === 'long'
  const entryPx = Number(trade?.entry_price)
  const exitPx = Number(trade?.exit_price)
  const netPnl = trade?.net_pnl

  const markers = []

  const entryTarget = trade ? tradeTimeToUnixSec(trade.date, trade.entry_time || '09:30') : null
  const exitTarget =
    trade && trade.exit_time ? tradeTimeToUnixSec(trade.date, trade.exit_time) : null

  const entryCandle =
    entryIdx >= 0 && entryIdx < candles.length
      ? candles[entryIdx]
      : entryTarget != null
        ? closestCandleByTime(candles, entryTarget)
        : null
  const exitCandle =
    exitIdx >= 0 && exitIdx < candles.length
      ? candles[exitIdx]
      : exitTarget != null
        ? closestCandleByTime(candles, exitTarget)
        : null

  const entryTime = entryCandle?.time
  const exitTime = exitCandle?.time

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
    ((Number.isFinite(exitPx) && exitPx > 0) || Number.isFinite(candles[exitIdx]?.close))

  if (entryVisible) {
    markers.push({
      time: entryTime,
      position: isLong ? 'belowBar' : 'aboveBar',
      shape: isLong ? 'arrowUp' : 'arrowDown',
      color: isLong ? '#22C55E' : '#EF4444',
      text: `Entry $${entryPx}`,
      size: 2,
    })
  }

  if (exitVisible) {
    const xText =
      Number.isFinite(exitPx) && exitPx > 0
        ? `Exit $${exitPx} | P&L: ${formatPnl(netPnl)}`
        : `Exit | P&L: ${formatPnl(netPnl)}`
    markers.push({
      time: exitTime,
      position: isLong ? 'aboveBar' : 'belowBar',
      shape: isLong ? 'arrowDown' : 'arrowUp',
      color: isLong ? '#EF4444' : '#22C55E',
      text: xText,
      size: 2,
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
  const router = useRouter()
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
  const [tradeCompleteOpen, setTradeCompleteOpen] = useState(false)

  const chartAreaRef = useRef()
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
  const replayStartIndexRef = useRef(0)
  const displayModeRef = useRef('candle')
  const crosshairHandlerRef = useRef(null)
  const tradeRef = useRef(null)
  const candlesRef = useRef([])
  const entryBarIdxRef = useRef(0)
  const exitBarIdxRef = useRef(0)

  displayModeRef.current = displayMode
  tradeRef.current = trade
  candlesRef.current = candles
  entryBarIdxRef.current = entryBarIdx
  exitBarIdxRef.current = exitBarIdx

  const replayPnlAtIndex = useCallback((t, candleRows, idx, entryIdx, exitIdx) => {
    if (!t || !candleRows.length || idx < 0) return 0
    const row = candleRows[idx]
    if (!row) return 0

    const entryT = tradeTimeToUnixSec(t.date, t.entry_time || '09:30')
    const exitT = t.exit_time ? tradeTimeToUnixSec(t.date, t.exit_time) : null
    const curT = row.time

    if (curT < entryT) return 0

    const spec = getInstrumentSpec({ symbol: t.symbol })
    const exitPx = Number(t.exit_price)
    const hasExit = Number.isFinite(exitPx) && exitPx > 0

    if (exitT != null && curT >= exitT) {
      const realized = Number(t.net_pnl)
      if (Number.isFinite(realized)) return realized
      const xIdx =
        exitIdx >= 0 && exitIdx < candleRows.length ? exitIdx : closestBarIndexByTime(candleRows, exitT)
      const markPrice = hasExit ? exitPx : candleRows[xIdx]?.close
      if (!Number.isFinite(markPrice)) return 0
      return calculateReplayPnl({
        entryPrice: t.entry_price,
        currentPrice: markPrice,
        contracts: t.contracts,
        direction: t.direction,
        spec,
      })
    }

    const markPrice = row.close
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

        let tData
        let tErr
        const withStrategy = await supabase
          .from('trades')
          .select('*, strategies ( name )')
          .eq('id', tradeId)
          .single()
        if (withStrategy.error) {
          const fallback = await supabase.from('trades').select('*').eq('id', tradeId).single()
          tData = fallback.data
          tErr = fallback.error
        } else {
          tData = withStrategy.data
          tErr = withStrategy.error
        }

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
        replayStartIndexRef.current = sIdx
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
    if (!trade || !candles.length) {
      setTradeCompleteOpen(false)
      return
    }
    const exitT = trade.exit_time ? tradeTimeToUnixSec(trade.date, trade.exit_time) : null
    const curT = candles[currentIndex]?.time
    if (exitT == null || curT == null) {
      setTradeCompleteOpen(false)
      return
    }
    setTradeCompleteOpen(curT >= exitT)
  }, [trade, candles, currentIndex])

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

    const el = chartContainerRef.current
    const w0 = el.clientWidth
    const h0 = el.clientHeight

    const chart = createChart(el, {
      layout: {
        background: { type: 'solid', color: '#141414' },
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
      autoSize: false,
      width: w0 > 0 ? w0 : 400,
      height: h0 > 0 ? h0 : 320,
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
          color: '#26a69a',
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
          scaleMargins: { top: 0.8, bottom: 0 },
        },
        1
      )
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      })
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
          color: volBarColor(c),
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

    const visIdx0 = chartBuildIndexRef.current
    const visibleLast0 = candles[visIdx0]?.time
    markersApi.setMarkers(
      buildTradeMarkers(trade, candles, entryBarIdx, exitBarIdx, visibleLast0)
    )

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
        date: d.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
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

    const resizeChart = () => {
      const box = chartContainerRef.current
      if (!box || !chartRef.current) return
      const w = box.clientWidth
      const h = box.clientHeight
      if (w > 0 && h > 0) chartRef.current.resize(w, h, true)
      chartRef.current.timeScale().fitContent()
    }

    const layoutFrame = requestAnimationFrame(() => {
      resizeChart()
    })

    const chartAreaEl = chartAreaRef.current
    const ro =
      typeof ResizeObserver !== 'undefined' && chartAreaEl
        ? new ResizeObserver(() => resizeChart())
        : null
    if (ro && chartAreaEl) ro.observe(chartAreaEl)

    window.addEventListener('resize', resizeChart)

    return () => {
      cancelAnimationFrame(layoutFrame)
      window.removeEventListener('resize', resizeChart)
      if (ro && chartAreaEl) {
        try {
          ro.unobserve(chartAreaEl)
        } catch (_) {
          /* ignore */
        }
      }
      ro?.disconnect()
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
    api.setMarkers(buildTradeMarkers(trade, candles, entryBarIdx, exitBarIdx, visibleLast))
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
              color: volBarColor(nextCandle),
            })
          }
          setRunningPnl(
            replayPnlAtIndex(
              tradeRef.current,
              candlesRef.current,
              nextIdx,
              entryBarIdxRef.current,
              exitBarIdxRef.current
            )
          )
          chartRef.current?.timeScale().scrollToRealTime()
          return nextIdx
        })
      }, msPerTick)
    } else {
      clearInterval(playbackRef.current)
    }

    return () => clearInterval(playbackRef.current)
  }, [isPlaying, speed, candles, replayPnlAtIndex])

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
          color: volBarColor(c),
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

  const isLongDir = trade?.direction?.toLowerCase() === 'long'
  const entryTs = trade ? tradeTimeToUnixSec(trade.date, trade.entry_time || '09:30') : null
  const exitTs = trade?.exit_time ? tradeTimeToUnixSec(trade.date, trade.exit_time) : null
  const curBarTs = candles[currentIndex]?.time
  const positionOpen =
    entryTs != null &&
    curBarTs != null &&
    curBarTs >= entryTs &&
    (exitTs == null || curBarTs < exitTs)
  const strat = trade?.strategies
  const strategyName = Array.isArray(strat) ? strat[0]?.name : strat?.name
  const entrySide = isLongDir ? 'BUY' : 'SELL'
  const exitSide = isLongDir ? 'SELL' : 'BUY'
  const durMin = tradeDurationMinutes(trade)
  const finalPnl = Number(trade?.net_pnl)
  const finalPnlNum = Number.isFinite(finalPnl) ? finalPnl : runningPnl

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

      <main
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
        }}
      >
        <aside
          style={{
            width: 260,
            flexShrink: 0,
            background: 'var(--card-bg)',
            borderRight: '1px solid var(--border)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            padding: '16px 14px',
            fontSize: 12,
          }}
        >
          <section>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{trade?.symbol}</div>
            <div style={{ color: 'var(--text3)', marginTop: 6 }}>{trade?.date}</div>
            <div style={{ marginTop: 10 }}>
              <span
                style={{
                  fontSize: 10,
                  background: isLongDir ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                  color: isLongDir ? '#22C55E' : '#EF4444',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {isLongDir ? 'LONG' : 'SHORT'}
              </span>
            </div>
            <div
              style={{
                marginTop: 14,
                fontFamily: 'monospace',
                fontSize: 22,
                fontWeight: 700,
                color: runningPnl >= 0 ? '#22C55E' : '#EF4444',
              }}
            >
              {runningPnl >= 0 ? '+' : '-'}${Math.abs(Number(runningPnl) || 0).toFixed(2)}
            </div>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--text2)' }}>
              <div>
                <span style={{ color: 'var(--text3)' }}>Entry </span>${Number(trade?.entry_price || 0).toFixed(2)}
              </div>
              <div>
                <span style={{ color: 'var(--text3)' }}>Exit </span>${Number(trade?.exit_price || 0).toFixed(2)}
              </div>
              <div>
                <span style={{ color: 'var(--text3)' }}>Contracts </span>
                {trade?.contracts ?? '—'}
              </div>
              <div>
                <span style={{ color: 'var(--text3)' }}>Session </span>
                {trade?.session ?? '—'}
              </div>
              {strategyName ? (
                <div>
                  <span style={{ color: 'var(--text3)' }}>Strategy </span>
                  {strategyName}
                </div>
              ) : null}
              {durMin != null ? (
                <div>
                  <span style={{ color: 'var(--text3)' }}>Duration </span>
                  {durMin} min
                </div>
              ) : null}
            </div>
          </section>

          <section style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 11, color: 'var(--text3)' }}>Executions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.4 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: '#22C55E',
                    marginTop: 4,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <span style={{ fontWeight: 600 }}>{entrySide}</span>
                  <span style={{ color: 'var(--text3)', marginLeft: 6 }}>{trade?.entry_time || '—'}</span>
                  <div style={{ fontFamily: 'monospace' }}>
                    ${Number(trade?.entry_price || 0).toFixed(2)} · {trade?.contracts ?? '—'} contracts
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.4 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: '#EF4444',
                    marginTop: 4,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <span style={{ fontWeight: 600 }}>{exitSide}</span>
                  <span style={{ color: 'var(--text3)', marginLeft: 6 }}>{trade?.exit_time || '—'}</span>
                  <div style={{ fontFamily: 'monospace' }}>
                    ${Number(trade?.exit_price || 0).toFixed(2)} · {trade?.contracts ?? '—'} contracts
                  </div>
                </div>
              </div>
            </div>
          </section>

          {positionOpen ? (
            <section style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>Unrealized P&amp;L</div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 20,
                  fontWeight: 700,
                  color: runningPnl >= 0 ? '#22C55E' : '#EF4444',
                }}
              >
                {runningPnl >= 0 ? '+' : '-'}${Math.abs(Number(runningPnl) || 0).toFixed(2)}
              </div>
              <div style={{ marginTop: 8, color: 'var(--text2)', fontFamily: 'monospace', fontSize: 11 }}>
                Entry ${Number(trade?.entry_price || 0).toFixed(2)} vs close $
                {Number(candles[currentIndex]?.close || 0).toFixed(2)}
              </div>
            </section>
          ) : null}
        </aside>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
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
                    ].map(([label, on, toggle]) => {
                      const overlayId =
                        'replay-overlay-' +
                        String(label)
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/^-|-$/g, '')
                      return (
                      <label
                        key={label}
                        htmlFor={overlayId}
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
                        <input
                          id={overlayId}
                          name={overlayId}
                          type="checkbox"
                          checked={on}
                          onChange={toggle}
                          autoComplete="off"
                        />
                      </label>
                      )
                    })}
                  </div>
                ) : null}
              </div>
              {toolbarBtn(crosshairMagnet, () => setCrosshairMagnet(m => !m), crosshairMagnet ? 'Magnet' : 'Cross')}
              {toolbarBtn(false, handleResetZoom, 'Reset')}
            </div>
          </div>

          <div
            ref={chartAreaRef}
            style={{
              flex: 1,
              minHeight: 0,
              position: 'relative',
              width: '100%',
              background: '#141414',
            }}
          >
            <div
              ref={chartContainerRef}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
            {ohlcvTooltip ? (
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  zIndex: 25,
                  background: '#1C1C1C',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 11,
                  fontFamily: 'ui-monospace, monospace',
                  color: 'rgba(255,255,255,0.9)',
                  pointerEvents: 'none',
                  minWidth: 160,
                  lineHeight: 1.45,
                }}
              >
                <div>Date: {ohlcvTooltip.date}</div>
                <div style={{ marginBottom: 6 }}>Time: {ohlcvTooltip.time}</div>
                <div>
                  O: {Number(ohlcvTooltip.o).toFixed(2)} &nbsp; H: {Number(ohlcvTooltip.h).toFixed(2)}
                </div>
                <div>
                  L: {Number(ohlcvTooltip.l).toFixed(2)} &nbsp; C: {Number(ohlcvTooltip.c).toFixed(2)}
                </div>
                <div>Vol: {ohlcvTooltip.v != null ? Number(ohlcvTooltip.v).toLocaleString() : '—'}</div>
              </div>
            ) : null}

            {tradeCompleteOpen ? (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 30,
                  background: 'rgba(0,0,0,0.55)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 16,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    maxWidth: 380,
                    background: '#1a1a1c',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '24px 22px',
                    boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Trade Complete</div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 28,
                      fontWeight: 700,
                      color: finalPnlNum >= 0 ? '#22C55E' : '#EF4444',
                      marginBottom: 12,
                    }}
                  >
                    {finalPnlNum >= 0 ? '+' : '-'}${Math.abs(finalPnlNum).toFixed(2)}
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '4px 10px',
                        borderRadius: 999,
                        background:
                          finalPnlNum >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                        color: finalPnlNum >= 0 ? '#22C55E' : '#EF4444',
                      }}
                    >
                      {finalPnlNum >= 0 ? 'Win' : 'Loss'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div>
                      Entry: ${Number(trade?.entry_price || 0).toFixed(2)} at {trade?.entry_time || '—'}
                    </div>
                    <div>
                      Exit: ${Number(trade?.exit_price || 0).toFixed(2)} at {trade?.exit_time || '—'}
                    </div>
                    {durMin != null ? <div>Duration: {durMin} minutes</div> : null}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPlaying(false)
                        setCurrentIndex(replayStartIndexRef.current)
                        setTradeCompleteOpen(false)
                      }}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--card-bg)',
                        color: 'var(--text)',
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Replay Again
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push('/trade-log')}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: 'none',
                        background: '#3B82F6',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Next Trade
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <footer
            style={{
              padding: '20px 24px',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              background: '#111113',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              flexShrink: 0,
            }}
          >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'monospace', width: '40px' }}>
            {candles[currentIndex]?.time
              ? new Date(candles[currentIndex].time * 1000).toISOString().slice(11, 16)
              : '--:--'}
          </span>
          <input
            id="replay-scrubber"
            name="replay-scrubber"
            type="range"
            min={0}
            max={candles.length - 1}
            value={currentIndex}
            onChange={handleScrub}
            autoComplete="off"
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
      </main>
    </div>
  )
}
