import type { CheckState, Readiness } from './types'

/** Green = Ready/Pass, red = Blocked/Fail, amber = Stale/Incomplete, grey = Missing. Always paired with a text label. */
export const GREEN = '#1BAF7A'
export const RED = '#D03B3B'
export const AMBER = '#E39A00'
export const GREY = '#98A2B3'
export const NEUTRAL = '#98A2B3'
export const ACCENT = '#2A78D6'

export const STATE_COLORS: Record<CheckState, string> = { pass: GREEN, fail: RED, stale: AMBER, missing: GREY }
export const STATE_LABELS: Record<CheckState, string> = { pass: 'Pass', fail: 'Fail', stale: 'Stale', missing: 'Missing' }

export const READINESS: { key: Readiness; label: string; color: string }[] = [
  { key: 'ready', label: 'Ready', color: GREEN },
  { key: 'blocked', label: 'Blocked', color: RED },
  { key: 'incomplete', label: 'Incomplete', color: AMBER },
]
export const readinessLabel = (r: Readiness) => READINESS.find((x) => x.key === r)!.label
export const readinessColor = (r: Readiness) => READINESS.find((x) => x.key === r)!.color

export const NOT_SET = 'Not set'

/** Under this denominator, show "3 of 4" rather than a percentage. */
export const FRACTION_BELOW = 10

/** Most identifiers ORed into one Kelsa search link (Kelsa's list page fails past ~2,000 URL characters). */
export const MAX_IDS_PER_LINK = 60

/** Defects that loop Retest → Fix In Progress at least this often are called out. */
export const RETEST_LOOP_ALERT = 2

/** "Closed in the period" when no created-date range is set. */
export const DEFAULT_PERIOD_DAYS = 30

export const DEFECT_STAGE_COLORS: Record<string, string> = { open: '#D03B3B', fix: '#EB6834', retest: '#E39A00', closed: '#1BAF7A' }
