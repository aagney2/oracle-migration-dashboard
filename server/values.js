/** Readers for Kelsa custom-field values, which arrive as strings, numbers, {id,name} objects or arrays. */

export function label(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v.trim().replace(/\s+/g, ' ') || null
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) {
    const parts = v.map(label).filter(Boolean)
    return parts.length ? parts.join(', ') : null
  }
  if (typeof v === 'object') return label(v.name ?? v.label ?? v.value ?? v.file_name ?? v.filename ?? null)
  return null
}

/** The value exactly as stored (untrimmed), which is what a Kelsa search compares against. */
export function rawLabel(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v === '' ? null : v
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) return v.length ? v.map(rawLabel).filter((x) => x !== null).join(', ') : null
  if (typeof v === 'object') return rawLabel(v.name ?? v.label ?? v.value ?? null)
  return null
}

export function num(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = label(v)
  if (s === null) return null
  const cleaned = s.replace(/,/g, '').trim()
  if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function attachments(v) {
  const list = Array.isArray(v) ? v : v ? [v] : []
  return list
    .map((a) => (typeof a === 'string' ? { name: a.split('/').pop() || a } : { name: label(a?.file_name ?? a?.filename ?? a?.name ?? a?.title ?? null) ?? 'Attachment' }))
    .filter((a) => a.name)
}

/** Free text compared for grouping and version matching: trimmed, whitespace collapsed, case-folded. */
export function normKey(s) {
  return (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Option comparison also ignores dash style and spacing around dashes ("Completed–No Finding" = "Completed - No Finding"). */
export function canonOption(s) {
  return normKey(String(s ?? ''))
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Maps a stored value onto one of the expected options.
 * Returns { value, raw, status } where status is 'empty', 'exact', 'normalised' or 'unrecognised'.
 */
export function matchOption(rawValue, options) {
  const raw = label(rawValue)
  if (raw === null) return { value: null, raw: null, status: 'empty' }
  const exact = options.find((o) => o === raw)
  if (exact) return { value: exact, raw, status: 'exact' }
  const c = canonOption(raw)
  const loose = options.find((o) => canonOption(o) === c)
  if (loose) return { value: loose, raw, status: 'normalised' }
  if (options.includes('Yes') && options.includes('No')) {
    if (/^(y|yes|true|1)$/i.test(raw)) return { value: 'Yes', raw, status: 'normalised' }
    if (/^(n|no|false|0)$/i.test(raw)) return { value: 'No', raw, status: 'normalised' }
  }
  return { value: raw, raw, status: 'unrecognised' }
}

/** "C101, C102  C103;C104" → ['C101', 'C102', 'C103', 'C104'], de-duplicated in order. */
export function splitIds(v) {
  const s = label(v)
  if (!s) return []
  const seen = new Set()
  const out = []
  for (const part of s.split(/[\s,;|]+/)) {
    const id = part.trim()
    if (!id) continue
    const k = id.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(id)
  }
  return out
}

/** Calendar date in IST (YYYY-MM-DD) for a timestamp. */
export function istDate(iso) {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return new Date(t + 330 * 60_000).toISOString().slice(0, 10)
}
