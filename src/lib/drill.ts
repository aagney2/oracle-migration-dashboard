/**
 * Turns "these records" into a Kelsa list link that shows exactly those records.
 *
 * Kelsa search terms are `;`-separated; a repeated field ORs its values,
 * different fields AND; `:` is a case-insensitive match; `created>=` / `<=`
 * compare IST calendar dates. An unknown field is silently ignored, so every
 * query is simulated against the full record set before it is trusted. Free
 * text fields are simulated as both exact and substring matches, and the link
 * is used only if both give the same records. Otherwise the number opens an
 * in-app list with a link per record.
 */
import { MAX_IDS_PER_LINK } from './config'
import { TEXT_KEYS, type Filters } from './filters'
import { normKey } from './format'
import type { Defect, Migration } from './types'

export type DrillKind = 'migration' | 'defect'
export type Op = ':' | '>=' | '<='
export interface Term {
  field: string
  op: Op
  values: string[]
}

export interface Ctx {
  origin: string
  accountId: number
  migrationPipelineId: number
  defectPipelineId: number
  allMigrations: Migration[]
  allDefects: Defect[]
  stageNames: Record<string, string>
  filters: Filters
}

export type Rec = Migration | Defect

export interface DrillSpec {
  kind: DrillKind
  /** What the number means, used as the list title. */
  title: string
  records: Rec[]
  /** The element's own meaning as Kelsa terms (e.g. stage). Global filters are added automatically. */
  terms?: Term[]
  /** Always open the in-app list (computed values Kelsa can't search). */
  list?: boolean
  /** Global filters don't apply to this element. */
  ignoreFilters?: boolean
}

export type Resolution =
  | { kind: 'none' }
  | { kind: 'url'; url: string; strategy: 'native' | 'values'; query: string }
  | { kind: 'list'; spec: DrillSpec; bulk: { url: string; query: string } | null }

const TEXT_FIELDS = new Set(['cf_customer', 'cf_application', 'cf_source_environment', 'cf_target_environment', 'cf_script_version', 'cf_defect_title'])

const MIGRATION_FILTER_FIELDS: Partial<Record<(typeof TEXT_KEYS)[number], string>> = {
  customer: 'cf_customer',
  application: 'cf_application',
  sourceEnv: 'cf_source_environment',
  targetEnv: 'cf_target_environment',
}

/** Raw stored values whose normalised form is one of `keys`, so the Kelsa query can name them. */
function rawValuesFor(all: Rec[], field: string, keys: string[]): string[] {
  const wanted = new Set(keys)
  const out = new Set<string>()
  for (const r of all) {
    const v = r.q[field]
    if (v !== null && v !== undefined && wanted.has(normKey(v))) out.add(v.trim())
  }
  return [...out]
}

/** Global filters as Kelsa terms; null if an active filter can't be expressed natively. */
function filterTerms(kind: DrillKind, ctx: Ctx): Term[] | null {
  const f = ctx.filters
  const all: Rec[] = kind === 'migration' ? ctx.allMigrations : ctx.allDefects
  const terms: Term[] = []
  if (f.customer.includes('__none__') || f.application.includes('__none__')) return null
  if (kind === 'migration') {
    if (f.owner.length || f.readiness.length) return null
    for (const [key, field] of Object.entries(MIGRATION_FILTER_FIELDS)) {
      const vals = f[key as keyof typeof MIGRATION_FILTER_FIELDS]
      if (!vals.length) continue
      if (vals.includes('__none__')) return null
      terms.push({ field, op: ':', values: rawValuesFor(all, field, vals) })
    }
    if (f.stage.length) {
      if (f.stage.includes('__none__')) return null
      terms.push({ field: 'stage', op: ':', values: f.stage.map((k) => ctx.stageNames[k] ?? k) })
    }
  } else {
    if (f.owner.length || f.sourceEnv.length || f.targetEnv.length || f.stage.length || f.readiness.length) return null
    if (f.customer.length) terms.push({ field: 'cf_customer', op: ':', values: rawValuesFor(all, 'cf_customer', f.customer) })
    if (f.application.length) terms.push({ field: 'cf_application', op: ':', values: rawValuesFor(all, 'cf_application', f.application) })
  }
  if (f.from) terms.push({ field: 'created', op: '>=', values: [f.from] })
  if (f.to) terms.push({ field: 'created', op: '<=', values: [f.to] })
  return terms
}

