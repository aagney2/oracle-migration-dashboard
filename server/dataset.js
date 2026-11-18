/**
 * Builds the one payload the dashboard reads. Kelsa field identifiers stop
 * here: the browser receives business-named fields, plus the raw stored values
 * of the few fields used to build Kelsa search links.
 *
 * Upstream cost per refresh: one paged GET per pipeline for records (250 per
 * page), one each for stages and field config, one paged GET of stage-change
 * events per pipeline, and one /leads/stats count per pipeline (grouped by
 * stage only, so far below the 50-bucket cap) to confirm the record pull is
 * complete.
 */
import {
  ACCOUNT_ID,
  DEFECT_FIELDS,
  DEFECT_OPTIONS,
  DEFECT_STAGES,
  KELSA_ORIGIN,
  MIGRATION_FIELDS,
  MIGRATION_OPTIONS,
  MIGRATION_STAGES,
  PIPELINES,
  STATS_BUCKET_CAP,
} from './config.js'
import { ALERTS, CHECKS, LINK_METHODS, defectSentence, evaluate, linkDefects } from './gate.js'
import { hasCredentials, listCustomFields, listLeads, listStageEvents, listStages, stageCounts } from './kelsa.js'
import { sampleRaw } from './sample.js'
import { attachments, canonOption, istDate, label, matchOption, num, rawLabel, splitIds } from './values.js'

export function useSampleData() {
  if (process.env.KELSA_SAMPLE_DATA === '1') return true
  return !hasCredentials() && process.env.NODE_ENV !== 'production'
}

export async function buildDataset() {
  const sample = useSampleData()
  const raw = sample ? sampleRaw() : await fetchRaw()
  return assemble(raw, sample ? 'sample' : 'kelsa')
}

async function fetchRaw() {
  const M = PIPELINES.migration.id
  const D = PIPELINES.defect.id
  const [migrationLeads, defectLeads, migrationStages, defectStages, migrationFields, defectFields] = await Promise.all([
    listLeads(M),
    listLeads(D),
    listStages(M),
    listStages(D),
    listCustomFields(M),
    listCustomFields(D),
  ])
  const [migrationEvents, defectEvents, migrationStats, defectStats] = await Promise.all([
    listStageEvents(M, migrationLeads.map((l) => l.id)),
    listStageEvents(D, defectLeads.map((l) => l.id)),
    stageCounts(M).catch((err) => ({ error: err.message })),
    stageCounts(D).catch((err) => ({ error: err.message })),
  ])
  return { migrationLeads, defectLeads, migrationStages, defectStages, migrationFields, defectFields, migrationEvents, defectEvents, migrationStats, defectStats }
}

