export function Kpi({ label, value, unit, sub, tone }) {
  return (
    <div className={`kpi ${tone || ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}<span className="kpi-unit">{unit}</span></div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

export function Card({ title, note, children, wide }) {
  return (
    <section className={`card ${wide ? 'wide' : ''}`}>
      <h3>{title}</h3>
      {note && <p className="note">{note}</p>}
      {children}
    </section>
  )
}

export const COLORS = {
  forecast: '#2563eb', actual: '#16a34a', band: '#93c5fd', firm: '#dc2626',
  bias: '#f59e0b', grid: '#e5e7eb', muted: '#9ca3af',
}
