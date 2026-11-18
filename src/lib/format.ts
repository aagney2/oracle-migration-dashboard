import { FRACTION_BELOW } from './config'

export const TZ = 'Asia/Kolkata'
export const DAY_MS = 86_400_000

export function fmtNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

export function fmtSigned(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return n > 0 ? `+${fmtNumber(n)}` : fmtNumber(n)
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00+05:30`) : new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ })
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ })
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
}

/** "0.4 days", "3 days", "12 days". */
export function fmtDays(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) return '—'
  if (days < 1) return `${Math.max(0.1, Math.round(days * 10) / 10)} days`
  const v = days < 10 ? Math.round(days * 10) / 10 : Math.round(days)
  return `${v} ${v === 1 ? 'day' : 'days'}`
}

export function daysSince(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null
  return (now.getTime() - new Date(iso).getTime()) / DAY_MS
}

export function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  return (new Date(b).getTime() - new Date(a).getTime()) / DAY_MS
}

/** IST calendar date (YYYY-MM-DD) for a timestamp. */
export function istDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10)
}

export function addDaysIso(isoDate: string, n: number): string {
  return new Date(new Date(`${isoDate}T12:00:00+05:30`).getTime() + n * DAY_MS + 330 * 60_000).toISOString().slice(0, 10)
}

/** Axis with round steps (1, 2, 2.5, 5 × 10ⁿ) and at most 4 intervals covering `v`. */
export function niceScale(v: number): { max: number; ticks: number[] } {
  if (!(v > 0)) return { max: 1, ticks: [0, 1] }
  const raw = v / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const steps = pow >= 10 ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10]
  const step = steps.map((k) => k * pow).find((s) => s >= raw)!
  const unit = Math.max(step, v <= 5 ? 1 : 0)
  const max = Math.ceil(v / unit) * unit
  return { max, ticks: Array.from({ length: Math.round(max / unit) + 1 }, (_, i) => i * unit) }
}

/** "3 of 4" below the fraction threshold, otherwise "75%". */
export function fmtShare(part: number, whole: number): string {
  if (whole === 0) return '—'
  if (whole < FRACTION_BELOW) return `${part} of ${whole}`
  return `${Math.round((part / whole) * 100)}%`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${fmtNumber(n)} ${n === 1 ? one : many}`
}

export function median(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

/** Free text: trim, collapse whitespace, compare case-insensitively. */
export function normKey(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}
