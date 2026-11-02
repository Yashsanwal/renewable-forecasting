import { useEffect, useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getDay } from './api'
import { Card, Chip, DayStrip, Kpi, Tip } from './ui'
import { fmtDT, fmtDay, hh, mw, signed } from './format'

const gwTick = (v) => (v / 1000).toFixed(0) + ' GW'
const SERIES = [
  ['band', '80% range'], ['forecast', 'Forecast at cut-off'], ['corrected', 'Bias-corrected'],
  ['reliable', 'Reliable wind'], ['actual', 'Actual'],
]

export default function DayView({ cutoff, day, setDay, step, meta, acc, colors }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [conf, setConf] = useState(95)
  const [hover, setHover] = useState(null)
  const [show, setShow] = useState({ band: true, forecast: true, corrected: true, reliable: true, actual: true })

  useEffect(() => {
    let live = true
    setErr(null)
    getDay(day, cutoff).then((d) => live && setData(d)).catch((e) => live && setErr(e.message))
    return () => { live = false }
  }, [day, cutoff])

  const view = useMemo(() => {
    if (!data) return null
    const q = data.band.quantiles[String(conf)]
    const rows = data.rows.map((r) => ({ ...r, label: hh(r.hour), range: [r.lo, r.hi], reliable: Math.max(0, r.forecast - q) }))
    const n = rows.length
    const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / n
    const peak = rows.reduce((a, b) => (b.forecast > a.forecast ? b : a))
    const series = data.revisions.map((r, i) => ({ ...r, key: `p${i}` }))
    const revRows = rows.map((r) => {
      const o = { label: r.label, actual: r.actual }
      series.forEach((s) => (o[s.key] = s.values[r.hour]))
      return o
    })
    return { q, rows, avgF: avg('forecast'), avgCor: avg('corrected'), avgRel: avg('reliable'), peak, series, revRows,
      decisionKey: series.filter((s) => !s.after_cutoff).slice(-1)[0]?.key }
  }, [data, conf])

  if (err) return <div className="error">{err}</div>
  if (!view) return <div className="skeleton" />
  const { rows, q, series, revRows, decisionKey } = view
  const m = data.metrics, b = data.band
  const idx = meta.delivery_days.indexOf(day)
  const toggle = (k) => setShow((s) => ({ ...s, [k]: !s[k] }))
  const onMove = (s) => setHover(s?.activeLabel ?? null)

  return (
    <>
      <div className="nav">
        <button className="btn" onClick={() => step(-1)} disabled={idx === 0} aria-label="Previous day">←</button>
        <h2>{fmtDay(data.date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        <button className="btn" onClick={() => step(1)} disabled={idx === meta.delivery_days.length - 1} aria-label="Next day">→</button>
        <span className="note">use <kbd>←</kbd> <kbd>→</kbd> to step through days</span>
      </div>
      {acc && <DayStrip days={acc.daily} selected={day} onPick={setDay} />}
      {acc && <div className="strip-legend"><span>Each tile is a delivery day, shaded by forecast error — darker = bigger miss</span><span>Jan 2 → Feb 1</span></div>}

      <div className="callout">
        Decision made <b>{fmtDT(data.cutoff_time)}</b> using the forecast published <b>{fmtDT(data.decision_publish)}</b>.
      </div>

      <div className="kpis">
        <Kpi label="Avg forecast wind" num={view.avgF} unit="MW" sub={`Peak ${mw(view.peak.forecast)} MW at ${view.peak.label}`} tone="info" />
        <Kpi label="Bias-corrected" num={view.avgCor} unit="MW" sub={`forecast − ${mw(b.mean_err)} MW recent average miss`} tone="info" />
        <Kpi label={`Wind to rely on (${conf}%)`} num={view.avgRel} unit="MW" sub={`hold ≈ ${mw(Math.max(q, 0))} MW thermal cover`} tone="warn" />
        <Kpi label="Outturn vs forecast" num={m.bias} fmt={signed} unit="MW" sub={`day MAE ${mw(m.mae)} MW`} tone={m.bias > 0 ? 'warn' : 'ok'} />
      </div>
      {b.in_sample && <div className="callout warn">Too little prior history this early in the window — the band uses all of January (in-sample).</div>}

      <div className="grid">
        <Card wide title="Forecast at decision time vs what happened"
          note={`Band and reliable-wind line are learned from the previous ${b.history_days} days of misses. Hover to link with the table.`}
          right={
            <label className="slider">
              <span className="eyebrow">Confidence</span>
              <input type="range" min="50" max="99" value={conf} onChange={(e) => setConf(+e.target.value)} aria-label="Confidence level for reliable wind" />
              <output>{conf}%</output>
            </label>
          }>
          <div className="chips">
            {SERIES.map(([k, l]) => (
              <Chip key={k} on={show[k]} onClick={() => toggle(k)} dashed={k === 'reliable'}
                color={{ band: colors.band, forecast: colors.forecast, corrected: colors.corrected, reliable: colors.firm, actual: colors.actual }[k]}>{l}</Chip>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={rows} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
              <CartesianGrid stroke={colors.grid} vertical={false} />
              <XAxis dataKey="label" interval={2} fontSize={12} stroke={colors.axis} tickLine={false} />
              <YAxis tickFormatter={gwTick} fontSize={12} stroke={colors.axis} tickLine={false} axisLine={false} />
              <Tooltip content={<Tip />} cursor={{ stroke: colors.ref }} />
              {hover && <ReferenceLine x={hover} stroke={colors.ref} strokeDasharray="3 3" />}
              {show.band && <Area isAnimationActive={false} dataKey="range" name="80% range" fill={colors.band} stroke="none" fillOpacity={0.3} />}
              {show.forecast && <Line isAnimationActive={false} dataKey="forecast" name="Forecast" stroke={colors.forecast} strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />}
              {show.corrected && <Line isAnimationActive={false} dataKey="corrected" name="Bias-corrected" stroke={colors.corrected} strokeWidth={2} dot={false} />}
              {show.reliable && <Line isAnimationActive={false} dataKey="reliable" name={`Reliable (${conf}%)`} stroke={colors.firm} strokeDasharray="5 4" strokeWidth={2} dot={false} />}
              {show.actual && <Line isAnimationActive={false} dataKey="actual" name="Actual" stroke={colors.actual} strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />}
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card title="How the forecast evolved" note="Grey: earlier issues. Blue: the one you had. Dashed: published after your cut-off — not available to you.">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={revRows}>
              <CartesianGrid stroke={colors.grid} vertical={false} />
              <XAxis dataKey="label" interval={3} fontSize={12} stroke={colors.axis} tickLine={false} />
              <YAxis tickFormatter={gwTick} fontSize={12} stroke={colors.axis} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
              <Tooltip content={<Tip />} cursor={{ stroke: colors.ref }} />
              {series.map((s) => (
                <Line key={s.key} isAnimationActive={false} dataKey={s.key} name={`Issued ${fmtDT(s.publish)}`} dot={false} connectNulls
                  stroke={s.key === decisionKey ? colors.forecast : colors.muted} strokeWidth={s.key === decisionKey ? 3 : 1.2}
                  strokeDasharray={s.after_cutoff ? '4 3' : undefined} />
              ))}
              <Line isAnimationActive={false} dataKey="actual" name="Actual" stroke={colors.actual} strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Hour by hour" note="Error = forecast − actual. Red = over-forecast (extra power to buy).">
          <div className="scroll">
            <table className="t">
              <thead><tr><th>Hour</th><th>Forecast</th><th>80% range</th><th>Corrected</th><th>Reliable</th><th>Actual</th><th>Error</th></tr></thead>
              <tbody onMouseLeave={() => setHover(null)}>
                {rows.map((r) => (
                  <tr key={r.hour} className={hover === r.label ? 'hl' : ''} onMouseEnter={() => setHover(r.label)}>
                    <td>{r.label}</td><td>{mw(r.forecast)}</td><td>{mw(r.lo)} – {mw(r.hi)}</td><td>{mw(r.corrected)}</td>
                    <td>{mw(r.reliable)}</td><td>{mw(r.actual)}</td><td className={r.error > 0 ? 'pos' : 'neg'}>{signed(r.error)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  )
}
