import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { getAccuracy } from './api'
import { COLORS, Card, Kpi } from './ui'
import { fmtDay, hh, mw, pct, signed } from './format'

const gw = (v) => (v / 1000).toFixed(0)
const tickStep = 5000

export default function AccuracyView({ cutoff }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    setErr(null)
    getAccuracy(cutoff).then(setData).catch((e) => setErr(e.message))
  }, [cutoff])

  if (err) return <div className="error">{err}</div>
  if (!data) return <div className="loading">Loading…</div>

  const s = data.summary
  const bt = data.band_backtest
  const bc = data.bias_correction
  const daily = data.daily.map((d) => ({ ...d, label: fmtDay(d.day, { day: 'numeric', month: 'short' }) }))
  const hist = data.histogram.map((h) => ({ ...h, label: `${gw(h.from)}` }))
  const hours = data.by_hour.map((h) => ({ ...h, label: hh(h.hour) }))
  const horizon = data.horizon.map((h) => ({ ...h, label: `${h.from_h}–${h.to_h}h` }))
  const lim = Math.ceil(Math.max(...data.scatter.map((p) => Math.max(p.forecast, p.actual))) / 5000) * 5000
  const ticks = Array.from({ length: lim / tickStep + 1 }, (_, i) => i * tickStep)

  return (
    <>
      <div className="callout warn">
        <b>Headline:</b> across {s.n} hourly decisions in January, the day-ahead wind forecast over-estimated outturn by{' '}
        <b>{mw(s.bias)} MW</b> on average ({pct(s.pct_over_forecast, 0)} of hours were over-forecast). In 1 hour in 20 the shortfall exceeded{' '}
        <b>{mw(s.err_p95)} MW</b> — plan thermal cover for that, not just the average miss of {mw(s.mae)} MW.
      </div>

      <div className="kpis">
        <Kpi label="MAE" value={mw(s.mae)} unit="MW" sub={`${pct(s.wmape)} of average wind (${mw(s.mean_actual)} MW)`} tone="info" />
        <Kpi label="RMSE" value={mw(s.rmse)} unit="MW" sub="penalises large misses" tone="info" />
        <Kpi label="Bias (fcst − actual)" value={signed(s.bias)} unit="MW" sub={`MAE after removing bias: ${mw(s.mae_debiased)} MW`} tone="warn" />
        <Kpi label="Shortfall risk (P95)" value={mw(s.err_p95)} unit="MW" sub={`P90 ${mw(s.err_p90)} · max ${mw(s.max_abs)}`} tone="warn" />
        <Kpi label="Bias-corrected MAE" value={mw(bc.mae_corrected)} unit="MW" sub={`vs ${mw(bc.mae_raw)} raw, ${pct(bc.mae_improvement, 0)} better out-of-sample`} tone="ok" />
        <Kpi label="Beats naive persistence" value={pct(s.skill_vs_naive, 0)} unit="lower MAE" sub={`naive MAE ${mw(s.naive_mae)} MW`} tone="ok" />
        <Kpi label="80% band reliability" value={pct(bt.observed, 0)} unit="of hours inside" sub={`target 80%, trailing-history band, n=${bt.n}`} tone="ok" />
      </div>

      <div className="grid">
        <Card wide title="Forecast error by delivery day" note="Bars: mean absolute error. Line: mean signed error (positive = over-forecast). Big-miss days cluster — check the day view for 11–12 Jan and 28 Jan.">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={daily}>
              <CartesianGrid stroke={COLORS.grid} />
              <XAxis dataKey="label" fontSize={11} interval={1} />
              <YAxis tickFormatter={(v) => (v / 1000).toFixed(1) + ' GW'} fontSize={12} />
              <Tooltip formatter={(v) => `${mw(v)} MW`} />
              <Legend />
              <ReferenceLine y={0} stroke="#64748b" />
              <Bar isAnimationActive={false} dataKey="mae" name="MAE" fill={COLORS.forecast} />
              <Line isAnimationActive={false} dataKey="bias" name="Bias" stroke={COLORS.bias} strokeWidth={2} dot={{ r: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Distribution of errors" note="How many hours missed by how much (GW bins, forecast − actual). The right-hand tail is where extra purchases are needed.">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={hist}>
              <CartesianGrid stroke={COLORS.grid} />
              <XAxis dataKey="label" fontSize={12} label={{ value: 'error bin start (GW)', position: 'insideBottom', offset: -2, fontSize: 12 }} height={40} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v) => `${v} hours`} labelFormatter={(l) => `${l} GW to +1 GW`} />
              <ReferenceLine x="0" stroke="#64748b" />
              <Bar isAnimationActive={false} dataKey="count" name="Hours" fill={COLORS.forecast} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Forecast vs actual" note="Each dot is one delivery hour. Dots below the diagonal were over-forecast.">
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ left: 8, bottom: 8 }}>
              <CartesianGrid stroke={COLORS.grid} />
              <XAxis type="number" dataKey="forecast" name="Forecast" domain={[0, lim]} ticks={ticks} tickFormatter={gw} fontSize={12} label={{ value: 'forecast (GW)', position: 'insideBottom', offset: -2, fontSize: 12 }} height={40} />
              <YAxis type="number" dataKey="actual" name="Actual" domain={[0, lim]} ticks={ticks} tickFormatter={gw} fontSize={12} />
              <ZAxis range={[18, 18]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v) => `${mw(v)} MW`} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: lim, y: lim }]} stroke="#64748b" strokeDasharray="4 4" />
              <Scatter isAnimationActive={false} data={data.scatter} fill={COLORS.forecast} fillOpacity={0.45} />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Error by hour of day" note="Does accuracy depend on the time of day being bought?">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={hours}>
              <CartesianGrid stroke={COLORS.grid} />
              <XAxis dataKey="label" interval={2} fontSize={12} />
              <YAxis tickFormatter={(v) => (v / 1000).toFixed(1) + ' GW'} fontSize={12} />
              <Tooltip formatter={(v) => `${mw(v)} MW`} />
              <Legend />
              <Bar isAnimationActive={false} dataKey="mae" name="MAE" fill={COLORS.forecast} />
              <Line isAnimationActive={false} dataKey="bias" name="Bias" stroke={COLORS.bias} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Error by forecast lead time" note="Every WINDFOR issue, bucketed by how far ahead of delivery it was published. Day-ahead decisions use roughly 14–38h.">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={horizon}>
              <CartesianGrid stroke={COLORS.grid} />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis tickFormatter={(v) => (v / 1000).toFixed(1) + ' GW'} fontSize={12} />
              <Tooltip formatter={(v) => `${mw(v)} MW`} />
              <Legend />
              <Bar isAnimationActive={false} dataKey="mae" name="MAE" fill={COLORS.forecast} />
              <Line isAnimationActive={false} dataKey="bias" name="Bias" stroke={COLORS.bias} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </>
  )
}
