/**
 * The cutover gate, computed from evidence rather than from the Kelsa stage.
 * Kelsa doesn't enforce it, so a record can sit in "Approved for Cutover" or
 * carry Cutover Status = Cleared while its evidence says otherwise.
 *
 * Inputs are normalised records (see dataset.js): option fields already mapped
 * onto the agreed labels, free text trimmed, numbers parsed.
 */
import { normKey } from './values.js'

export const CHECKS = [
  { key: 'ai', label: 'AI review', short: 'AI review' },
  { key: 'run', label: 'Rehearsal run', short: 'Rehearsal' },
  { key: 'runVersion', label: 'Rehearsal on current version', short: 'Run version' },
  { key: 'valVersion', label: 'Validation on current version', short: 'Val. version' },
  { key: 'count', label: 'Count check', short: 'Count' },
  { key: 'status', label: 'Status reconciliation', short: 'Status recon.' },
  { key: 'record', label: 'Record-level check', short: 'Record-level' },
  { key: 'defects', label: 'No open blocking defects', short: 'Defects' },
  { key: 'signoff', label: 'Sign-off on current version', short: 'Sign-off' },
]

export const LINK_METHODS = {
  id: 'Migration record ID',
  version: 'Customer + application + script version',
  app: 'Customer + application',
}

export const ALERTS = {
  approvedStage: 'In Approved for Cutover but gate not passing',
  cleared: 'Cutover Status = Cleared but gate not passing',
  evidence: 'Kelsa “Evidence Current and Passing” disagrees with the computed gate',
}

const same = (a, b) => normKey(a) === normKey(b)
const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN'))
const signed = (n) => (n > 0 ? `+${fmt(n)}` : fmt(n))
const pass = (reason, extra = {}) => ({ state: 'pass', reason, ...extra })
const fail = (reason, extra = {}) => ({ state: 'fail', reason, ...extra })
const stale = (reason, extra = {}) => ({ state: 'stale', reason, ...extra })
const missing = (reason, extra = {}) => ({ state: 'missing', reason, ...extra })

function aiReview(m) {
  const { status, qaDisposition: disp, required } = m.ai
  if (disp === 'Fix Script First') return fail('QA disposition is “Fix Script First”: the script must be fixed before rehearsal.')
  if (required === 'No') return pass('AI review is marked as not required for this migration.')
  if (status === 'Completed - No Finding') return pass('AI review completed with no finding.')
  if (status === 'Completed - Finding Recorded') {
    if (disp === 'Proceed to Isolated Rehearsal') return pass('AI review recorded a finding; QA cleared it to proceed to isolated rehearsal.')
    return missing('AI review recorded a finding, but QA hasn’t set a disposition yet.')
  }
  if (status === 'Model Unavailable') return missing('The AI model was unavailable, so the review hasn’t been completed.')
  if (status === 'Not Run') return missing('AI review hasn’t been run yet.')
  if (!status) return missing('AI review status isn’t set.')
  return missing(`AI review status “${status}” isn’t one of the agreed options.`)
}

function rehearsal(m) {
  const { status, exitCode } = m.run
  if (status === 'Failed') return fail(`Rehearsal run failed${exitCode !== null ? ` (exit code ${exitCode})` : ''}.`)
  if (exitCode !== null && exitCode !== 0) {
    return fail(`Exit code ${exitCode}; a clean run exits with 0.`, status === 'Succeeded' ? { flag: 'Inconsistent', note: 'Run status says Succeeded but the exit code is not 0.' } : {})
  }
  if (status === 'Succeeded' && exitCode === 0) return pass('Rehearsal succeeded with exit code 0.')
  if (status === 'Succeeded') return missing('Run status says Succeeded, but no exit code is recorded.')
  if (status === 'Not Run') return missing('Rehearsal hasn’t been run yet.')
  if (!status) return missing('Rehearsal run status isn’t set.')
  return missing(`Run status “${status}” isn’t one of the agreed options.`)
}

function onCurrent(m, version, what) {
  if (!m.scriptVersion) return missing('The current script version isn’t recorded.')
  if (!version) return missing(`No script version is recorded for the ${what}.`)
  if (same(version, m.scriptVersion)) return pass(`${cap(what)} was done on ${m.scriptVersion}, the current version.`)
  return stale(`${cap(what)} was done on ${version}; the current version is ${m.scriptVersion}.`)
}