/** Same field + equality twice: intersect (Kelsa would OR a repeated field). */
function mergeTerms(terms: Term[]): Term[] | null {
  const out: Term[] = []
  for (const t of terms) {
    const prev = t.op === ':' ? out.find((o) => o.field === t.field && o.op === ':') : undefined
    if (prev) {
      const keep = prev.values.filter((v) => t.values.some((w) => w.toLowerCase() === v.toLowerCase()))
      if (!keep.length) return null
      prev.values = keep
    } else out.push({ ...t, values: [...t.values] })
  }
  return out
}

function expressible(terms: Term[]): boolean {
  return terms.every((t) => t.values.length > 0 && t.values.every((v) => v.trim() !== '' && !v.includes(';') && !v.includes('\n')))
}

export function composeQuery(terms: Term[]): string {
  return terms.flatMap((t) => t.values.map((v) => `${t.field}${t.op}${v.trim()}`)).join(';')
}

function matches(value: string | null | undefined, t: Term, mode: 'exact' | 'contains'): boolean {
  if (value === null || value === undefined) return false
  if (t.op === '>=') return value >= t.values[0]
  if (t.op === '<=') return value <= t.values[0]
  const v = value.toLowerCase()
  return t.values.some((w) => {
    const x = w.trim().toLowerCase()
    return mode === 'contains' && TEXT_FIELDS.has(t.field) ? v.includes(x) : v === x
  })
}

function simulate(all: Rec[], terms: Term[], mode: 'exact' | 'contains'): number[] {
  return ids(all.filter((r) => terms.every((t) => matches(r.q[t.field], t, mode))))
}

const ids = (recs: Rec[]) => [...new Set(recs.map((r) => r.leadId))].sort((a, b) => a - b)
const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i])

function verified(all: Rec[], terms: Term[], want: number[]): boolean {
  return expressible(terms) && same(simulate(all, terms, 'exact'), want) && same(simulate(all, terms, 'contains'), want)
}

export function kelsaSearchUrl(ctx: Ctx, kind: DrillKind, query: string): string {
  const pipelineId = kind === 'migration' ? ctx.migrationPipelineId : ctx.defectPipelineId
  const params = ['current_view=list', 'sort=created_at', 'order=desc', 'group_order=desc', 'page=1', `account_id=${ctx.accountId}`]
  // The leads page decodes search_query a second time, so it is encoded twice.
  if (query) params.push(`search_query=${encodeURIComponent(encodeURIComponent(query))}`)
  return `${ctx.origin}/${pipelineId}/leads?${params.join('&')}`
}

export function kelsaRecordUrl(origin: string, pipelineId: number, leadId: number): string {
  return `${origin}/${pipelineId}/leads?current_item_id=${leadId}`
}

/** Fallback: the set's own identifying values ORed per field (defect titles; migration customer + application + version). */
function valueQuery(kind: DrillKind, all: Rec[], set: Rec[], want: number[]): string | null {
  if (!set.length || set.length > MAX_IDS_PER_LINK) return null
  const fields = kind === 'defect' ? ['cf_defect_title'] : ['cf_customer', 'cf_application', 'cf_script_version']
  const terms: Term[] = fields.map((field) => ({ field, op: ':', values: [...new Set(set.map((r) => r.q[field]?.trim() ?? ''))] }))
  return verified(all, terms, want) ? composeQuery(terms) : null
}

export function resolve(spec: DrillSpec, ctx: Ctx): Resolution {
  const set = spec.records
  if (!set.length) return { kind: 'none' }
  const all: Rec[] = spec.kind === 'migration' ? ctx.allMigrations : ctx.allDefects
  const want = ids(set)

  const vq = valueQuery(spec.kind, all, set, want)
  const bulk = vq !== null ? { url: kelsaSearchUrl(ctx, spec.kind, vq), query: vq } : null
  if (spec.list) return { kind: 'list', spec, bulk }

  const fTerms = spec.ignoreFilters ? [] : filterTerms(spec.kind, ctx)
  if (fTerms) {
    const merged = mergeTerms([...fTerms, ...(spec.terms ?? [])])
    if (merged && verified(all, merged, want)) {
      const query = composeQuery(merged)
      return { kind: 'url', strategy: 'native', url: kelsaSearchUrl(ctx, spec.kind, query), query }
    }
  }
  if (bulk) return { kind: 'url', strategy: 'values', url: bulk.url, query: bulk.query }
  return { kind: 'list', spec, bulk: null }
}
