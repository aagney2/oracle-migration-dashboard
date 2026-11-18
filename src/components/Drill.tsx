import { ExternalLink, List } from 'lucide-react'
import type { ReactNode } from 'react'
import { useDashboard, useTipHandlers } from '../lib/context'
import { resolve, type DrillSpec, type Resolution } from '../lib/drill'

export function useDrill() {
  const dash = useDashboard()
  function resolveSpec(spec: DrillSpec): Resolution {
    return resolve(spec, dash.ctx)
  }
  function activate(spec: DrillSpec, res = resolveSpec(spec)) {
    if (res.kind === 'url') window.open(res.url, '_blank', 'noopener,noreferrer')
    else if (res.kind === 'list') dash.openDrawer(spec)
  }
  return { resolveSpec, activate }
}

export function drillHint(res: Resolution, n: number): string {
  if (res.kind === 'url') return `Open ${n === 1 ? 'this record' : `these ${n} records`} in Kelsa`
  if (res.kind === 'list') return `List ${n === 1 ? 'this record' : `these ${n} records`}`
  return ''
}

export function Drill({ spec, children, className = '', tip }: { spec: DrillSpec; children: ReactNode; className?: string; tip?: ReactNode }) {
  const { resolveSpec, activate } = useDrill()
  const res = resolveSpec(spec)
  const n = new Set(spec.records.map((r) => r.leadId)).size
  const hint = drillHint(res, n)
  const handlers = useTipHandlers(
    <div>
      {tip && <div className="mb-1">{tip}</div>}
      <div className="flex items-center gap-1 text-accent-ink">
        {res.kind === 'url' ? <ExternalLink size={12} /> : <List size={12} />}
        {hint}
      </div>
    </div>,
  )
  if (res.kind === 'none') return <span className={className}>{children}</span>
  return (
    <button
      type="button"
      {...handlers}
      onClick={() => activate(spec, res)}
      aria-label={`${spec.title}: ${hint}`}
      className={`drill rounded-[4px] text-left decoration-accent/40 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${className}`}
    >
      {children}
    </button>
  )
}
