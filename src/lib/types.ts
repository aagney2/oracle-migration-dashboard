export type CheckState = 'pass' | 'fail' | 'stale' | 'missing'
export type Readiness = 'ready' | 'blocked' | 'incomplete'
export type LinkMethod = 'id' | 'version' | 'app'

export interface Check {
  key: string
  label: string
  state: CheckState
  reason: string
  flag?: string
  note?: string
  diff?: number | null
  defectIds?: number[]
}

export interface StageEvent {
  at: string
  stageKey: string | null
  stage: string
  user: string | null
}

export interface Attachment {
  name: string
}

export interface Alert {
  key: 'approvedStage' | 'cleared' | 'evidence'
  detail: string
  kelsa?: string
  computed?: string
}

export interface Migration {
  leadId: number
  label: string
  customer: string | null
  application: string | null
  sourceEnv: string | null
  targetEnv: string | null
  scriptVersion: string | null
  owner: string | null
  stageKey: string | null
  stageName: string
  stageEnteredAt: string | null
  createdAt: string
  updatedAt: string
  history: StageEvent[]
  registration: { approvedStatusMapping: Attachment[]; migrationScript: Attachment[]; testCases: Attachment[] }
  ai: {
    status: string | null
    findingFile: string | null
    findingLine: number | null
    ruleViolated: string | null
    evidence: string | null
    suggestedFix: string | null
    qaDisposition: string | null
    required: string | null
  }
  run: {
    runId: string | null
    runScriptVersion: string | null
    exitCode: number | null
    logReference: string | null
    baselineId: string | null
    status: string | null
  }
  validation: {
    validatedScriptVersion: string | null
    sourceRows: number | null
    targetRows: number | null
    countResult: string | null
    statusExpected: number | null
    statusActual: number | null
    statusResult: string | null
    recordResult: string | null
    mismatchedIds: string[]
  }
  approval: { approvedScriptVersion: string | null; evidenceFlag: string | null; cutoverStatus: string | null }
  checks: Check[]
  readiness: Readiness
  reason: string
  firstFailKey: string | null
  alerts: Alert[]
  defectIds: number[]
  /** Raw stored values, used only to simulate Kelsa searches. */
  q: Record<string, string | null>
}

export interface Defect {
  leadId: number
  title: string
  customer: string | null
  application: string | null
  scriptVersion: string | null
  sourceMigrationId: string | null
  failedCheck: string | null
  impact: string | null
  expected: string | null
  actual: string | null
  affectedIds: string[]
  runId: string | null
  logReference: string | null
  fixOwner: string | null
  resolutionNotes: string | null
  retestScriptVersion: string | null
  stageKey: string | null
  stageName: string
  stageEnteredAt: string | null
  isOpen: boolean
  closedAt: string | null
  retestLoops: number
  createdAt: string
  updatedAt: string
  history: StageEvent[]
  linkMethod: LinkMethod | null
  linkedMigrationIds: number[]
  linkNotes: string[]
  sentence: string
  q: Record<string, string | null>
}

export interface HealthItem {
  text: string
  pipelineKey?: 'migration' | 'defect'
  leadIds?: number[]
  tone: 'ok' | 'info' | 'warn'
}

export interface HealthSection {
  key: string
  title: string
  detail: string
  items: HealthItem[]
}

export interface Dataset {
  source: 'kelsa' | 'sample'
  asOf: string
  fetchedAt: string
  stale: boolean
  refreshMs: number
  accountId: number
  origin: string
  pipelines: {
    migration: { id: number; name: string; count: number }
    defect: { id: number; name: string; count: number }
  }
  migrationStages: { key: string; name: string }[]
  defectStages: { key: string; name: string }[]
  checks: { key: string; label: string; short: string }[]
  linkMethods: Record<LinkMethod, string>
  alertLabels: Record<Alert['key'], string>
  migrations: Migration[]
  defects: Defect[]
  health: HealthSection[]
}
