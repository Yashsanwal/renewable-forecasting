import { useEffect, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getDay } from './api'
import { COLORS, Card, Kpi } from './ui'
import { fmtDT, fmtDay, hh, mw, signed } from './format'

const tick = (v) => (v / 1000).toFixed(0) + ' GW'

export default function DayView({ meta, cutoff, day, setDay }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    setErr(null)
    getDay(day, cutoff).then(setData).catch((e) => setErr(e.message))
  }, [day, cutoff])

  if (err) return <div className="error">{err}</div>
  if (!data) return <div className="loading">Loading…</div>

  const rows = data.rows.map((r) => ({ ...r, label: hh(r.hour), range: [r.lo, r.hi] }))
  const avgF = rows.reduce((s, r) => s + r.forecast, 0) / rows.length
  const avgFirm = rows.reduce((s, r) => s + r.firm95, 0) / rows.length
  const avgCor = rows.reduce((s, r) => s + r.corrected, 0) / rows.length
  const peak = rows.reduce((a, b) => (b.forecast > a.forecast ? b : a))
  const m = data.metrics
  const b = data.band

  // Forecast revisions chart: one column per hour, one series per publish
  const revSeries = data.revisions.map((r, i) => ({ ...r, key: `p${i}` }))
  const revRows = rows.map((r) => {
    const o = { label: r.label }
    revSeries.forEach((s) => (o[s.key] = s.values[r.hour]))
    o.actual = r.actual
    return o
  })
  const decisionKey = revSeries.filter((s) => !s.after_cutoff).slice(-1)[0]?.key

  return (
    <>
      <div className="callout">
        Decision for <b>{fmtDay(data.date, { weekday: 'long', day: 'numeric', month: 'long' })}</b> is made on{' '}
        <b>{fmtDT(data.cutoff_time)}</b>. The latest forecast available then was published{' '}
        <b>{fmtDT(data.decision_publish)}</b>.
      </div>

      <div className="kpis">
        <Kpi label="Avg forecast wind" value={mw(avgF)} unit="MW" sub={`Peak ${mw(peak.forecast)} MW at ${peak.label}`} tone="info" />
        <Kpi label="Bias-corrected forecast" value={mw(avgCor)} unit="MW" sub={`forecast minus the ${mw(b.mean_err)} MW average miss of prior days`} />
        <Kpi label="Wind to rely on (95%)" value={mw(avgFirm)} unit="MW" sub={`≈ ${mw(avgF - avgFirm)} MW below forecast on average`} tone="warn" />
        <Kpi label="Typical shortfall risk" value={mw(b.p95_err)} unit="MW" sub={`95th pct. over-forecast, ${b.history_days} days of history`} />
        <Kpi label="Outturn vs forecast" value={signed(m.bias)} unit="MW" sub={`MAE ${mw(m.mae)} MW — day average error`} tone={m.bias > 0 ? 'warn' : 'ok'} />
      </div>
      {b.in_sample && (
        <div className="callout warn">Early in the window there is too little prior outturn history, so this band uses the whole of January (in-sample).</div>
      )}

      <div className="grid">
        <Card wide title="Forecast at decision time vs what happened"
          note={`Shaded: 80% range from the last ${b.history_days} days of observed errors. Purple: forecast with the recent average over-forecast removed. Red dashed: wind you can rely on with ~95% confidence.`}>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={rows}>
              <CartesianGrid stroke={COLORS.grid} />
              <XAxis dataKey="label" interval={1} fontSize={12} />
              <YAxis tickFormatter={tick} fontSize={12} />
              <Tooltip formatter={(v) => (Array.isArray(v) ? `${mw(v[0])} – ${mw(v[1])} MW` : `${mw(v)} MW`)} />
              <Legend />
              <Area isAnimationActive={false} dataKey="range" name="80% range" fill={COLORS.band} stroke="none" fillOpacity={0.45} />
              <Line isAnimationActive={false} dataKey="forecast" name="Forecast at cutoff" stroke={COLORS.forecast} strokeWidth={2.5} dot={false} />
              <Line isAnimationActive={false} dataKey="corrected" name="Bias-corrected forecast" stroke="#7c3aed" strokeWidth={2} dot={false} />
              <Line isAnimationActive={false} dataKey="firm95" name="Reliable wind (95%)" stroke={COLORS.firm} strokeDasharray="5 4" dot={false} />
              <Line isAnimationActive={false} dataKey="actual" name="Actual (outturn)" stroke={COLORS.actual} strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card title="How the forecast evolved" note="Earlier issues in grey, the decision forecast in blue, issues published after the cutoff dashed — you would not have had those.">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={revRows}>
              <CartesianGrid stroke={COLORS.grid} />
              <XAxis dataKey="label" interval={3} fontSize={12} />
              <YAxis tickFormatter={tick} fontSize={12} />
              <Tooltip formatter={(v) => `${mw(v)} MW`} labelFormatter={(l) => l} />
              {revSeries.map((s) => (
                <Line isAnimationActive={false} key={s.key} dataKey={s.key} name={`Issued ${fmtDT(s.publish)}`} dot={false} connectNulls
                  stroke={s.key === decisionKey ? COLORS.forecast : COLORS.muted}
                  strokeWidth={s.key === decisionKey ? 3 : 1.2}
                  strokeDasharray={s.after_cutoff ? '4 3' : undefined} />
              ))}
              <Line isAnimationActive={false} dataKey="actual" name="Actual" stroke={COLORS.actual} strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Hour by hour" note="Error = forecast − actual. Red = wind over-forecast (extra power to buy).">
          <div className="scroll">
            <table className="t">
              <thead><tr><th>Hour</th><th>Forecast</th><th>80% range</th><th>Corrected</th><th>Reliable</th><th>Actual</th><th>Error</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.hour}>
                    <td>{r.label}</td><td>{mw(r.forecast)}</td><td>{mw(r.lo)} – {mw(r.hi)}</td>
                    <td>{mw(r.corrected)}</td><td>{mw(r.firm95)}</td><td>{mw(r.actual)}</td>
                    <td className={r.error > 0 ? 'pos' : 'neg'}>{signed(r.error)}</td>
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
