export const mw = (v, d = 0) =>
  v == null ? '–' : v.toLocaleString('en-GB', { maximumFractionDigits: d })
export const signed = (v) => (v == null ? '–' : (v > 0 ? '+' : '') + mw(v))
export const pct = (v, d = 1) => (v == null ? '–' : (v * 100).toFixed(d) + '%')
export const fmtDay = (iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })
export const fmtDT = (iso) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
export const hh = (h) => String(h).padStart(2, '0') + ':00'