export function assemble(raw, source, now = Date.now()) {
  const health = []
  const valueIssues = new Map()

  const mStages = stageResolver(MIGRATION_STAGES, raw.migrationStages)
  const dStages = stageResolver(DEFECT_STAGES, raw.defectStages)
  const mEvents = indexEvents(raw.migrationEvents, mStages)
  const dEvents = indexEvents(raw.defectEvents, dStages)

  const liveM = raw.migrationLeads.filter((l) => !l.retired)
  const liveD = raw.defectLeads.filter((l) => !l.retired)

  const optionReader = (pipelineKey, options, fieldNames) => (lead, field) => {
    const m = matchOption(lead.custom_field_values?.[field], options[field])
    if (m.status === 'normalised' || m.status === 'unrecognised') {
      const k = `${pipelineKey}|${field}|${m.raw}`
      if (!valueIssues.has(k)) valueIssues.set(k, { pipelineKey, field, fieldName: fieldNames[field], value: m.raw, status: m.status, matchedTo: m.status === 'normalised' ? m.value : null, leadIds: [] })
      valueIssues.get(k).leadIds.push(lead.id)
    }
    return m.value
  }
  const mOpt = optionReader('migration', MIGRATION_OPTIONS, MIGRATION_FIELDS)
  const dOpt = optionReader('defect', DEFECT_OPTIONS, DEFECT_FIELDS)

  const migrations = liveM.map((lead) => normalizeMigration(lead, mStages, mEvents.get(lead.id) ?? [], mOpt))
  const defects = liveD.map((lead) => normalizeDefect(lead, dStages, dEvents.get(lead.id) ?? [], dOpt))

  linkDefects(migrations, defects)
  const defectsByMigration = new Map()
  for (const d of defects) {
    for (const id of d.linkedMigrationIds) {
      if (!defectsByMigration.has(id)) defectsByMigration.set(id, [])
      defectsByMigration.get(id).push(d)
    }
  }
  for (const m of migrations) {
    const linked = defectsByMigration.get(m.leadId) ?? []
    Object.assign(m, evaluate(m, linked))
    m.defectIds = linked.map((d) => d.leadId)
  }
  for (const d of defects) d.sentence = defectSentence(d)

  // ------------------------------------------------------------------ health
  health.push(...fieldHealth('migration', PIPELINES.migration.name, raw.migrationFields, MIGRATION_FIELDS, MIGRATION_OPTIONS))
  health.push(...fieldHealth('defect', PIPELINES.defect.name, raw.defectFields, DEFECT_FIELDS, DEFECT_OPTIONS))

  const issues = [...valueIssues.values()]
  health.push({
    key: 'values',
    title: 'Stored values that don’t match the agreed options',
    detail: 'Values are matched after trimming, ignoring case and dash style. “Matched” values are counted as the option shown; “not recognised” values are shown as stored and never count as a pass.',
    items: issues.map((i) => ({
      text: `${i.fieldName}: “${i.value}” ${i.status === 'normalised' ? `matched to “${i.matchedTo}”` : 'is not one of the agreed options'} (${i.leadIds.length} ${i.pipelineKey === 'migration' ? 'migration' : 'defect'}${i.leadIds.length === 1 ? '' : 's'})`,
      pipelineKey: i.pipelineKey,
      leadIds: i.leadIds,
      tone: i.status === 'unrecognised' ? 'warn' : 'info',
    })),
  })

  health.push(stageHealth('migration', PIPELINES.migration.name, mStages, migrations))
  health.push(stageHealth('defect', PIPELINES.defect.name, dStages, defects))

  health.push({
    key: 'statsCheck',
    title: 'Record pull is complete',
    detail: `Records are read page by page. Kelsa’s own per-stage counts (one grouping level, well under its ${STATS_BUCKET_CAP}-group limit) are compared with what was read.`,
    items: [statsItem('migration', PIPELINES.migration.name, raw.migrationStats, liveM, mStages), statsItem('defect', PIPELINES.defect.name, raw.defectStats, liveD, dStages)].filter(Boolean),
  })

  health.push({
    key: 'linking',
    title: 'Defect linking',
    detail: 'Defects are linked by Source Migration ID first, then customer + application + script version, then customer + application. Unlinked defects are listed on the Defects page and never dropped.',
    items: defects
      .filter((d) => d.linkNotes.length)
      .map((d) => ({ text: `“${d.title}”: ${d.linkNotes.join(' ')}`, pipelineKey: 'defect', leadIds: [d.leadId], tone: d.linkMethod ? 'info' : 'warn' })),
  })

  health.push({
    key: 'evidenceFlag',
    title: 'Kelsa “Evidence Current and Passing” not set',
    detail: 'The computed gate is still evaluated; there is just nothing in Kelsa to compare it with.',
    items: migrations.filter((m) => !m.approval.evidenceFlag).map((m) => ({ text: m.label, pipelineKey: 'migration', leadIds: [m.leadId], tone: 'info' })),
  })

  health.push({
    key: 'impact',
    title: 'Open defects with no cutover impact',
    detail: 'Only defects marked Blocking hold the gate. These open defects have no recognised impact, so they don’t block anything until one is set.',
    items: defects.filter((d) => d.isOpen && d.impact !== 'Blocking' && d.impact !== 'Non-blocking').map((d) => ({ text: `“${d.title}”${d.impact ? ` (stored as “${d.impact}”)` : ''}`, pipelineKey: 'defect', leadIds: [d.leadId], tone: 'warn' })),
  })

  health.push({
    key: 'history',
    title: 'No stage history',
    detail: 'Days in stage and stage timelines come from Kelsa’s stage-change events. These records have none, so their time in stage is unknown unless they are still in the first stage.',
    items: [
      ...migrations.filter((m) => !m.history.length && m.stageKey !== 'register').map((m) => ({ text: m.label, pipelineKey: 'migration', leadIds: [m.leadId], tone: 'info' })),
      ...defects.filter((d) => !d.history.length && d.stageKey !== 'open').map((d) => ({ text: d.title, pipelineKey: 'defect', leadIds: [d.leadId], tone: 'info' })),
    ],
  })

  const retired = raw.migrationLeads.length - liveM.length + raw.defectLeads.length - liveD.length
  if (retired) health.push({ key: 'retired', title: 'Retired records left out', detail: `${retired} retired ${retired === 1 ? 'record is' : 'records are'} not counted anywhere.`, items: [] })

  return {
    source,
    asOf: new Date(now).toISOString(),
    accountId: ACCOUNT_ID,
    origin: KELSA_ORIGIN,
    pipelines: {
      migration: { id: PIPELINES.migration.id, name: PIPELINES.migration.name, count: migrations.length },
      defect: { id: PIPELINES.defect.id, name: PIPELINES.defect.name, count: defects.length },
    },
    migrationStages: mStages.list.map(({ key, name }) => ({ key, name })),
    defectStages: dStages.list.map(({ key, name }) => ({ key, name })),
    checks: CHECKS,
    linkMethods: LINK_METHODS,
    alertLabels: ALERTS,
    migrations,
    defects,
    health,
  }
}

