import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { buildReleaseCalendarIndex, formatReleaseDate } from '../../utils/releaseHistory'

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function dateKey(year, month, day) {
  return `${monthKey(year, month)}-${String(day).padStart(2, '0')}`
}

export default function ReleaseDatePicker({ entries, value, onChange }) {
  const rootRef = useRef(null)
  const { dates, years, monthsByYear } = useMemo(() => buildReleaseCalendarIndex(entries), [entries])
  const availableDates = useMemo(() => new Set(dates), [dates])
  const availableMonths = useMemo(() => [...new Set(dates.map(date => date.slice(0, 7)))], [dates])
  const latest = value || dates.at(-1) || ''
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('day')
  const [cursorYear, setCursorYear] = useState(() => Number(latest.slice(0, 4)) || new Date().getFullYear())
  const [cursorMonth, setCursorMonth] = useState(() => Number(latest.slice(5, 7)) || new Date().getMonth() + 1)

  useEffect(() => {
    if (!open) return
    const source = value || dates.at(-1)
    if (!source) return
    setCursorYear(Number(source.slice(0, 4)))
    setCursorMonth(Number(source.slice(5, 7)))
  }, [open, value, dates])

  useEffect(() => {
    const closeOnOutsideClick = event => {
      if (open && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = event => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const currentMonthKey = monthKey(cursorYear, cursorMonth)
  const currentMonthIndex = availableMonths.indexOf(currentMonthKey)
  const firstWeekday = new Date(cursorYear, cursorMonth - 1, 1).getDay()
  const lastDay = new Date(cursorYear, cursorMonth, 0).getDate()

  const moveMonth = offset => {
    const nextKey = availableMonths[currentMonthIndex + offset]
    if (!nextKey) return
    setCursorYear(Number(nextKey.slice(0, 4)))
    setCursorMonth(Number(nextKey.slice(5, 7)))
    setView('day')
  }

  const chooseYear = year => {
    const months = [...(monthsByYear.get(year) || [])].sort((a, b) => a - b)
    setCursorYear(year)
    if (!months.includes(cursorMonth)) setCursorMonth(months.at(-1))
    setView('month')
  }

  const chooseMonth = month => {
    setCursorMonth(month)
    setView('day')
  }

  const selectDate = date => {
    onChange(date)
    setOpen(false)
  }

  return (
    <div className="rh-datepicker" ref={rootRef}>
      <span className="rh-field-label" id="rh-date-label">날짜</span>
      <button
        type="button"
        className="rh-date-trigger"
        aria-labelledby="rh-date-label rh-date-value"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setView('day')
          setOpen(current => !current)
        }}
      >
        <span id="rh-date-value">{formatReleaseDate(value)}</span>
        <CalendarDays size={16} aria-hidden="true" />
      </button>

      {open && (
        <div className="rh-calendar" role="dialog" aria-label="업데이트 날짜 선택">
          <div className="rh-calendar-head">
            <button
              type="button"
              className="rh-calendar-nav"
              aria-label="이전 업데이트 월"
              disabled={view !== 'day' || currentMonthIndex <= 0}
              onClick={() => moveMonth(-1)}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <div className="rh-calendar-period">
              <button type="button" aria-label={`연도 선택: ${cursorYear}년`} onClick={() => setView('year')}>{cursorYear}년</button>
              <button type="button" aria-label={`월 선택: ${cursorMonth}월`} onClick={() => setView('month')}>{cursorMonth}월</button>
            </div>
            <button
              type="button"
              className="rh-calendar-nav"
              aria-label="다음 업데이트 월"
              disabled={view !== 'day' || currentMonthIndex < 0 || currentMonthIndex >= availableMonths.length - 1}
              onClick={() => moveMonth(1)}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>

          {view === 'year' && (
            <div className="rh-calendar-option-grid rh-calendar-year-grid" aria-label="연도 목록">
              {years.map(year => (
                <button
                  type="button"
                  key={year}
                  className={year === cursorYear ? 'is-current' : ''}
                  aria-label={`${year}년으로 이동`}
                  onClick={() => chooseYear(year)}
                >
                  {year}
                </button>
              ))}
            </div>
          )}

          {view === 'month' && (
            <div className="rh-calendar-option-grid" aria-label={`${cursorYear}년 월 목록`}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map(month => {
                const enabled = monthsByYear.get(cursorYear)?.has(month)
                return (
                  <button
                    type="button"
                    key={month}
                    className={month === cursorMonth ? 'is-current' : ''}
                    aria-label={`${month}월로 이동`}
                    disabled={!enabled}
                    onClick={() => chooseMonth(month)}
                  >
                    {month}월
                  </button>
                )
              })}
            </div>
          )}

          {view === 'day' && (
            <>
              <div className="rh-calendar-weekdays" aria-hidden="true">
                {'일월화수목금토'.split('').map(day => <span key={day}>{day}</span>)}
              </div>
              <div className="rh-calendar-days">
                {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}
                {Array.from({ length: lastDay }, (_, index) => index + 1).map(day => {
                  const date = dateKey(cursorYear, cursorMonth, day)
                  const enabled = availableDates.has(date)
                  return (
                    <button
                      type="button"
                      key={date}
                      className={value === date ? 'is-selected' : ''}
                      disabled={!enabled}
                      aria-label={enabled ? `${cursorYear}년 ${cursorMonth}월 ${day}일 업데이트 선택` : `${cursorYear}년 ${cursorMonth}월 ${day}일, 업데이트 없음`}
                      onClick={() => selectDate(date)}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          <button
            type="button"
            className="rh-calendar-all"
            onClick={() => selectDate('')}
          >
            전체 날짜 보기
          </button>
        </div>
      )}
    </div>
  )
}