function reconciled({ result, a, b, aLabel, bLabel, name, noun }) {
  const diff = a !== null && b !== null ? b - a : null
  const diffText = diff === null ? '' : diff === 0 ? ` ${cap(aLabel)} and ${bLabel} both ${fmt(a)} ${noun}.` : ` ${cap(aLabel)} ${fmt(a)}, ${bLabel} ${fmt(b)} (${signed(diff)}).`
  if (result === 'Fail') {
    return fail(`${name} recorded as Fail.${diffText}`, { diff, ...(diff === 0 ? { flag: 'Inconsistent', note: `Recorded as Fail but the ${noun} match.` } : {}) })
  }
  if (result === 'Pass') {
    if (diff === null) return missing(`${name} recorded as Pass, but ${aLabel} and ${bLabel} aren’t both recorded.`, { diff })
    if (diff === 0) return pass(`${name} passed.${diffText}`, { diff })
    return fail(`${name} recorded as Pass, but the numbers differ.${diffText}`, { diff, flag: 'Inconsistent', note: `Recorded as Pass but ${aLabel} and ${bLabel} differ.` })
  }
  if (!result) return missing(`${name} result isn’t recorded.${diffText}`, { diff })
  return missing(`${name} result “${result}” isn’t one of the agreed options.${diffText}`, { diff })
}

function recordLevel(m) {
  const { recordResult: result, mismatchedIds: ids } = m.validation
  const idText = ids.length ? ` ${ids.length} mismatched customer ${ids.length === 1 ? 'ID is' : 'IDs are'} listed.` : ''
  if (result === 'Fail') return fail(`Record-level check recorded as Fail.${idText}`)
  if (result === 'Pass') {
    if (ids.length) return fail(`Record-level check recorded as Pass, but${idText.toLowerCase()}`, { flag: 'Inconsistent', note: 'Recorded as Pass but mismatched customer IDs are listed.' })
    return pass('Record-level check passed with no mismatched customer IDs.')
  }
  if (!result) return missing(`Record-level check result isn’t recorded.${idText}`)
  return missing(`Record-level result “${result}” isn’t one of the agreed options.${idText}`)
}

function blockingDefects(linked) {
  const open = linked.filter((d) => d.isOpen)
  const blocking = open.filter((d) => d.impact === 'Blocking')
  if (blocking.length) {
    const names = blocking.slice(0, 3).map((d) => `“${d.title}”`).join(', ')
    return fail(`${blocking.length} open blocking ${blocking.length === 1 ? 'defect' : 'defects'}: ${names}${blocking.length > 3 ? ', …' : ''}.`, { defectIds: blocking.map((d) => d.leadId) })
  }
  if (open.length) return pass(`No open blocking defects (${open.length} open non-blocking or unclassified).`)
  return pass(linked.length ? 'No open blocking defects; every linked defect is closed.' : 'No defects are linked to this migration.')
}

