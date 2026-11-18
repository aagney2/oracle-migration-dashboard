/**
 * Sample data in Kelsa's raw API shape, used only when no Kelsa credentials are
 * configured (local development) or when KELSA_SAMPLE_DATA=1. It runs through
 * exactly the same normalisation, linking and gate code as live data. Every
 * customer and application here is fictional.
 */
import { DEFECT_FIELDS, DEFECT_OPTIONS, DEFECT_STAGES, MIGRATION_FIELDS, MIGRATION_OPTIONS, MIGRATION_STAGES } from './config.js'

const DAY = 86_400_000

export function sampleRaw(now = Date.now()) {
  const at = (daysAgo, hour = 10) => {
    const d = new Date(now - daysAgo * DAY)
    d.setUTCHours(hour - 5, 30, 0, 0)
    return d.toISOString()
  }
  const opt = (name) => (name === null ? null : { id: hash(name), name })
  const user = (name) => ({ id: hash(name), name, email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com` })

  const mStages = MIGRATION_STAGES.map((s, i) => ({ id: 7100 + i, identifier: s.identifier, name: s.name, position: i + 1, retired: false }))
  const dStages = DEFECT_STAGES.map((s, i) => ({ id: 7200 + i, identifier: s.identifier, name: s.name, position: i + 1, retired: false }))
  const mStage = (key) => mStages[MIGRATION_STAGES.findIndex((s) => s.key === key)]
  const dStage = (key) => dStages[DEFECT_STAGES.findIndex((s) => s.key === key)]

  const passingEvidence = (v) => ({
    ai_review_status: opt('Completed - No Finding'),
    ai_review_required: opt('Yes'),
    run_id: `RUN-${v.replace(/\D/g, '')}-01`,
    run_script_version: v,
    exit_code: 0,
    log_reference: `oci://migration-logs/${v}/run.log`,
    baseline_id: `BL-${v.replace(/\D/g, '')}`,
    run_status: opt('Succeeded'),
    validated_script_version: v,
    source_total_rows: 1_248_330,
    target_total_rows: 1_248_330,
    count_check_result: opt('Pass'),
    status_expected_count: 18_420,
    status_actual_count: 18_420,
    status_reconciliation_result: opt('Pass'),
    record_level_check_result: opt('Pass'),
    mismatched_customer_ids: '',
  })

  const reg = (customer, application, v, owner, extra = {}) => ({
    customer,
    application,
    source_environment: 'On-prem Oracle 19c (DC1)',
    target_environment: 'OCI Autonomous DB (Mumbai)',
    script_version: v,
    migration_owner: user(owner),
    approved_status_mapping: [{ file_name: 'status-mapping.xlsx' }],
    migration_script: [{ file_name: `migrate_${v}.sql` }],
    test_cases: [{ file_name: 'test-cases.xlsx' }],
    ...extra,
  })

  const M = [
    {
      id: 90010001,
      created: 34,
      stage: 'approved',
      path: [['register', 34], ['review', 30], ['rehearsal', 26], ['validate', 21], ['retest', 12], ['approved', 6]],
      cf: {
        ...reg('Meridian Health', 'Patient Billing', 'v2.1', 'Priya Raman', { target_environment: 'OCI Exadata (Hyderabad)' }),
        ...passingEvidence('v2.1'),
        approved_script_version: 'v2.1',
        evidence_current_and_passing: 'Yes',
        cutover_status: opt('Cleared'),
      },
    },
    {
      id: 90010002,
      created: 22,
      stage: 'approved',
      path: [['register', 22], ['review', 20], ['rehearsal', 15], ['validate', 11], ['retest', 7], ['approved', 2]],
      cf: {
        ...reg('Coastal Freight', 'Shipment Tracking', 'v1.4', 'Daniel Okafor'),
        ai_review_status: opt('Completed - No Finding'),
        ai_review_required: opt('Yes'),
        run_status: opt('Not Run'),
        approved_script_version: 'v1.4',
        evidence_current_and_passing: 'Yes',
        cutover_status: opt('Blocked'),
      },
    },
    {
      id: 90010003,
      created: 41,
      stage: 'retest',
      path: [['register', 41], ['review', 38], ['rehearsal', 33], ['validate', 25], ['retest', 9]],
      cf: {
        ...reg('Northwind Retail', 'Order Management', 'v3.0', 'Priya Raman'),
        ...passingEvidence('v2.9'),
        source_total_rows: 4_310_552,
        target_total_rows: 4_309_901,
        count_check_result: opt('Fail'),
        approved_script_version: '',
        evidence_current_and_passing: 'No',
        cutover_status: opt('Cleared'),
      },
    },
    {
      id: 90010004,
      created: 19,
      stage: 'validate',
      path: [['register', 19], ['review', 17], ['rehearsal', 13], ['validate', 8]],
      cf: {
        ...reg('Halcyon Bank', 'Core Ledger', 'v1.0', 'Meera Iyer', { source_environment: 'Exadata X7 (Pune)' }),
        ...passingEvidence('v1.0'),
        source_total_rows: 9_812_004,
        target_total_rows: 9_811_960,
        count_check_result: opt('Pass'),
        status_expected_count: 2_204,
        status_actual_count: 2_180,
        status_reconciliation_result: opt('Fail'),
        record_level_check_result: opt('Fail'),
        mismatched_customer_ids: 'HB-10023, HB-10291 HB-11802,HB-12007',
        evidence_current_and_passing: 'No',
        cutover_status: opt('Blocked'),
      },
    },
    {
      id: 90010005,
      created: 9,
      stage: 'review',
      path: [['register', 9], ['review', 6]],
      cf: {
        ...reg('Halcyon Bank', 'Loyalty', 'v0.9', 'Meera Iyer', { source_environment: 'Exadata X7 (Pune)' }),
        ai_review_status: opt('Completed - Finding Recorded'),
        ai_review_required: opt('Yes'),
        ai_finding_file: 'loyalty/03_points_ledger.sql',
        ai_finding_line: 142,
        ai_rule_violated: 'Non-deterministic UPDATE without ORDER BY on ROWNUM',
        ai_evidence: 'UPDATE points_ledger SET tier = :t WHERE ROWNUM <= 1000',
        ai_suggested_fix: 'Batch by primary key range instead of ROWNUM so reruns touch the same rows.',
        qa_disposition: opt('Fix Script First'),
        run_status: opt('Not Run'),
        evidence_current_and_passing: 'No',
        cutover_status: opt('Blocked'),
      },
    },
    {
      id: 90010006,
      created: 14,
      stage: 'rehearsal',
      path: [['register', 14], ['review', 12], ['rehearsal', 4]],
      cf: {
        ...reg('Meridian Health', 'Claims', 'v1.2', 'Arjun Mehta', { target_environment: 'OCI Exadata (Hyderabad)' }),
        ai_review_status: opt('Model unavailable '),
        ai_review_required: opt('Yes'),
        run_id: 'RUN-12-03',
        run_script_version: 'v1.2',
        exit_code: 3,
        log_reference: 'oci://migration-logs/claims/v1.2/run-03.log',
        baseline_id: 'BL-12',
        run_status: opt('Failed'),
        evidence_current_and_passing: 'No',
        cutover_status: opt('Blocked'),
      },
    },
    {
      id: 90010007,
      created: 1,
      stage: 'register',
      path: [['register', 1]],
      cf: {
        ...reg('Coastal Freight', 'Customs Filing', 'v2.0', 'Daniel Okafor'),
        ai_review_status: opt('Not Run'),
        run_status: opt('Not Run'),
        cutover_status: opt('Blocked'),
      },
    },
    {
      id: 90010008,
      created: 27,
      stage: 'approved',
      path: [['register', 27], ['review', 25], ['rehearsal', 20], ['validate', 16], ['retest', 10], ['approved', 3]],
      cf: {
        ...reg('northwind retail ', 'Returns', 'v1.1', 'Arjun Mehta'),
        ...passingEvidence('v1.1'),
        ai_review_status: opt('Completed - Finding Recorded'),
        ai_finding_file: 'returns/01_refunds.sql',
        ai_finding_line: 58,
        ai_rule_violated: 'Implicit date format conversion',
        ai_evidence: "TO_DATE(refund_dt) without a format mask",
        ai_suggested_fix: "Use TO_DATE(refund_dt, 'YYYY-MM-DD').",
        qa_disposition: opt('Proceed to Isolated Rehearsal'),
        approved_script_version: 'v1.0',
        evidence_current_and_passing: 'No',
        cutover_status: opt('Blocked'),
      },
    },
  ]

  const D = [
    {
      id: 90020001,
      created: 24,
      stage: 'retest',
      path: [['open', 24], ['fix', 23], ['retest', 18], ['fix', 17], ['retest', 13], ['fix', 12], ['retest', 3]],
      cf: {
        defect_title: 'Order totals short after currency conversion',
        customer: 'Northwind Retail',
        application: 'Order Management',
        script_version: 'v2.9',
        source_migration_id: '90010003',
        failed_check: opt('Count Check'),
        cutover_impact: opt('Blocking'),
        expected_value: '4,310,552 rows',
        actual_value: '4,309,901 rows',
        affected_record_ids: 'ORD-88123, ORD-88124',
        run_id: 'RUN-29-02',
        log_reference: 'oci://migration-logs/orders/v2.9/run-02.log',
        fix_owner: user('Kavya Nair'),
        resolution_notes: 'Rounding mode changed to HALF_EVEN in v3.0.',
        retest_script_version: 'v3.0',
      },
    },
    {
      id: 90020002,
      created: 7,
      stage: 'fix',
      path: [['open', 7], ['fix', 5]],
      cf: {
        defect_title: 'ON_HOLD accounts land as OPEN',
        customer: 'Halcyon Bank',
        application: 'Core Ledger',
        script_version: 'v1.0',
        source_migration_id: '',
        failed_check: opt('Status Reconciliation'),
        cutover_impact: opt('Non Blocking'),
        expected_value: '2,204 ON_HOLD',
        actual_value: '2,180 ON_HOLD',
        fix_owner: user('Rohan Das'),
      },
    },
    {
      id: 90020003,
      created: 6,
      stage: 'open',
      path: [['open', 6]],
      cf: {
        defect_title: 'Points ledger update is non-deterministic',
        customer: 'Halcyon Bank',
        application: 'loyalty',
        script_version: 'v0.8',
        source_migration_id: 'LOY-17',
        failed_check: opt('AI Review'),
        cutover_impact: opt('Blocking'),
        expected_value: 'Deterministic batch update',
        actual_value: 'ROWNUM-based update',
        fix_owner: user('Kavya Nair'),
      },
    },
    {
      id: 90020004,
      created: 4,
      stage: 'open',
      path: [['open', 4]],
      cf: {
        defect_title: 'Rehearsal aborted on FK constraint',
        customer: 'Meridian Health',
        application: 'Claims',
        script_version: 'v1.2',
        source_migration_id: '57467592',
        failed_check: opt('Execution Error'),
        cutover_impact: opt('Blocking'),
        expected_value: 'Exit code 0',
        actual_value: 'Exit code 3 (ORA-02291)',
        run_id: 'RUN-12-03',
        log_reference: 'oci://migration-logs/claims/v1.2/run-03.log',
        fix_owner: user('Rohan Das'),
      },
    },
    {
      id: 90020005,
      created: 20,
      stage: 'closed',
      path: [['open', 20], ['fix', 19], ['retest', 15], ['closed', 13]],
      cf: {
        defect_title: 'Index rebuild exits with code 1',
        customer: 'Meridian Health',
        application: 'Patient Billing',
        script_version: 'v2.0',
        failed_check: opt('Execution Error'),
        cutover_impact: opt('Blocking'),
        expected_value: 'Exit code 0',
        actual_value: 'Exit code 1',
        fix_owner: user('Kavya Nair'),
        resolution_notes: 'Rebuild moved after constraint enable in v2.1.',
        retest_script_version: 'v2.1',
      },
    },
    {
      id: 90020006,
      created: 2,
      stage: 'open',
      path: [['open', 2]],
      cf: {
        defect_title: 'Duplicate customer rows in staging',
        customer: 'Acme Logistics',
        application: 'Fleet Billing',
        script_version: 'v0.3',
        failed_check: opt('Record-Level Check'),
        cutover_impact: opt('Blocking'),
        expected_value: '0 duplicates',
        actual_value: '37 duplicates',
        fix_owner: user('Rohan Das'),
      },
    },
  ]

  const toLead = (r, stageOf) => ({
    id: r.id,
    name: null,
    stage: stageOf(r.stage),
    created_at: at(r.created, 9),
    updated_at: at(r.path[r.path.length - 1][1], 11),
    retired: false,
    custom_field_values: r.cf,
  })
  const toEvents = (r, stageOf) =>
    r.path.slice(1).map(([key, daysAgo], i) => ({
      id: r.id * 100 + i,
      created_at: at(daysAgo, 11),
      event_types: ['stage'],
      stage: { name: stageOf(key).name },
      description: `Stage changed to ${stageOf(key).name}`,
      lead: { id: r.id },
      user: { name: 'Kelsa automation' },
    }))

  const fields = (defs, options) =>
    Object.entries(defs).map(([identifier, name]) => ({
      identifier,
      name,
      field_type: options[identifier] ? 'dropdown' : 'text',
      options: (options[identifier] ?? []).map((o, i) => ({ name: o, position: i + 1 })),
    }))

  return {
    migrationLeads: M.map((r) => toLead(r, mStage)),
    defectLeads: D.map((r) => toLead(r, dStage)),
    migrationStages: mStages,
    defectStages: dStages,
    migrationFields: fields(MIGRATION_FIELDS, MIGRATION_OPTIONS),
    defectFields: fields(DEFECT_FIELDS, DEFECT_OPTIONS),
    migrationEvents: M.flatMap((r) => toEvents(r, mStage)),
    defectEvents: D.flatMap((r) => toEvents(r, dStage)),
    migrationStats: null,
    defectStats: null,
  }
}

function hash(s) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return Math.abs(h)
}