// ---------------------------------------------------------------------------
// Stages and events
// ---------------------------------------------------------------------------

function stageResolver(config, kelsaStages) {
  const kelsa = (kelsaStages ?? []).filter(Boolean)
  const strip = (s) => String(s ?? '').replace(/^st_/, '').toLowerCase()
  const list = config.map((c) => {
    const k = kelsa.find((s) => strip(s.identifier) === c.identifier) ?? kelsa.find((s) => canonOption(s.name) === canonOption(c.name))
    return { key: c.key, identifier: c.identifier, name: k?.name?.trim() || c.name, kelsaId: k?.id ?? null, found: Boolean(k) }
  })
  const extra = kelsa.filter((s) => !s.retired && !list.some((x) => x.kelsaId === s.id)).map((s) => s.name)
  const resolve = (stage) => {
    if (!stage) return { key: null, name: null }
    const obj = typeof stage === 'object' ? stage : { name: stage }
    const byId = obj.id != null ? list.find((x) => x.kelsaId === obj.id) : null
    const byIdent = obj.identifier ? list.find((x) => x.identifier === strip(obj.identifier)) : null
    const byName = obj.name ? list.find((x) => canonOption(x.name) === canonOption(obj.name)) : null
    const hit = byId ?? byIdent ?? byName
    return hit ? { key: hit.key, name: hit.name } : { key: null, name: label(obj.name) }
  }
  return { list, extra, resolve }
}

