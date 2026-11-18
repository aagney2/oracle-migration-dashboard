import { useMemo, useSyncExternalStore } from 'react'
import { istDate, normKey } from './format'
import type { Defect, Migration } from './types'

export const PAGES = [
  { path: 'overview', label: 'Overview' },
  { path: 'validation', label: 'Validation evidence' },
  { path: 'ai-review', label: 'AI review' },
  { path: 'defects', label: 'Defects' },
] as const
export type PagePath = (typeof PAGES)[number]['path']

export const MULTI = ['customer', 'application', 'owner', 'sourceEnv', 'targetEnv', 'stage', 'readiness'] as const
export type MultiKey = (typeof MULTI)[number]
export type FilterKey = MultiKey | 'from' | 'to'

export interface Filters {
  customer: string[]
  application: string[]
  owner: string[]
  sourceEnv: string[]
  targetEnv: string[]
  /** Stage keys. */
  stage: string[]
  readiness: string[]
  from: string | null
  to: string | null
}

export const FILTER_LABELS: Record<MultiKey, string> = {
  customer: 'Customer',
  application: 'Application',
  owner: 'Migration owner',
  sourceEnv: 'Source environment',
  targetEnv: 'Target environment',
  stage: 'Stage',
  readiness: 'Readiness',
}

/** Free-text filters hold normalised keys, so "ASD", "asd " and "Asd" are one value. */
export const TEXT_KEYS = ['customer', 'application', 'owner', 'sourceEnv', 'targetEnv'] as const
export const NONE = '__none__'

export const migrationValue: Record<MultiKey, (m: Migration) => string> = {
  customer: (m) => normKey(m.customer) || NONE,
  application: (m) => normKey(m.application) || NONE,
  owner: (m) => normKey(m.owner) || NONE,
  sourceEnv: (m) => normKey(m.sourceEnv) || NONE,
  targetEnv: (m) => normKey(m.targetEnv) || NONE,
  stage: (m) => m.stageKey ?? NONE,
  readiness: (m) => m.readiness,
}

export const migrationDisplay: Record<(typeof TEXT_KEYS)[number], (m: Migration) => string | null> = {
  customer: (m) => m.customer,
  application: (m) => m.application,
  owner: (m) => m.owner,
  sourceEnv: (m) => m.sourceEnv,
  targetEnv: (m) => m.targetEnv,
}

// ---------------------------------------------------------------------------
// Location store
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
window.addEventListener('popstate', emit)

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}
const snapshot = () => window.location.pathname + window.location.search

export function useLocation() {
  const loc = useSyncExternalStore(subscribe, snapshot)
  return useMemo(() => {
    const url = new URL(loc, window.location.origin)
    const seg = url.pathname.replace(/^\/+|\/+$/g, '') as PagePath
    const page: PagePath = PAGES.some((p) => p.path === seg) ? seg : 'overview'
    return { page, filters: parseFilters(url.searchParams) }
  }, [loc])
}

const validDate = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null)

export function parseFilters(p: URLSearchParams): Filters {
  const f = {} as Filters
  for (const k of MULTI) f[k] = p.getAll(k)
  f.from = validDate(p.get('from'))
  f.to = validDate(p.get('to'))
  return f
}

export function navigate(page: PagePath) {
  const qs = window.location.search
  window.history.pushState(null, '', `/${page === 'overview' ? '' : page}${qs}`)
  emit()
  window.scrollTo({ top: 0 })
}

export function setFilters(update: (f: Filters) => Filters) {
  const next = update(parseFilters(new URLSearchParams(window.location.search)))
  const p = new URLSearchParams()
  for (const k of MULTI) for (const v of next[k]) p.append(k, v)
  if (next.from) p.set('from', next.from)
  if (next.to) p.set('to', next.to)
  const qs = p.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  emit()
}

export function clearAll() {
  setFilters(() => ({ customer: [], application: [], owner: [], sourceEnv: [], targetEnv: [], stage: [], readiness: [], from: null, to: null }))
}

export function anyFilter(f: Filters) {
  return MULTI.some((k) => f[k].length > 0) || Boolean(f.from || f.to)
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

function inRange(iso: string | null, f: Filters) {
  if (!f.from && !f.to) return true
  const d = istDate(iso)
  if (!d) return false
  return (!f.from || d >= f.from) && (!f.to || d <= f.to)
}

export function filterMigrations(ms: Migration[], f: Filters, skip?: FilterKey | FilterKey[]): Migration[] {
  const skipped = new Set(Array.isArray(skip) ? skip : skip ? [skip] : [])
  return ms.filter(
    (m) =>
      MULTI.every((k) => skipped.has(k) || f[k].length === 0 || f[k].includes(migrationValue[k](m))) &&
      (skipped.has('from') || inRange(m.createdAt, f)),
  )
}

const MIGRATION_ONLY: MultiKey[] = ['owner', 'sourceEnv', 'targetEnv', 'stage', 'readiness']

/**
 * Defects filter on their own customer, application and created date, and
 * through their linked migration for owner, environments, stage and readiness.
 * An unlinked defect has no migration to filter through, so those filters hide it.
 */
export function filterDefects(ds: Defect[], f: Filters, migrations: Migration[]): Defect[] {
  const viaMigration = MIGRATION_ONLY.some((k) => f[k].length > 0)
  const allowed = viaMigration ? new Set(filterMigrations(migrations, f, ['customer', 'application', 'from', 'to']).map((m) => m.leadId)) : null
  return ds.filter((d) => {
    if (f.customer.length && !f.customer.includes(normKey(d.customer) || NONE)) return false
    if (f.application.length && !f.application.includes(normKey(d.application) || NONE)) return false
    if (!inRange(d.createdAt, f)) return false
    if (allowed && !d.linkedMigrationIds.some((id) => allowed.has(id))) return false
    return true
  })
}
