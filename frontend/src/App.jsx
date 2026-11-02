import { useCallback, useEffect, useState } from 'react'
import { getAccuracy, getMeta } from './api'
import DayView from './DayView'
import AccuracyView from './AccuracyView'
import { Chip, PALETTE } from './ui'

const PRESETS = [['07:45', 'Early · 07:30 issue'], ['09:50', 'Default · 09:30 issue'], ['11:50', 'Late · 11:30 issue']]

function initialTheme() {
  try { const t = localStorage.getItem('theme'); if (t) return t } catch { /* private mode */ }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function App() {
  const [meta, setMeta] = useState(null)
  const [acc, setAcc] = useState(null)
  const [err, setErr] = useState(null)
  const [tab, setTab] = useState('day')
  const [cutoff, setCutoff] = useState('09:50')
  const [day, setDay] = useState(null)
  const [theme, setTheme] = useState(initialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('theme', theme) } catch { /* ignore */ }
  }, [theme])

  useEffect(() => {
    getMeta().then((m) => { setMeta(m); setCutoff(m.default_cutoff); setDay(m.delivery_days[19]) }).catch((e) => setErr(e.message))
  }, [])

  // One accuracy fetch feeds the day heat-strip, the accuracy tab and the click-through.
  useEffect(() => {
    if (!meta) return
    let live = true
    getAccuracy(cutoff).then((a) => live && setAcc(a)).catch((e) => live && setErr(e.message))
    return () => { live = false }
  }, [meta, cutoff])

  const step = useCallback((d) => {
    if (!meta) return
    const i = meta.delivery_days.indexOf(day) + d
    if (i >= 0 && i < meta.delivery_days.length) setDay(meta.delivery_days[i])
  }, [meta, day])

  useEffect(() => {
    const onKey = (e) => {
      if (tab !== 'day' || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [tab, step])

  const openDay = (d) => { setDay(d); setTab('day'); scrollTo({ top: 0 }) }

  if (err) return <div className="error">Could not reach the API: {err}</div>
  if (!meta || !day) return <div className="loading">Loading…</div>
  const colors = PALETTE[theme]

  return (
    <>
      <header className="top">
        <div className="top-row">
          <div>
            <h1>Day-Ahead Wind Forecast Desk</h1>
            <p>National wind · Elexon FUELHH &amp; WINDFOR · purchase decisions made in January 2026</p>
          </div>
          <button className="theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode">
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
        </div>
        <nav className="tabs">
          <button className={`tab ${tab === 'day' ? 'on' : ''}`} onClick={() => setTab('day')}>Tomorrow's decision</button>
          <button className={`tab ${tab === 'acc' ? 'on' : ''}`} onClick={() => setTab('acc')}>Forecast accuracy</button>
        </nav>
      </header>

      <div className="controls">
        <label className="field">
          <span className="eyebrow">Decision cut-off (D-1, UK time)</span>
          <input type="time" value={cutoff} onChange={(e) => e.target.value && setCutoff(e.target.value)} />
        </label>
        <div className="field">
          <span className="eyebrow">Presets</span>
          <div className="presets">
            {PRESETS.map(([t, l]) => <Chip key={t} on={cutoff === t} color={colors.forecast} onClick={() => setCutoff(t)}>{l}</Chip>)}
          </div>
        </div>
        <div className="hint">
          Only forecasts published at or before the cut-off are used, as in a real decision. Default {meta.default_cutoff} is an assumed gate closure.
        </div>
      </div>

      <main>
        {tab === 'day'
          ? <DayView cutoff={cutoff} day={day} setDay={setDay} step={step} meta={meta} acc={acc} colors={colors} />
          : <AccuracyView acc={acc} colors={colors} onPickDay={openDay} />}
        <details className="assump">
          <summary>Method &amp; assumptions</summary>
          <ul>{meta.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
        </details>
      </main>
      <footer>Data: Elexon Insights Solution (BMRS) · forecasts to {meta.last_forecast_publish.slice(0, 10)}</footer>
    </>
  )
}
