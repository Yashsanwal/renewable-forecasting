import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { Card, Chip, Kpi, Tip } from './ui'
import { fmtDay, hh, mw, pct, signed } from './format'

const gw = (v) => (v / 1000).toFixed(0)
const gwTick = (v) => (v / 1000).toFixed(1) + ' GW'

export default function AccuracyView({ acc, colors, onPickDay }) {
  const [showBias, setShowBias] = useState(true)
  if (!acc) return <div className="skeleton" />

  const s = acc.summary, bt = acc.band_backtest, bc = acc.bias_correction
  const daily = acc.daily.map((d) => ({ ...d, label: fmtDay(d.day, { day: 'numeric', month: 'short' }) }))
  const hist = acc.histogram.map((h) => ({ ...h, label: gw(h.from) }))
  const hours = acc.by_hour.map((h) => ({ ...h, label: hh(h.hour) }))
  const horizon = acc.horizon.map((h) => ({ ...h, label: `${h.from_h}–${h.to_h}h` }))
  const lim = Math.ceil(Math.max(...acc.scatter.map((p) => Math.max(p.forecast, p.actual))) / 5000) * 5000
  const ticks = Array.from({ length: lim / 5000 + 1 }, (_, i) => i * 5000)
  const axis = { fontSize: 12, stroke: colors.axis, tickLine: false }
  const grid = <CartesianGrid stroke={colors.grid} vertical={false} />

  return (
    <>
      <div className="callout warn">
        <b>Headline:</b> across {s.n} hourly decisions, the day-ahead wind forecast over-estimated outturn by <b>{mw(s.bias)} MW</b> on average
        ({pct(s.pct_over_forecast, 0)} of hours). In 1 hour in 20 the shortfall exceeded <b>{mw(s.err_p95)} MW</b> — plan cover for that, not just the average miss of {mw(s.mae)} MW.
      </div>

      <div className="kpis">
        <Kpi label="MAE" num={s.mae} unit="MW" sub={`${pct(s.wmape)} of average wind (${mw(s.mean_actual)} MW)`} tone="info" />
        <Kpi label="RMSE" num={s.rmse} unit="MW" sub="penalises large misses" tone="info" />
        <Kpi label="Bias (fcst − actual)" num={s.bias} fmt={signed} unit="MW" sub={`MAE without bias: ${mw(s.mae_debiased)} MW`} tone="warn" />
        <Kpi label="Shortfall risk (P95)" num={s.err_p95} unit="MW" sub={`P90 ${mw(s.err_p90)} · max ${mw(s.max_abs)}`} tone="warn" />
        <Kpi label="Bias-corrected MAE" num={bc.mae_corrected} unit="MW" sub={`vs ${mw(bc.mae_raw)} raw · ${pct(bc.mae_improvement, 0)} better out-of-sample`} tone="ok" />
        <Kpi label="Beats naive persistence" num={s.skill_vs_naive * 100} fmt={(v) => v.toFixed(0) + '%'} unit="lower MAE" sub={`naive MAE ${mw(s.naive_mae)} MW`} tone="ok" />
        <Kpi label="80% band reliability" num={bt.observed * 100} fmt={(v) => v.toFixed(0) + '%'} unit="of hours inside" sub={`target 80% · n=${bt.n}`} tone="ok" />
      </div>

      <div className="grid">
        <Card wide title="Forecast error by delivery day" note="Click a bar to open that day in the decision view."
          right={<div className="chips"><Chip on color={colors.forecast}>MAE</Chip><Chip on={showBias} color={colors.bias} onClick={() => setShowBias(!showBias)}>Bias</Chip></div>}>
          <div className="clickable">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={daily}>
                {grid}
                <XAxis dataKey="label" interval={1} {...axis} />
                <YAxis tickFormatter={gwTick} {...axis} axisLine={false} />
                <Tooltip content={<Tip title={(l) => l} />} cursor={{ fill: colors.grid, opacity: 0.5 }} />
                <ReferenceLine y={0} stroke={colors.ref} />
                <Bar isAnimationActive={false} dataKey="mae" name="MAE" fill={colors.forecast} radius={[4, 4, 0, 0]}
                  onClick={(d) => onPickDay((d.payload ?? d).day)} />
                {showBias && <Line isAnimationActive={false} dataKey="bias" name="Bias" stroke={colors.bias} strokeWidth={2} dot={{ r: 2.5 }} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Distribution of errors" note="Hours by size of miss (1 GW bins, forecast − actual). The right tail is where extra purchases are needed.">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={hist}>
              {grid}
              <XAxis dataKey="label" {...axis} label={{ value: 'error bin start (GW)', position: 'insideBottom', offset: -2, fontSize: 12, fill: colors.axis }} height={40} />
              <YAxis {...axis} axisLine={false} />
              <Tooltip content={<Tip fmt={(v) => `${v} hours`} title={(l) => `${l} to ${+l + 1} GW`} />} cursor={{ fill: colors.grid, opacity: 0.5 }} />
              <ReferenceLine x="0" stroke={colors.ref} />
              <Bar isAnimationActive={false} dataKey="count" name="Hours" fill={colors.forecast} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Forecast vs actual" note="Each dot is a delivery hour; below the diagonal = over-forecast. Note actuals plateau near 17–18 GW.">
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ left: 8, bottom: 8 }}>
              <CartesianGrid stroke={colors.grid} />
              <XAxis type="number" dataKey="forecast" name="Forecast" domain={[0, lim]} ticks={ticks} tickFormatter={gw} {...axis} height={40}
                label={{ value: 'forecast (GW)', position: 'insideBottom', offset: -2, fontSize: 12, fill: colors.axis }} />
              <YAxis type="number" dataKey="actual" name="Actual" domain={[0, lim]} ticks={ticks} tickFormatter={gw} {...axis} axisLine={false} />
              <ZAxis range={[22, 22]} />
              <Tooltip content={<Tip title={() => 'Hour'} />} cursor={{ strokeDasharray: '3 3' }} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: lim, y: lim }]} stroke={colors.ref} strokeDasharray="4 4" />
              <Scatter isAnimationActive={false} data={acc.scatter} fill={colors.forecast} fillOpacity={0.45} />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Error by hour of day" note="Does accuracy depend on the hour being bought?">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={hours}>
              {grid}
              <XAxis dataKey="label" interval={2} {...axis} />
              <YAxis tickFormatter={gwTick} {...axis} axisLine={false} />
              <Tooltip content={<Tip />} cursor={{ fill: colors.grid, opacity: 0.5 }} />
              <Bar isAnimationActive={false} dataKey="mae" name="MAE" fill={colors.forecast} radius={[3, 3, 0, 0]} />
              <Line isAnimationActive={false} dataKey="bias" name="Bias" stroke={colors.bias} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Error by forecast lead time" note="Every WINDFOR issue, bucketed by how far ahead of delivery it was published. Day-ahead decisions use roughly 14–38h.">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={horizon}>
              {grid}
              <XAxis dataKey="label" fontSize={11} stroke={colors.axis} tickLine={false} />
              <YAxis tickFormatter={gwTick} {...axis} axisLine={false} />
              <Tooltip content={<Tip title={(l) => `Lead ${l}`} />} cursor={{ fill: colors.grid, opacity: 0.5 }} />
              <Bar isAnimationActive={false} dataKey="mae" name="MAE" fill={colors.forecast} radius={[3, 3, 0, 0]} />
              <Line isAnimationActive={false} dataKey="bias" name="Bias" stroke={colors.bias} strokeWidth={2} dot={{ r: 2.5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </>
  )
}
