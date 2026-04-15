'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const JOURNAL_TYPES = [
  {
    id: 'daily',
    label: 'Daily Journal',
    description: "Today's reflection",
    shortLabel: 'DAILY JOURNAL',
    placeholder:
      "How did today's trading go?\nWhat did you observe in the market?\nHow are you feeling?",
  },
  {
    id: 'weekly',
    label: 'Weekly Journal',
    description: 'Week in review',
    shortLabel: 'WEEKLY JOURNAL',
    placeholder:
      'How was your trading week?\nWhat patterns did you notice?\nWhat will you do differently next week?',
  },
  {
    id: 'monthly',
    label: 'Monthly Journal',
    description: 'Monthly summary',
    shortLabel: 'MONTHLY JOURNAL',
    placeholder:
      "Reflect on this month's performance.\nWhat improved?\nWhat needs work? What are your goals for next month?",
  },
]

function pad2(value) {
  return String(value).padStart(2, '0')
}

function startOfDay(date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function startOfWeek(date) {
  const day = startOfDay(date)
  const dow = day.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  day.setDate(day.getDate() + diff)
  return day
}

function endOfWeek(date) {
  const start = startOfWeek(date)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return end
}

function getWeekNumber(date) {
  const day = startOfDay(date)
  day.setDate(day.getDate() + 3 - ((day.getDay() + 6) % 7))
  const week1 = new Date(day.getFullYear(), 0, 4)
  return (
    1 +
    Math.round(
      ((day.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
    )
  )
}

function getIsoWeekYear(date) {
  const day = startOfDay(date)
  day.setDate(day.getDate() + 3 - ((day.getDay() + 6) % 7))
  return day.getFullYear()
}

function dateFromIsoWeek(weekYear, weekNumber) {
  const jan4 = new Date(weekYear, 0, 4)
  const jan4Dow = jan4.getDay() || 7
  const monday = new Date(jan4)
  monday.setDate(jan4.getDate() - jan4Dow + 1 + (weekNumber - 1) * 7)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function dayKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function weekKey(date) {
  const weekYear = getIsoWeekYear(date)
  const weekNumber = getWeekNumber(date)
  return `${weekYear}-W${pad2(weekNumber)}`
}

function monthKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

function periodKeyFor(type, date) {
  if (type === 'weekly') return weekKey(date)
  if (type === 'monthly') return monthKey(date)
  return dayKey(date)
}

function addPeriod(type, date, delta) {
  const next = new Date(date)
  if (type === 'weekly') {
    next.setDate(next.getDate() + delta * 7)
    return next
  }
  if (type === 'monthly') {
    next.setMonth(next.getMonth() + delta)
    return next
  }
  next.setDate(next.getDate() + delta)
  return next
}

function isFuturePeriod(type, date) {
  const today = new Date()
  if (type === 'daily') return startOfDay(date) > startOfDay(today)
  if (type === 'weekly') return startOfWeek(date) > startOfWeek(today)
  return date.getFullYear() > today.getFullYear() || (date.getFullYear() === today.getFullYear() && date.getMonth() > today.getMonth())
}

function parsePeriodDate(type, key) {
  if (!key) return new Date(0)
  if (type === 'weekly') {
    const [yearPart, weekPart] = String(key).split('-W')
    const weekYear = Number(yearPart)
    const weekNum = Number(weekPart)
    if (!Number.isFinite(weekYear) || !Number.isFinite(weekNum)) return new Date(0)
    return dateFromIsoWeek(weekYear, weekNum)
  }
  if (type === 'monthly') {
    const [yearPart, monthPart] = String(key).split('-')
    const year = Number(yearPart)
    const month = Number(monthPart)
    if (!Number.isFinite(year) || !Number.isFinite(month)) return new Date(0)
    return new Date(year, month - 1, 1)
  }
  return new Date(`${key}T00:00:00`)
}

function formatDailyTitle(date) {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' })
  const month = date.toLocaleDateString('en-US', { month: 'long' })
  return `${weekday}, ${month} ${date.getDate()} ${date.getFullYear()}`
}

function formatWeeklyTitle(date) {
  const start = startOfWeek(date)
  const end = endOfWeek(date)
  const week = getWeekNumber(date)
  const startMonth = start.toLocaleDateString('en-US', { month: 'long' })
  const endMonth = end.toLocaleDateString('en-US', { month: 'long' })
  const range =
    startMonth === endMonth
      ? `${startMonth} ${start.getDate()} – ${end.getDate()} ${end.getFullYear()}`
      : `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()} ${end.getFullYear()}`
  return `Week ${week} · ${range}`
}

function formatMonthlyTitle(date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatPeriodTitle(type, date) {
  if (type === 'weekly') return formatWeeklyTitle(date)
  if (type === 'monthly') return formatMonthlyTitle(date)
  return formatDailyTitle(date)
}

function formatSidebarLabel(type, key) {
  const date = parsePeriodDate(type, key)
  if (type === 'weekly') {
    const week = getWeekNumber(date)
    const start = startOfWeek(date)
    const end = endOfWeek(date)
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
    const range =
      startMonth === endMonth
        ? `${startMonth} ${start.getDate()}-${end.getDate()}`
        : `${startMonth} ${start.getDate()}-${endMonth} ${end.getDate()}`
    return `Week ${week} · ${range}`
  }
  if (type === 'monthly') {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function htmlToText(html) {
  if (typeof window === 'undefined') return ''
  const div = document.createElement('div')
  div.innerHTML = html || ''
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim()
}

function getPreviewText(html) {
  const text = htmlToText(html)
  if (text.length <= 60) return text
  return `${text.slice(0, 60)}...`
}

function hasMeaningfulHtml(html) {
  const text = htmlToText(html)
  if (text.length > 0) return true
  return /<(img|hr|ul|ol|li|h1|h2|h3|h4|h5|h6|blockquote|table)\b/i.test(html || '')
}

function formatRelativeSaved(lastSavedAt) {
  if (!lastSavedAt) return 'Not saved yet'
  const diffMs = Date.now() - lastSavedAt.getTime()
  const seconds = Math.max(1, Math.floor(diffMs / 1000))
  if (seconds < 60) return `Saved ${seconds} seconds ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `Saved ${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Saved ${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `Saved ${days} day${days === 1 ? '' : 's'} ago`
}

function JournalTypeIcon({ type, color }) {
  if (type === 'weekly') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
        <rect x="2.5" y="4" width="15" height="13.5" rx="2.5" stroke={color} strokeWidth="1.5" />
        <path d="M6 2.5V6M14 2.5V6M2.5 8.2H17.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M5.2 11.2H8.3M11.7 11.2H14.8M5.2 14.2H8.3M11.7 14.2H14.8" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  if (type === 'monthly') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
        <rect x="2.5" y="4" width="15" height="13.5" rx="2.5" stroke={color} strokeWidth="1.5" />
        <path d="M6 2.5V6M14 2.5V6M2.5 8.2H17.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M5.2 11.2H14.8M5.2 14.2H11.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2.5" y="4" width="15" height="13.5" rx="2.5" stroke={color} strokeWidth="1.5" />
      <path d="M6 2.5V6M14 2.5V6M2.5 8.2H17.5M6 11.5H10.2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default function JournalPage() {
  const [accent, setAccent] = useState('#7C3AED')
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const [allEntries, setAllEntries] = useState([])
  const [journalType, setJournalType] = useState('daily')
  const [periodDate, setPeriodDate] = useState(() => new Date())
  const [editorHtml, setEditorHtml] = useState('')
  const [baselineHtml, setBaselineHtml] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const [expandedEntryIds, setExpandedEntryIds] = useState({})
  const [hoveredEntryId, setHoveredEntryId] = useState(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const editorRef = useRef(null)
  const saveFlashTimerRef = useRef(null)
  const typeMeta = useMemo(
    () => JOURNAL_TYPES.find((item) => item.id === journalType) || JOURNAL_TYPES[0],
    [journalType],
  )

  const periodKey = useMemo(() => periodKeyFor(journalType, periodDate), [journalType, periodDate])

  const entriesForType = useMemo(() => {
    return allEntries
      .filter((entry) => entry.journal_type === journalType)
      .sort((a, b) => {
        const dateA = parsePeriodDate(journalType, a.period_key).getTime()
        const dateB = parsePeriodDate(journalType, b.period_key).getTime()
        if (dateA !== dateB) return dateB - dateA
        const aUpdated = new Date(a.updated_at || a.created_at || 0).getTime()
        const bUpdated = new Date(b.updated_at || b.created_at || 0).getTime()
        return bUpdated - aUpdated
      })
  }, [allEntries, journalType])

  const currentEntry = useMemo(() => {
    return allEntries.find(
      (entry) => entry.journal_type === journalType && entry.period_key === periodKey,
    )
  }, [allEntries, journalType, periodKey])

  const editorPlainText = useMemo(() => htmlToText(editorHtml), [editorHtml])
  const wordCount = useMemo(() => {
    if (!editorPlainText) return 0
    return editorPlainText.split(/\s+/).filter(Boolean).length
  }, [editorPlainText])
  const characterCount = editorPlainText.length
  const placeholder = typeMeta.placeholder
  const isEditorVisuallyEmpty = !hasMeaningfulHtml(editorHtml)
  const titleText = formatPeriodTitle(journalType, periodDate)
  const canGoNext = !isFuturePeriod(journalType, addPeriod(journalType, periodDate, 1))
  const navLabels =
    journalType === 'daily'
      ? { prev: '← Yesterday', current: 'Today', next: 'Tomorrow →' }
      : journalType === 'weekly'
        ? { prev: '← Last week', current: 'This week', next: 'Next week →' }
        : { prev: '← Last month', current: 'This month', next: 'Next month →' }

  const fetchEntries = useCallback(async (uid) => {
    if (!uid) {
      setAllEntries([])
      return []
    }
    const { data, error } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Failed to fetch journal entries:', error.message)
      return []
    }
    setAllEntries(data || [])
    return data || []
  }, [])

  useEffect(() => {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem('accentColor') : null
    if (raw && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) {
      setAccent(raw)
      document.documentElement.style.setProperty('--accent', raw)
    }
  }, [])

  useEffect(() => {
    let active = true
    async function bootstrap() {
      setLoading(true)
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const uid = session?.user?.id || null
      if (!active) return
      setUserId(uid)
      await fetchEntries(uid)
      if (active) setLoading(false)
    }
    bootstrap()
    return () => {
      active = false
    }
  }, [fetchEntries])

  useEffect(() => {
    if (isDirty) return
    const nextHtml = currentEntry?.content || ''
    setEditorHtml(nextHtml)
    setBaselineHtml(nextHtml)
    setLastSavedAt(currentEntry?.updated_at ? new Date(currentEntry.updated_at) : null)
    if (editorRef.current && editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml
    }
  }, [currentEntry, periodKey, journalType, isDirty])

  useEffect(() => {
    const interval = setInterval(() => setRefreshTick((value) => value + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!savedFlash) return
    if (saveFlashTimerRef.current) clearTimeout(saveFlashTimerRef.current)
    saveFlashTimerRef.current = setTimeout(() => setSavedFlash(false), 3000)
    return () => {
      if (saveFlashTimerRef.current) clearTimeout(saveFlashTimerRef.current)
    }
  }, [savedFlash])

  const runSave = useCallback(
    async ({ silent = false } = {}) => {
      if (!userId || isSaving) return { ok: false }
      const html = editorRef.current?.innerHTML || editorHtml
      const existing = allEntries.find(
        (entry) => entry.journal_type === journalType && entry.period_key === periodKey,
      )
      setIsSaving(true)
      const nowIso = new Date().toISOString()
      let error = null

      if (existing?.id) {
        const { error: updateError } = await supabase
          .from('journal_entries')
          .update({ content: html, updated_at: nowIso })
          .eq('id', existing.id)
        error = updateError
      } else {
        const { error: insertError } = await supabase.from('journal_entries').insert({
          user_id: userId,
          journal_type: journalType,
          period_key: periodKey,
          content: html,
          created_at: nowIso,
          updated_at: nowIso,
        })
        error = insertError
      }

      if (error) {
        console.error('Failed to save journal entry:', error.message)
        setIsSaving(false)
        return { ok: false }
      }

      await fetchEntries(userId)
      setBaselineHtml(html)
      setEditorHtml(html)
      setIsDirty(false)
      setLastSavedAt(new Date())
      setSavedFlash(true)
      setIsSaving(false)
      if (!silent) {
        setPendingAction(null)
      }
      return { ok: true }
    },
    [allEntries, editorHtml, fetchEntries, isSaving, journalType, periodKey, userId],
  )

  useEffect(() => {
    const autosave = setInterval(() => {
      if (isDirty && userId && !isSaving) {
        void runSave({ silent: true })
      }
    }, 30000)
    return () => clearInterval(autosave)
  }, [isDirty, isSaving, runSave, userId])

  function runAction(action) {
    if (!action) return
    if (action.kind === 'type') {
      setJournalType(action.value)
      setPeriodDate(new Date())
      setPendingAction(null)
      return
    }
    if (action.kind === 'period') {
      setPeriodDate(action.value)
      setPendingAction(null)
    }
  }

  function queueAction(action) {
    if (isDirty) {
      setPendingAction(action)
      return
    }
    runAction(action)
  }

  async function onSavePendingAndContinue() {
    const result = await runSave()
    if (result.ok) {
      runAction(pendingAction)
    }
  }

  function onDiscardAndContinue() {
    setIsDirty(false)
    runAction(pendingAction)
  }

  function handleEditorInput() {
    const html = editorRef.current?.innerHTML || ''
    setEditorHtml(html)
    setIsDirty(html !== baselineHtml)
  }

  function applyCommand(command, value = null) {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    setTimeout(() => {
      const html = editorRef.current?.innerHTML || ''
      setEditorHtml(html)
      setIsDirty(html !== baselineHtml)
    }, 0)
  }

  function handleTypeClick(nextType) {
    if (nextType === journalType) return
    queueAction({ kind: 'type', value: nextType })
  }

  function handlePeriodNav(delta) {
    const nextDate = addPeriod(journalType, periodDate, delta)
    if (delta > 0 && isFuturePeriod(journalType, nextDate)) return
    queueAction({ kind: 'period', value: nextDate })
  }

  function handleCurrentPeriod() {
    const now = new Date()
    if (periodKeyFor(journalType, now) === periodKey) return
    queueAction({ kind: 'period', value: now })
  }

  async function handleDeleteEntry(entryId) {
    if (!userId || !entryId) return
    const previous = allEntries
    setAllEntries((list) => list.filter((item) => item.id !== entryId))
    const { error } = await supabase.from('journal_entries').delete().eq('id', entryId)
    if (error) {
      console.error('Failed to delete entry:', error.message)
      setAllEntries(previous)
      return
    }
    await fetchEntries(userId)
  }

  function toolbarButton(label, onClick, active = false) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          border: '1px solid var(--border)',
          background: active ? 'var(--bg3)' : 'transparent',
          color: 'var(--text2)',
          borderRadius: '6px',
          padding: '6px 8px',
          minWidth: '28px',
          cursor: 'pointer',
          fontSize: '12px',
          fontFamily: 'inherit',
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg)', color: 'var(--text)' }}>
      <header
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--card-bg)',
          padding: '14px 24px',
        }}
      >
        <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Trading journal
        </div>
        <h1 style={{ margin: '4px 0 0', fontSize: '24px', fontWeight: 600 }}>Daily Journal</h1>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: 'calc(100vh - 84px)' }}>
        <aside
          style={{
            background: 'var(--bg2)',
            borderRight: '1px solid var(--border)',
            height: 'calc(100vh - 84px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '14px 12px 12px' }}>
            {JOURNAL_TYPES.map((type) => {
              const isActive = type.id === journalType
              const textColor = isActive ? accent : 'var(--text2)'
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => handleTypeClick(type.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid transparent',
                    borderLeft: isActive ? `3px solid ${accent}` : '3px solid transparent',
                    background: isActive ? `${accent}26` : 'transparent',
                    color: textColor,
                    marginBottom: '8px',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(event) => {
                    if (!isActive) event.currentTarget.style.background = 'var(--bg3)'
                  }}
                  onMouseLeave={(event) => {
                    if (!isActive) event.currentTarget.style.background = 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <JournalTypeIcon type={type.id} color={textColor} />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>{type.label}</div>
                      <div style={{ fontSize: '12px', color: isActive ? textColor : 'var(--text3)' }}>{type.description}</div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Saved Entries
            </div>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '999px',
                border: '1px solid var(--border)',
                color: 'var(--text2)',
                background: 'var(--bg3)',
              }}
            >
              {entriesForType.length}
            </span>
          </div>

          <div style={{ overflowY: 'auto', padding: '0 10px 14px', flex: 1 }}>
            {loading ? (
              <div style={{ color: 'var(--text3)', fontSize: '12px', padding: '12px' }}>Loading entries...</div>
            ) : entriesForType.length === 0 ? (
              <div style={{ color: 'var(--text3)', fontSize: '13px', padding: '12px' }}>No entries yet</div>
            ) : (
              entriesForType.map((entry) => {
                const entryId = entry.id || `${entry.journal_type}:${entry.period_key}`
                const expanded = Boolean(expandedEntryIds[entryId])
                const preview = getPreviewText(entry.content)
                return (
                  <div
                    key={entryId}
                    onMouseEnter={() => setHoveredEntryId(entryId)}
                    onMouseLeave={() => setHoveredEntryId(null)}
                    style={{
                      position: 'relative',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      marginTop: '8px',
                      overflow: 'hidden',
                      background: expanded ? 'var(--bg3)' : 'transparent',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedEntryIds((prev) => ({
                          ...prev,
                          [entryId]: !prev[entryId],
                        }))
                      }
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: '8px',
                        width: '100%',
                        border: 'none',
                        background: 'transparent',
                        color: 'inherit',
                        textAlign: 'left',
                        padding: '10px 10px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '3px' }}>
                          {formatSidebarLabel(entry.journal_type, entry.period_key)}
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            color: 'var(--text3)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {preview || 'Empty entry'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: 'var(--text3)', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                          ›
                        </span>
                      </div>
                    </button>

                    {hoveredEntryId === entryId ? (
                      <button
                        type="button"
                        aria-label="Delete entry"
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleDeleteEntry(entry.id)
                        }}
                        style={{
                          position: 'absolute',
                          top: '10px',
                          right: '10px',
                          border: 'none',
                          width: '18px',
                          height: '18px',
                          lineHeight: '16px',
                          borderRadius: '999px',
                          background: 'rgba(239,68,68,0.14)',
                          color: '#EF4444',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        ×
                      </button>
                    ) : null}

                    {expanded ? (
                      <div
                        style={{
                          borderTop: '1px solid var(--border)',
                          padding: '10px',
                          fontSize: '12px',
                          color: 'var(--text2)',
                        }}
                        dangerouslySetInnerHTML={{ __html: entry.content || '<p style="color:var(--text3)">Empty entry</p>' }}
                      />
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </aside>

        <main style={{ background: 'var(--page-bg)', padding: '26px 24px 20px', overflowY: 'auto' }}>
          <div style={{ maxWidth: '720px', margin: '0 auto', minHeight: 'calc(100vh - 130px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '11px', fontFamily: 'monospace', letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text3)' }}>
              {typeMeta.shortLabel}
            </div>
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: 'var(--text)' }}>{titleText}</h2>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => handlePeriodNav(-1)}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '7px',
                    padding: '6px 10px',
                    background: 'var(--bg2)',
                    color: 'var(--text2)',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  {navLabels.prev}
                </button>
                <button
                  type="button"
                  onClick={handleCurrentPeriod}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '7px',
                    padding: '6px 10px',
                    background: 'transparent',
                    color: 'var(--text3)',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  {navLabels.current}
                </button>
                <button
                  type="button"
                  onClick={() => handlePeriodNav(1)}
                  disabled={!canGoNext}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '7px',
                    padding: '6px 10px',
                    background: canGoNext ? 'var(--bg2)' : 'transparent',
                    color: canGoNext ? 'var(--text2)' : 'var(--text3)',
                    cursor: canGoNext ? 'pointer' : 'not-allowed',
                    fontSize: '12px',
                    opacity: canGoNext ? 1 : 0.6,
                  }}
                >
                  {navLabels.next}
                </button>
              </div>
            </div>
            <div style={{ borderBottom: '1px solid var(--border)', marginTop: '12px' }} />

            {pendingAction ? (
              <div
                style={{
                  marginTop: '12px',
                  border: `1px solid ${accent}55`,
                  background: `${accent}14`,
                  color: 'var(--text2)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: '13px' }}>You have unsaved changes — Save or Discard?</span>
                <div style={{ display: 'inline-flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => void onSavePendingAndContinue()}
                    style={{
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      background: accent,
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={onDiscardAndContinue}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      background: 'transparent',
                      color: 'var(--text2)',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ) : null}

            <div style={{ borderBottom: '1px solid var(--border)', padding: '8px 0', marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {toolbarButton('B', () => applyCommand('bold'))}
              {toolbarButton('I', () => applyCommand('italic'))}
              {toolbarButton('U', () => applyCommand('underline'))}
              {toolbarButton('•', () => applyCommand('insertUnorderedList'))}
              {toolbarButton('1.', () => applyCommand('insertOrderedList'))}
              {toolbarButton('H', () => applyCommand('formatBlock', '<h2>'))}
              {toolbarButton('—', () => applyCommand('insertHorizontalRule'))}
              {toolbarButton('Clear', () => applyCommand('removeFormat'))}
            </div>

            <div
              style={{
                marginTop: '10px',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                background: 'var(--card-bg)',
                flex: 1,
                minHeight: '420px',
                boxShadow: 'inset 0 0 0 1px transparent',
              }}
            >
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
                className="journal-editor"
                data-placeholder={placeholder}
                data-empty={isEditorVisuallyEmpty ? 'true' : 'false'}
                style={{
                  height: '100%',
                  minHeight: '420px',
                  outline: 'none',
                  padding: '40px 60px',
                  fontFamily: 'Georgia, serif',
                  fontSize: '16px',
                  lineHeight: 1.8,
                  color: 'var(--text)',
                  position: 'relative',
                }}
              />
            </div>

            <div
              style={{
                borderTop: '1px solid var(--border)',
                marginTop: '14px',
                paddingTop: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', gap: '14px', color: 'var(--text3)', fontSize: '12px' }}>
                <span>{wordCount} words</span>
                <span>{characterCount} characters</span>
                <span key={refreshTick}>{savedFlash ? '✓ Saved' : formatRelativeSaved(lastSavedAt)}</span>
              </div>
              <button
                type="button"
                onClick={() => void runSave()}
                disabled={isSaving}
                style={{
                  border: 'none',
                  borderRadius: '9px',
                  padding: '10px 16px',
                  background: accent,
                  color: 'white',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  opacity: isSaving ? 0.8 : 1,
                }}
              >
                {isSaving ? 'Saving...' : 'Save Entry'}
              </button>
            </div>
          </div>
        </main>
      </div>

      <style jsx>{`
        .journal-editor {
          transition: box-shadow 0.15s ease, border-color 0.15s ease;
          border-radius: 12px;
        }

        .journal-editor:focus {
          box-shadow: 0 0 0 2px var(--accent-subtle);
        }

        .journal-editor[data-empty='true']::before {
          content: attr(data-placeholder);
          color: var(--text3);
          white-space: pre-line;
          pointer-events: none;
          position: absolute;
          top: 40px;
          left: 60px;
          right: 60px;
        }
      `}</style>
    </div>
  )
}