function indexEvents(events, stages) {
  const map = new Map()
  const seen = new Set()
  for (const e of events ?? []) {
    const types = e.event_types ?? []
    const fromDesc = /stage changed.*?\bto\s+(.+?)\s*$/i.exec(e.description ?? '')?.[1]
    const name = e.stage?.name ?? fromDesc
    if (!name || (!types.includes('stage') && !fromDesc)) continue
    const leadId = e.lead?.id ?? e.lead_id
    if (!leadId) continue
    const dedupe = e.id ?? `${leadId}|${e.created_at}|${name}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    const st = stages.resolve({ name })
    if (!map.has(leadId)) map.set(leadId, [])
    map.get(leadId).push({ at: e.created_at, stageKey: st.key, stage: st.name ?? name, user: label(e.user?.name) })
  }
  for (const list of map.values()) list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  return map
}

function stageInfo(lead, stages, history, firstKey) {
  const st = stages.resolve(lead.stage ?? (lead.stage_id != null ? { id: lead.stage_id } : null))
  const lastInto = [...history].reverse().find((e) => e.stageKey === st.key && st.key)
  const enteredAt = lastInto?.at ?? (st.key === firstKey ? lead.created_at : null)
  return { stageKey: st.key, stageName: st.name ?? 'Unknown stage', stageEnteredAt: enteredAt }
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

function normalizeMigration(lead, stages, history, opt) {
  const cf = lead.custom_field_values || {}
  const t = (k) => label(cf[k])
  const customer = t('customer')
  const application = t('application')
  const scriptVersion = t('script_version')
  return {
    leadId: lead.id,
    label: [customer ?? 'Customer not set', application ?? 'Application not set', scriptVersion ?? 'Version not set'].join(' · '),
    customer,
    application,
    sourceEnv: t('source_environment'),
    targetEnv: t('target_environment'),
    scriptVersion,
    owner: t('migration_owner'),
    ...stageInfo(lead, stages, history, 'register'),
    createdAt: lead.created_at,
    updatedAt: lead.updated_at,
    history,
    registration: {
      approvedStatusMapping: attachments(cf.approved_status_mapping),
      migrationScript: attachments(cf.migration_script),
      testCases: attachments(cf.test_cases),
    },
    ai: {
      status: opt(lead, 'ai_review_status'),
      findingFile: t('ai_finding_file'),
      findingLine: num(cf.ai_finding_line),
      ruleViolated: t('ai_rule_violated'),
      evidence: t('ai_evidence'),
      suggestedFix: t('ai_suggested_fix'),
      qaDisposition: opt(lead, 'qa_disposition'),
      required: opt(lead, 'ai_review_required'),
    },
    run: {
      runId: t('run_id'),
      runScriptVersion: t('run_script_version'),
      exitCode: num(cf.exit_code),
      logReference: t('log_reference'),
      baselineId: t('baseline_id'),
      status: opt(lead, 'run_status'),
    },
    validation: {
      validatedScriptVersion: t('validated_script_version'),
      sourceRows: num(cf.source_total_rows),
      targetRows: num(cf.target_total_rows),
      countResult: opt(lead, 'count_check_result'),
      statusExpected: num(cf.status_expected_count),
      statusActual: num(cf.status_actual_count),
      statusResult: opt(lead, 'status_reconciliation_result'),
      recordResult: opt(lead, 'record_level_check_result'),
      mismatchedIds: splitIds(cf.mismatched_customer_ids),
    },
    approval: {
      approvedScriptVersion: t('approved_script_version'),
      evidenceFlag: opt(lead, 'evidence_current_and_passing'),
      cutoverStatus: opt(lead, 'cutover_status'),
    },
    q: {
      stage: rawLabel(lead.stage?.name ?? null),
      cf_customer: rawLabel(cf.customer),
      cf_application: rawLabel(cf.application),
      cf_source_environment: rawLabel(cf.source_environment),
      cf_target_environment: rawLabel(cf.target_environment),
      cf_script_version: rawLabel(cf.script_version),
      cf_cutover_status: rawLabel(cf.cutover_status),
      cf_run_status: rawLabel(cf.run_status),
      cf_ai_review_status: rawLabel(cf.ai_review_status),
      cf_qa_disposition: rawLabel(cf.qa_disposition),
      created: istDate(lead.created_at),
    },
  }
}

function normalizeDefect(lead, stages, history, opt) {
  const cf = lead.custom_field_values || {}
  const t = (k) => label(cf[k])
  const info = stageInfo(lead, stages, history, 'open')
  let retestLoops = 0
  for (let i = 1; i < history.length; i += 1) if (history[i].stageKey === 'fix' && history[i - 1].stageKey === 'retest') retestLoops += 1
  const closedAt = info.stageKey === 'closed' ? (info.stageEnteredAt ?? null) : null
  return {
    leadId: lead.id,
    title: t('defect_title') ?? 'Untitled defect',
    customer: t('customer'),
    application: t('application'),
    scriptVersion: t('script_version'),
    sourceMigrationId: t('source_migration_id'),
    failedCheck: opt(lead, 'failed_check'),
    impact: opt(lead, 'cutover_impact'),
    expected: t('expected_value'),
    actual: t('actual_value'),
    affectedIds: splitIds(cf.affected_record_ids),
    runId: t('run_id'),
    logReference: t('log_reference'),
    fixOwner: t('fix_owner'),
    resolutionNotes: t('resolution_notes'),
    retestScriptVersion: t('retest_script_version'),
    ...info,
    isOpen: info.stageKey !== 'closed',
    closedAt,
    retestLoops,
    createdAt: lead.created_at,
    updatedAt: lead.updated_at,
    history,
    q: {
      stage: rawLabel(lead.stage?.name ?? null),
      cf_defect_title: rawLabel(cf.defect_title),
      cf_customer: rawLabel(cf.customer),
      cf_application: rawLabel(cf.application),
      cf_script_version: rawLabel(cf.script_version),
      cf_failed_check: rawLabel(cf.failed_check),
      cf_cutover_impact: rawLabel(cf.cutover_impact),
      created: istDate(lead.created_at),
    },
  }
}

// ---------------------------------------------------------------------------
// Health helpers
// ---------------------------------------------------------------------------

function fieldHealth(pipelineKey, pipelineName, fields, expectedFields, expectedOptions) {
  const out = []
  if (!fields?.length) return out
  const byId = new Map(fields.map((f) => [String(f.identifier ?? '').replace(/^cf_/, ''), f]))
  const missing = Object.entries(expectedFields).filter(([id]) => !byId.has(id))
  out.push({
    key: `${pipelineKey}-fields`,
    title: `${pipelineName}: fields the dashboard reads but Kelsa doesn’t have`,
    detail: 'A missing field reads as blank everywhere, which shows up as missing evidence.',
    items: missing.map(([, name]) => ({ text: name, tone: 'warn' })),
  })
  const optionItems = []
  for (const [id, expected] of Object.entries(expectedOptions)) {
    const f = byId.get(id)
    const configured = (f?.options ?? []).filter((o) => !o.retired).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((o) => label(o.name)).filter(Boolean)
    if (!f || !configured.length) continue
    const notInKelsa = expected.filter((e) => !configured.some((c) => canonOption(c) === canonOption(e)))
    const extra = configured.filter((c) => !expected.some((e) => canonOption(c) === canonOption(e)))
    const spelled = configured.filter((c) => expected.some((e) => canonOption(c) === canonOption(e) && c !== e))
    if (notInKelsa.length || extra.length || spelled.length) {
      const parts = []
      if (notInKelsa.length) parts.push(`missing in Kelsa: ${notInKelsa.map((x) => `“${x}”`).join(', ')}`)
      if (extra.length) parts.push(`extra in Kelsa: ${extra.map((x) => `“${x}”`).join(', ')}`)
      if (spelled.length) parts.push(`spelled differently in Kelsa: ${spelled.map((x) => `“${x}”`).join(', ')}`)
      optionItems.push({ text: `${expectedFields[id]}: ${parts.join('; ')}`, tone: notInKelsa.length || extra.length ? 'warn' : 'info' })
    }
  }
  out.push({
    key: `${pipelineKey}-options`,
    title: `${pipelineName}: dropdown options that differ from the agreed list`,
    detail: 'Compared with the option lists configured on each Kelsa field.',
    items: optionItems,
  })
  return out
}

function stageHealth(pipelineKey, pipelineName, stages, records) {
  const items = []
  for (const s of stages.list) if (!s.found) items.push({ text: `Stage “${s.name}” wasn’t found in Kelsa’s stage list.`, tone: 'warn' })
  for (const name of stages.extra) items.push({ text: `Kelsa has a stage “${name}” that the dashboard doesn’t know about.`, tone: 'warn' })
  const unknown = records.filter((r) => !r.stageKey)
  if (unknown.length) items.push({ text: `${unknown.length} record${unknown.length === 1 ? ' is' : 's are'} in a stage the dashboard doesn’t know.`, pipelineKey, leadIds: unknown.map((r) => r.leadId), tone: 'warn' })
  return { key: `${pipelineKey}-stages`, title: `${pipelineName}: stages`, detail: 'Stages are matched by their Kelsa identifier, then by name.', items }
}

function statsItem(pipelineKey, pipelineName, stats, leads, stages) {
  if (!stats) return null
  if (stats.error) return { text: `${pipelineName}: Kelsa’s count couldn’t be read (${stats.error}); records were still read in full.`, tone: 'info' }
  const groups = stats.groups ?? []
  if (groups.length >= STATS_BUCKET_CAP) return { text: `${pipelineName}: Kelsa’s count hit the ${STATS_BUCKET_CAP}-group limit, so it wasn’t used.`, tone: 'warn' }
  const total = Number(stats.total_count ?? groups.reduce((a, g) => a + (g.count ?? 0), 0))
  const mismatched = []
  for (const g of groups) {
    const key = stages.resolve({ name: g.label }).key
    const ours = leads.filter((l) => stages.resolve(l.stage).key === key).length
    if (ours !== (g.count ?? 0)) mismatched.push(`${g.label}: Kelsa ${g.count}, read ${ours}`)
  }
  if (total === leads.length && !mismatched.length) return { text: `${pipelineName}: ${leads.length} records read, matching Kelsa’s count by stage.`, tone: 'ok' }
  return { text: `${pipelineName}: Kelsa counts ${total}, ${leads.length} read.${mismatched.length ? ` ${mismatched.join('; ')}.` : ''}`, tone: 'warn' }
}
