import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, linkDefects, parseMigrationId } from './gate.js'
import { matchOption, splitIds } from './values.js'
import { assemble } from './dataset.js'
import { sampleRaw } from './sample.js'
import { MIGRATION_OPTIONS } from './config.js'

function migration(over = {}) {
  const base = {
    leadId: 1,
    customer: 'ASD',
    application: 'JDH',
    scriptVersion: 'v2',
    stageKey: 'retest',
    stageName: 'Retest and Approve',
    ai: { status: 'Completed - No Finding', qaDisposition: null, required: 'Yes' },
    run: { runScriptVersion: 'v2', exitCode: 0, status: 'Succeeded' },
    validation: {
      validatedScriptVersion: 'v2',
      sourceRows: 10,
      targetRows: 10,
      countResult: 'Pass',
      statusExpected: 5,
      statusActual: 5,
      statusResult: 'Pass',
      recordResult: 'Pass',
      mismatchedIds: [],
    },
    approval: { approvedScriptVersion: 'v2', evidenceFlag: 'Yes', cutoverStatus: 'Blocked' },
  }
  return {
    ...base,
    ...over,
    ai: { ...base.ai, ...over.ai },
    run: { ...base.run, ...over.run },
    validation: { ...base.validation, ...over.validation },
    approval: { ...base.approval, ...over.approval },
  }
}
const state = (r, key) => r.checks.find((c) => c.key === key).state

test('all evidence on the current version is READY', () => {
  const r = evaluate(migration(), [])
  assert.equal(r.readiness, 'ready')
  assert.deepEqual(r.alerts, [])
})

test('version comparison trims and ignores case', () => {
  const r = evaluate(migration({ scriptVersion: ' V2 ', run: { runScriptVersion: 'v2' }, approval: { approvedScriptVersion: 'v2 ' } }), [])
  assert.equal(r.readiness, 'ready')
})

test('older run version is Stale and blocks, first failing check is the reason', () => {
  const r = evaluate(migration({ run: { runScriptVersion: 'v1' } }), [])
  assert.equal(state(r, 'runVersion'), 'stale')
  assert.equal(r.readiness, 'blocked')
  assert.equal(r.firstFailKey, 'runVersion')
})

test('count Pass with different numbers is a flagged failure', () => {
  const r = evaluate(migration({ validation: { targetRows: 9 } }), [])
  const c = r.checks.find((x) => x.key === 'count')
  assert.equal(c.state, 'fail')
  assert.equal(c.flag, 'Inconsistent')
  assert.equal(c.diff, -1)
})

test('Fix Script First fails AI review even when a finding was recorded', () => {
  const r = evaluate(migration({ ai: { status: 'Completed - Finding Recorded', qaDisposition: 'Fix Script First' } }), [])
  assert.equal(state(r, 'ai'), 'fail')
})

test('AI review not required passes; Model Unavailable is missing', () => {
  assert.equal(state(evaluate(migration({ ai: { status: null, required: 'No' } }), []), 'ai'), 'pass')
  assert.equal(state(evaluate(migration({ ai: { status: 'Model Unavailable' } }), []), 'ai'), 'missing')
})

test('non-zero exit code fails even when the run says Succeeded', () => {
  const r = evaluate(migration({ run: { exitCode: 2 } }), [])
  assert.equal(state(r, 'run'), 'fail')
})

test('missing evidence without failures is INCOMPLETE', () => {
  const r = evaluate(migration({ run: { status: 'Not Run', exitCode: null } }), [])
  assert.equal(r.readiness, 'incomplete')
})

test('open blocking defect fails; closed or non-blocking does not', () => {
  const open = { leadId: 9, title: 'x', isOpen: true, impact: 'Blocking' }
  assert.equal(state(evaluate(migration(), [open]), 'defects'), 'fail')
  assert.equal(state(evaluate(migration(), [{ ...open, isOpen: false }]), 'defects'), 'pass')
  assert.equal(state(evaluate(migration(), [{ ...open, impact: 'Non-blocking' }]), 'defects'), 'pass')
})

test('integrity alerts: approved stage, cleared, and Kelsa evidence flag', () => {
  const r = evaluate(migration({ stageKey: 'approved', run: { status: 'Not Run', exitCode: null }, approval: { cutoverStatus: 'Cleared', evidenceFlag: 'Yes' } }), [])
  assert.deepEqual(r.alerts.map((a) => a.key).sort(), ['approvedStage', 'cleared', 'evidence'])
})

test('linking: record ID, then customer+app+version, then customer+app, else unlinked', () => {
  const ms = [
    { leadId: 57467592, customer: 'ASD', application: 'JDH', scriptVersion: 'v2' },
    { leadId: 2, customer: 'Other', application: 'App', scriptVersion: 'v1' },
  ]
  const ds = [
    { sourceMigrationId: '57467592', customer: 'zzz', application: 'zzz' },
    { sourceMigrationId: '', customer: ' asd', application: 'jdh ', scriptVersion: 'V2' },
    { sourceMigrationId: 'MIG-1', customer: 'ASD', application: 'JDH', scriptVersion: 'v1' },
    { sourceMigrationId: null, customer: 'Nobody', application: 'JDH' },
  ]
  linkDefects(ms, ds)
  assert.deepEqual(ds.map((d) => d.linkMethod), ['id', 'version', 'app', null])
  assert.deepEqual(ds[2].linkedMigrationIds, [57467592])
  assert.deepEqual(ds[3].linkedMigrationIds, [])
})

test('helpers: ID parsing, option matching, ID splitting', () => {
  assert.equal(parseMigrationId('https://kelsa.io/21223/leads?current_item_id=57467592'), 57467592)
  assert.equal(parseMigrationId('#57467592'), 57467592)
  assert.equal(parseMigrationId('ABC'), null)
  assert.equal(matchOption({ name: 'completed – no finding ' }, MIGRATION_OPTIONS.ai_review_status).value, 'Completed - No Finding')
  assert.equal(matchOption('Maybe', MIGRATION_OPTIONS.ai_review_required).status, 'unrecognised')
  assert.deepEqual(splitIds('C1, C2  C3;c1'), ['C1', 'C2', 'C3'])
})

test('sample dataset assembles and covers every readiness state', () => {
  const data = assemble(sampleRaw(), 'sample')
  const states = new Set(data.migrations.map((m) => m.readiness))
  assert.deepEqual([...states].sort(), ['blocked', 'incomplete', 'ready'])
  assert.ok(data.defects.some((d) => d.linkMethod === null))
  assert.ok(data.defects.some((d) => d.retestLoops >= 2))
})