function signOff(m) {
  const v = m.approval.approvedScriptVersion
  if (!m.scriptVersion) return missing('The current script version isn’t recorded.')
  if (!v) return missing('Not signed off yet: no approved script version is recorded.')
  if (same(v, m.scriptVersion)) return pass(`Signed off on ${m.scriptVersion}, the current version.`)
  return stale(`Sign-off is for ${v}; the current version is ${m.scriptVersion}.`)
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Evaluates all 9 checks, readiness and integrity alerts for one migration. */
export function evaluate(m, linkedDefects) {
  const v = m.validation
  const results = {
    ai: aiReview(m),
    run: rehearsal(m),
    runVersion: onCurrent(m, m.run.runScriptVersion, 'rehearsal run'),
    valVersion: onCurrent(m, v.validatedScriptVersion, 'validation'),
    count: reconciled({ result: v.countResult, a: v.sourceRows, b: v.targetRows, aLabel: 'source', bLabel: 'target', name: 'Count check', noun: 'rows' }),
    status: reconciled({ result: v.statusResult, a: v.statusExpected, b: v.statusActual, aLabel: 'expected', bLabel: 'actual', name: 'Status reconciliation', noun: 'records' }),
    record: recordLevel(m),
    defects: blockingDefects(linkedDefects),
    signoff: signOff(m),
  }
  const checks = CHECKS.map((c) => ({ key: c.key, label: c.label, ...results[c.key] }))
  const firstFail = checks.find((c) => c.state === 'fail' || c.state === 'stale') ?? null
  const firstMissing = checks.find((c) => c.state === 'missing') ?? null
  const readiness = firstFail ? 'blocked' : firstMissing ? 'incomplete' : 'ready'
  const reason = firstFail
    ? `${firstFail.label}: ${firstFail.reason}`
    : firstMissing
      ? `${checks.filter((c) => c.state === 'missing').length} of 9 checks have no evidence yet, starting with ${firstMissing.label}.`
      : 'All 9 checks pass on the current script version.'

  const alerts = []
  if (readiness !== 'ready') {
    if (m.stageKey === 'approved') alerts.push({ key: 'approvedStage', detail: `Stage is ${m.stageName}; computed readiness is ${readinessLabel(readiness)}.` })
    if (m.approval.cutoverStatus === 'Cleared') alerts.push({ key: 'cleared', detail: `Cutover Status is Cleared; computed readiness is ${readinessLabel(readiness)}.` })
  }
  const kelsa = m.approval.evidenceFlag
  if (kelsa === 'Yes' || kelsa === 'No') {
    const computed = readiness === 'ready' ? 'Yes' : 'No'
    if (kelsa !== computed) {
      alerts.push({ key: 'evidence', detail: `Kelsa says ${kelsa}; computed gate says ${computed} (${readinessLabel(readiness)}).`, kelsa, computed })
    }
  }

  return {
    checks,
    readiness,
    reason,
    firstFailKey: firstFail?.key ?? null,
    alerts,
  }
}

export function readinessLabel(r) {
  return r === 'ready' ? 'Ready' : r === 'blocked' ? 'Blocked' : 'Incomplete'
}

/** "57467592", "#57467592" or a Kelsa link with current_item_id=57467592 → 57467592. Anything else → null. */
export function parseMigrationId(text) {
  if (!text) return null
  const s = String(text).trim()
  const link = s.match(/current_item_id=(\d+)/i)
  if (link) return Number(link[1])
  const bare = s.match(/^#?\s*(\d{3,})$/)
  return bare ? Number(bare[1]) : null
}

/**
 * Links each defect to its migration(s), trying in order:
 *   1. Source Migration ID equals the migration record ID
 *   2. customer + application + script version
 *   3. customer + application
 * The first method that finds anything wins; several matches at that level are all kept and flagged.
 */
export function linkDefects(migrations, defects) {
  const byId = new Map(migrations.map((m) => [m.leadId, m]))
  const key3 = (x) => [x.customer, x.application, x.scriptVersion].map(normKey).join('\u0001')
  const key2 = (x) => [x.customer, x.application].map(normKey).join('\u0001')
  const by3 = group(migrations.filter((m) => m.customer && m.application && m.scriptVersion), key3)
  const by2 = group(migrations.filter((m) => m.customer && m.application), key2)

  for (const d of defects) {
    const notes = []
    let method = null
    let matches = []
    const sid = parseMigrationId(d.sourceMigrationId)
    if (sid !== null && byId.has(sid)) {
      method = 'id'
      matches = [byId.get(sid)]
    } else {
      if (d.sourceMigrationId) {
        notes.push(sid === null ? `Source Migration ID “${d.sourceMigrationId}” isn’t a record ID.` : `Source Migration ID ${sid} doesn’t match any migration record.`)
      }
      if (d.customer && d.application && d.scriptVersion && by3.has(key3(d))) {
        method = 'version'
        matches = by3.get(key3(d))
      } else if (d.customer && d.application && by2.has(key2(d))) {
        method = 'app'
        matches = by2.get(key2(d))
      }
    }
    if (matches.length > 1) notes.push(`Matches ${matches.length} migrations by ${LINK_METHODS[method].toLowerCase()}; linked to all of them.`)
    if (!method) notes.push(d.customer && d.application ? 'No migration has this customer and application.' : 'Customer or application is blank, so it can’t be matched.')
    d.linkMethod = method
    d.linkedMigrationIds = matches.map((m) => m.leadId)
    d.linkNotes = notes
  }
}

function group(list, keyFn) {
  const map = new Map()
  for (const x of list) {
    const k = keyFn(x)
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(x)
  }
  return map
}

/** "<Failed Check>: expected <Expected>, actual <Actual> (<Script Version>)" */
export function defectSentence(d) {
  return `${d.failedCheck ?? 'Check not set'}: expected ${d.expected ?? '—'}, actual ${d.actual ?? '—'} (${d.scriptVersion ?? 'version not set'})`
}
