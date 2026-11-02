import { useEffect, useState } from 'react'
import { getMeta } from './api'
import DayView from './DayView'
import AccuracyView from './AccuracyView'
import { fmtDay } from './format'

export default function App() {
  const [meta, setMeta] = useState(null)
  const [err, setErr] = useState(null)
  const [tab, setTab] = useState('day')
  const [cutoff, setCutoff] = useState('09:50')
  const [day, setDay] = useState(null)

  useEffect(() => {
    getMeta()
      .then((m) => {
        setMeta(m)
        setCutoff(m.default_cutoff)
        setDay(m.delivery_days[19]) // 21 Jan: mid-window, so trailing error history is available
      })
      .catch((e) => setErr(e.message))
  }, [])

  if (err) return <div className="error">Could not reach the API: {err}</div>
  if (!meta) return <div className="loading">Loading…</div>

  return (
    <>
      <header className="top">
        <h1>Day-Ahead Wind Forecast Desk</h1>
        <p>National wind generation · Elexon FUELHH &amp; WINDFOR · purchase decisions made in January 2026</p>
        <nav className="tabs">
          <button className={`tab ${tab === 'day' ? 'on' : ''}`} onClick={() => setTab('day')}>Tomorrow's decision</button>
          <button className={`tab ${tab === 'acc' ? 'on' : ''}`} onClick={() => setTab('acc')}>Forecast accuracy</button>
        </nav>
      </header>

      <div className="controls">
        <label>
          Decision cut-off (D-1, UK time)
          <input type="time" value={cutoff} onChange={(e) => e.target.value && setCutoff(e.target.value)} />
        </label>
        {tab === 'day' && (
          <label>
            Delivery day
            <select value={day} onChange={(e) => setDay(e.target.value)}>
              {meta.delivery_days.map((d) => (
                <option key={d} value={d}>{fmtDay(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</option>
              ))}
            </select>
          </label>
        )}
        <div className="hint">
          Only forecasts published at or before the cut-off are used, exactly as in a real day-ahead decision. Cut-off defaults to {meta.default_cutoff} (assumed gate closure).
        </div>
      </div>

      <main>
        {tab === 'day' ? <DayView meta={meta} cutoff={cutoff} day={day} setDay={setDay} /> : <AccuracyView cutoff={cutoff} />}
        <details className="assump">
          <summary>Method &amp; assumptions</summary>
          <ul>{meta.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
        </details>
      </main>
      <footer>Data: Elexon Insights Solution (BMRS) · Snapshot of forecasts to {meta.last_forecast_publish.slice(0, 10)}</footer>
    </>
  )
}
