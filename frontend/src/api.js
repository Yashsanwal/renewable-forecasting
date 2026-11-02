// Thin fetch wrapper; all endpoints are relative so dev proxy, Docker and Vercel behave the same.
async function get(path, params = {}) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`/api/${path}${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.json()
}
export const getMeta = () => get('meta')
export const getDay = (date, cutoff) => get('day', { date, cutoff })
export const getAccuracy = (cutoff) => get('accuracy', { cutoff })
