/**
 * The only module that talks to Kelsa. Read-only by construction: GET for
 * everything, and POST only to /leads/stats, which is an aggregation read.
 * There is no code path here that can create, update or delete anything.
 *
 * Credentials are read per request from the server environment and never
 * returned, logged, or forwarded to the browser.
 */
import { ALLOWED_PIPELINE_IDS, KELSA_CONCURRENCY, KELSA_ORIGIN, KELSA_TIMEOUT_MS, PER_PAGE, PIPELINES, TIMEZONE } from './config.js'

export class KelsaError extends Error {
  constructor(kind, message, { status = null, pipelineId = null } = {}) {
    super(message)
    this.name = 'KelsaError'
    this.kind = kind
    this.status = status
    this.pipelineId = pipelineId
  }

  toClientJSON() {
    return { kind: this.kind, message: this.message, pipeline: pipelineName(this.pipelineId) }
  }
}

export function hasCredentials() {
  return Boolean(process.env.KELSA_USER_EMAIL?.trim() && process.env.KELSA_USER_TOKEN?.trim())
}

function pipelineName(id) {
  return Object.values(PIPELINES).find((p) => p.id === id)?.name ?? null
}

let active = 0
const waiting = []

async function withSlot(fn) {
  if (active >= KELSA_CONCURRENCY) await new Promise((resolve) => waiting.push(resolve))
  active += 1
  try {
    return await fn()
  } finally {
    active -= 1
    waiting.shift()?.()
  }
}

async function request(pipelineId, path, { query = {}, body = null } = {}) {
  if (!ALLOWED_PIPELINE_IDS.has(pipelineId)) {
    throw new KelsaError('forbidden_pipeline', `Pipeline ${pipelineId} is not part of this dashboard.`)
  }
  const method = body ? 'POST' : 'GET'
  if (method === 'POST' && path !== '/leads/stats') throw new KelsaError('forbidden_method', 'Refusing a non-read Kelsa request.')
  if (!hasCredentials()) {
    throw new KelsaError('auth_not_configured', 'Kelsa credentials are not configured on the server.')
  }

  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  const url = `${KELSA_ORIGIN}/${pipelineId}/api/v1${path}${qs.size ? `?${qs}` : ''}`

  return withSlot(async () => {
    let res
    try {
      res = await fetch(url, {
        method,
        headers: {
          'X-User-Email': process.env.KELSA_USER_EMAIL.trim(),
          'X-User-Token': process.env.KELSA_USER_TOKEN.trim(),
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(KELSA_TIMEOUT_MS),
      })
    } catch (err) {
      const kind = err?.name === 'TimeoutError' ? 'timeout' : 'network_error'
      throw new KelsaError(kind, `Could not reach Kelsa (${err?.message || err}).`, { pipelineId })
    }

    if (res.status === 401 || res.status === 403) {
      // Logged with the pipeline ID so an admin knows which toggle to flip; the browser only gets the business name.
      console.error(`[kelsa] ${res.status} on pipeline ${pipelineId} (${pipelineName(pipelineId)}) for ${path}`)
      throw new KelsaError('access_denied', `Kelsa refused access to ${pipelineName(pipelineId) ?? 'a pipeline'} (API access may be disabled).`, {
        status: res.status,
        pipelineId,
      })
    }
    if (!res.ok) {
      throw new KelsaError('upstream_error', `Kelsa responded ${res.status} for ${pipelineName(pipelineId)}.`, { status: res.status, pipelineId })
    }
    try {
      return await res.json()
    } catch {
      throw new KelsaError('invalid_response', `Kelsa returned a non-JSON body for ${pipelineName(pipelineId)}.`, { pipelineId })
    }
  })
}

export const kelsaGet = (pipelineId, path, query = {}) => request(pipelineId, path, { query })

const MAX_PAGES = 200

/** Follows `meta.count` pagination for any list endpoint keyed by `key`. */
export async function kelsaGetAll(pipelineId, path, key, query = {}) {
  const out = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const data = await kelsaGet(pipelineId, path, { ...query, page, per_page: PER_PAGE })
    const batch = Array.isArray(data?.[key]) ? data[key] : []
    out.push(...batch)
    const total = Number(data?.meta?.count)
    if (!batch.length || (Number.isFinite(total) && out.length >= total)) break
  }
  return out
}

export const listLeads = (pipelineId) => kelsaGetAll(pipelineId, '/leads', 'leads', { sort: 'created_at', order: 'asc' })

export const listStages = async (pipelineId) => (await kelsaGet(pipelineId, '/stages', { all: 'true', per_page: 100 }))?.stages ?? []

export const listCustomFields = async (pipelineId) => (await kelsaGet(pipelineId, '/custom_fields', { all: 'true' }))?.custom_fields ?? []

/** Every stage-change event in the pipeline, paged. Falls back to one call per record if the filtered list isn't available. */
export async function listStageEvents(pipelineId, leadIds) {
  try {
    return await kelsaGetAll(pipelineId, '/events', 'events', { search_query: 'event_types:stage', sort: 'created_at', order: 'asc' })
  } catch (err) {
    if (err instanceof KelsaError && err.kind === 'access_denied') throw err
    console.warn(`[kelsa] pipeline-wide events failed for ${pipelineName(pipelineId)} (${err.message}); reading per record`)
    const lists = await Promise.all(
      leadIds.map((id) => kelsaGetAll(pipelineId, '/events', 'events', { lead_id: id, sort: 'created_at', order: 'asc' }).then((evs) => evs.map((e) => ({ ...e, lead: e.lead ?? { id } })))),
    )
    return lists.flat()
  }
}

/**
 * Record count per stage from Kelsa's aggregation endpoint, used to confirm the
 * paged record pull is complete. One grouping level (stage), so it stays far
 * below the 50-bucket cap; a capped answer is reported, not trusted.
 */
export async function stageCounts(pipelineId) {
  const identifier = 'records_by_stage'
  const none = { type: null, field: 'null' }
  const widget = {
    id: 0,
    stat: 'count',
    chart_type: 'bar',
    identifier,
    position: 1,
    name: identifier,
    time_interval: 'month',
    group_level_1: { type: null, field: 'stage' },
    group_level_2: none,
    group_level_3: none,
    offset: 0,
    values: [],
    choose_values: false,
    filter_id: null,
    search_query: null,
    display_percentage: false,
    resource_name: null,
    show_gridlines: false,
    sort_order: 'none',
    display_on_account_dashboard: false,
    pipeline_id: pipelineId,
  }
  const data = await request(pipelineId, '/leads/stats', { body: { stats: { pipeline_id: pipelineId, timezone: TIMEZONE, widgets: [widget] } } })
  return data?.stats?.[identifier] ?? null
}
