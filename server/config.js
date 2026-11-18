export const KELSA_ORIGIN = (process.env.KELSA_ORIGIN || 'https://kelsa.io').trim().replace(/\/+$/, '')
export const ACCOUNT_ID = 888
export const TIMEZONE = 'Asia/Kolkata'

export const PIPELINES = {
  migration: { id: 21223, name: 'Migration Process' },
  defect: { id: 21222, name: 'Migration Defects' },
}

// Every upstream path is built from one of these. Nothing request-supplied reaches a Kelsa URL otherwise.
export const ALLOWED_PIPELINE_IDS = new Set(Object.values(PIPELINES).map((p) => p.id))

/** Stage identifiers are the stable key. Names come from Kelsa at runtime, so a rename doesn't break anything. */
export const MIGRATION_STAGES = [
  { key: 'register', identifier: 'register_the_migration', name: 'Register the Migration' },
  { key: 'review', identifier: 'review_the_script', name: 'Review the Script' },
  { key: 'rehearsal', identifier: 'run_the_rehearsal', name: 'Run the Rehearsal' },
  { key: 'validate', identifier: 'validate_and_raise_a_defect', name: 'Validate and Raise a Defect' },
  { key: 'retest', identifier: 'retest_and_approve', name: 'Retest and Approve' },
  { key: 'approved', identifier: 'approved_for_cutover', name: 'Approved for Cutover' },
]

export const DEFECT_STAGES = [
  { key: 'open', identifier: 'open', name: 'Open' },
  { key: 'fix', identifier: 'fix_in_progress', name: 'Fix In Progress' },
  { key: 'retest', identifier: 'retest', name: 'Retest' },
  { key: 'closed', identifier: 'closed', name: 'Closed' },
]

/**
 * Option lists as agreed with the client. Values found in Kelsa are matched to
 * these after trimming, case-folding and dash normalisation; anything else is
 * kept as-is and reported in Data health.
 */
export const MIGRATION_OPTIONS = {
  ai_review_status: ['Not Run', 'Completed - Finding Recorded', 'Completed - No Finding', 'Model Unavailable'],
  qa_disposition: ['Proceed to Isolated Rehearsal', 'Fix Script First'],
  ai_review_required: ['Yes', 'No'],
  run_status: ['Not Run', 'Succeeded', 'Failed'],
  count_check_result: ['Pass', 'Fail'],
  status_reconciliation_result: ['Pass', 'Fail'],
  record_level_check_result: ['Pass', 'Fail'],
  evidence_current_and_passing: ['Yes', 'No'],
  cutover_status: ['Blocked', 'Cleared'],
}

export const DEFECT_OPTIONS = {
  failed_check: ['Execution Error', 'Count Check', 'Status Reconciliation', 'Record-Level Check', 'Missing Evidence', 'AI Review'],
  cutover_impact: ['Blocking', 'Non-blocking'],
}

/** Every field the dashboard reads, with its business name. Used to report fields missing from Kelsa. */
export const MIGRATION_FIELDS = {
  customer: 'Customer',
  application: 'Application',
  source_environment: 'Source Environment',
  target_environment: 'Target Environment',
  script_version: 'Script Version',
  migration_owner: 'Migration Owner',
  approved_status_mapping: 'Approved Status Mapping',
  migration_script: 'Migration Script',
  test_cases: 'Test Cases',
  ai_review_status: 'AI Review Status',
  ai_finding_file: 'AI Finding File',
  ai_finding_line: 'AI Finding Line',
  ai_rule_violated: 'AI Rule Violated',
  ai_evidence: 'AI Evidence',
  ai_suggested_fix: 'AI Suggested Fix',
  qa_disposition: 'QA Disposition',
  ai_review_required: 'AI Review Required',
  run_id: 'Run ID',
  run_script_version: 'Run Script Version',
  exit_code: 'Exit Code',
  log_reference: 'Log Reference',
  baseline_id: 'Baseline ID',
  run_status: 'Run Status',
  validated_script_version: 'Validated Script Version',
  source_total_rows: 'Source Total Rows',
  target_total_rows: 'Target Total Rows',
  count_check_result: 'Count Check Result',
  status_expected_count: 'Status Expected Count',
  status_actual_count: 'Status Actual Count',
  status_reconciliation_result: 'Status Reconciliation Result',
  record_level_check_result: 'Record-Level Check Result',
  mismatched_customer_ids: 'Mismatched Customer IDs',
  approved_script_version: 'Approved Script Version',
  evidence_current_and_passing: 'Evidence Current and Passing',
  cutover_status: 'Cutover Status',
}

export const DEFECT_FIELDS = {
  defect_title: 'Defect Title',
  customer: 'Customer',
  application: 'Application',
  script_version: 'Script Version',
  source_migration_id: 'Source Migration ID',
  failed_check: 'Failed Check',
  cutover_impact: 'Cutover Impact',
  expected_value: 'Expected Value',
  actual_value: 'Actual Value',
  affected_record_ids: 'Affected Record IDs',
  run_id: 'Run ID',
  log_reference: 'Log Reference',
  fix_owner: 'Fix Owner',
  resolution_notes: 'Resolution Notes',
  retest_script_version: 'Retest Script Version',
}

export const DATA_TTL_MS = clamp(Number(process.env.DATA_TTL_MS) || 5 * 60_000, 30_000, 60 * 60_000)
export const MIN_FORCED_REFRESH_MS = 15_000
export const KELSA_TIMEOUT_MS = 30_000
export const KELSA_CONCURRENCY = 4
export const PER_PAGE = 250
/** Kelsa's /leads/stats returns at most this many groups per level; a result that reaches it is treated as truncated. */
export const STATS_BUCKET_CAP = 50

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}
