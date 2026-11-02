import { useEffect, useRef, useState } from 'react'
import { fmtDay, mw } from './format'

// Chart colours per theme. Series identity is fixed (never cycled); status colours stay reserved.
export const PALETTE = {
  light: { forecast: '#2563eb', corrected: '#7c3aed', actual: '#15803d', firm: '#dc2626', band: '#93c5fd',
           bias: '#d97706', grid: '#e2e8f0', axis: '#64748b', ref: '#94a3b8', muted: '#cbd5e1' },
  dark:  { forecast: '#60a5fa', corrected: '#a78bfa', actual: '#4ade80', firm: '#f87171', band: '#3b82f6',
           bias: '#fbbf24', grid: '#243044', axis: '#94a3b8', ref: '#64748b', muted: '#475569' },
}

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Eases a number toward `value`; snaps instantly under reduced motion.
export function useCountUp(value, ms = 700) {
  const [v, setV] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (value == null || reduced()) { setV(value); from.current = value; return }
    const start = performance.now(), a = from.current ?? 0
    let raf
    const tick = (t) => {
      const p = Math.min(1, (t - start) / ms)
      setV(a + (value - a) * (1 - Math.pow(1 - p, 4)))
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return v
}

export function Kpi({ label, num, fmt = (x) => mw(x), unit, sub, tone, hint }) {
  const v = useCountUp(num)
  return (
    <div className={`kpi ${tone || ''}`} title={hint}>
      <div className="eyebrow">{label}</div>
      <div className="kpi-value">{num == null ? '–' : fmt(v)}<span className="kpi-unit">{unit}</span></div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

export function Card({ title, note, children, wide, right }) {
  return (
    <section className={`card ${wide ? 'wide' : ''}`}>
      <div className="card-head">
        <div><h3>{title}</h3>{note && <p className="note">{note}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  )
}

// Legend chip that doubles as a series toggle.
export function Chip({ on, color, onClick, children, dashed }) {
  return (
    <button className={`chip ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on}>
      <span className="swatch" style={{ background: dashed ? 'transparent' : color, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }} />
      {children}
    </button>
  )
}

export function Tip({ active, payload, label, fmt = (v) => `${mw(v)} MW`, title }) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => p.value != null && p.name !== 'hover')
  return (
    <div className="tip">
      <div className="tip-title">{title ? title(label) : label}</div>
      {rows.map((p) => (
        <div className="tip-row" key={p.dataKey + p.name}>
          <span className="swatch" style={{ background: p.color || p.stroke || p.fill }} />
          <span className="tip-name">{p.name}</span>
          <b>{Array.isArray(p.value) ? `${mw(p.value[0])} – ${mw(p.value[1])} MW` : fmt(p.value)}</b>
        </div>
      ))}
    </div>
  )
}

// 31-day strip: colour intensity = that day's MAE; click to pick a day. Arrow keys move through it.
export function DayStrip({ days, selected, onPick }) {
  const max = Math.max(...days.map((d) => d.mae))
  return (
    <div className="strip" role="listbox" aria-label="Delivery day, shaded by forecast error">
      {days.map((d) => {
        const a = 0.12 + 0.78 * (d.mae / max)
        return (
          <button key={d.day} role="option" aria-selected={d.day === selected}
            className={`strip-cell ${d.day === selected ? 'sel' : ''}`}
            style={{ '--a': a }} onClick={() => onPick(d.day)}
            title={`${fmtDay(d.day)} · MAE ${mw(d.mae)} MW · bias ${d.bias > 0 ? '+' : ''}${mw(d.bias)} MW`}>
            <span className="strip-n">{Number(d.day.slice(8))}</span>
          </button>
        )
      })}
    </div>
  )
}
