import { ExternalLink, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { useDashboard } from '../lib/context'
import { kelsaRecordUrl, resolve, type DrillSpec } from '../lib/drill'
import { fmtDays, daysSince } from '../lib/format'
import type { Defect, Migration } from '../lib/types'
import { Chip, DataTable, ReadinessChip, type Column } from './ui'
import { DEFECT_STAGE_COLORS, NOT_SET } from '../lib/config'

export function Panel({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  actions?: ReactNode
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="no-print fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} />
      <aside className={`absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-drawer ${wide ? 'max-w-[920px]' : 'max-w-[760px]'}`}>
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
            {subtitle && <div className="mt-1 text-[13px] text-ink-muted">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-canvas">
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="border-t border-hairline px-6 py-4">{footer}</footer>}
      </aside>
    </div>
  )
}

export function KelsaLink({ kind, leadId, children, compact }: { kind: 'migration' | 'defect'; leadId: number; children?: ReactNode; compact?: boolean }) {
  const { data } = useDashboard()
  const pipelineId = kind === 'migration' ? data.pipelines.migration.id : data.pipelines.defect.id
  return (
    <a
      href={kelsaRecordUrl(data.origin, pipelineId, leadId)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 whitespace-nowrap font-medium text-accent hover:underline ${compact ? 'text-[12px]' : ''}`}
      aria-label={children ? undefined : 'Open in Kelsa'}
    >
      {children ?? 'Open in Kelsa'}
      <ExternalLink size={12} />
    </a>
  )
}

export function DefectStageChip({ d }: { d: Defect }) {
  return <Chip label={d.stageName} color={DEFECT_STAGE_COLORS[d.stageKey ?? ''] ?? '#98A2B3'} />
}

export function MigrationName({ m }: { m: Migration }) {
  const { openMigration } = useDashboard()
  return (
    <button type="button" onClick={() => openMigration(m.leadId)} className="text-left hover:underline">
      <div className="font-medium text-ink">
        {m.customer ?? NOT_SET} <span className="text-ink-faint">·</span> {m.application ?? NOT_SET}
      </div>
      <div className="text-[12px] text-ink-muted">{m.scriptVersion ?? 'Version not set'}</div>
    </button>
  )
}

function migrationColumns(): Column<Migration>[] {
  return [
    { key: 'm', label: 'Migration', render: (m) => <MigrationName m={m} />, sort: (m) => m.label },
    { key: 'stage', label: 'Stage', render: (m) => m.stageName, sort: (m) => m.stageName },
    { key: 'ready', label: 'Readiness', render: (m) => <ReadinessChip readiness={m.readiness} />, sort: (m) => m.readiness },
    { key: 'k', label: '', render: (m) => <KelsaLink kind="migration" leadId={m.leadId} compact />, align: 'right' },
  ]
}

function defectColumns(): Column<Defect>[] {
  return [
    {
      key: 't',
      label: 'Defect',
      render: (d) => (
        <div className="max-w-[340px]">
          <div className="font-medium">{d.title}</div>
          <div className="text-[12px] text-ink-muted">{d.sentence}</div>
        </div>
      ),
      sort: (d) => d.title,
    },
    { key: 's', label: 'Stage', render: (d) => <DefectStageChip d={d} />, sort: (d) => d.stageName },
    { key: 'a', label: 'Age', render: (d) => fmtDays(daysSince(d.createdAt)), sort: (d) => daysSince(d.createdAt), align: 'right' },
    { key: 'k', label: '', render: (d) => <KelsaLink kind="defect" leadId={d.leadId} compact />, align: 'right' },
  ]
}

/** In-app list behind a number, with a Kelsa link per record and, where possible, one link for all of them. */
export function RecordDrawer({ spec, onClose }: { spec: DrillSpec; onClose: () => void }) {
  const { ctx } = useDashboard()
  const res = resolve({ ...spec, list: true }, ctx)
  const bulk = res.kind === 'list' ? res.bulk : null
  const n = new Set(spec.records.map((r) => r.leadId)).size
  const noun = spec.kind === 'migration' ? (n === 1 ? 'migration' : 'migrations') : n === 1 ? 'defect' : 'defects'
  return (
    <Panel
      title={spec.title}
      subtitle={`${n} ${noun} · each row opens its Kelsa record`}
      onClose={onClose}
      footer={
        bulk ? (
          <a href={bulk.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-[13px] font-medium text-white hover:bg-accent-ink">
            Open all {n} in Kelsa <ExternalLink size={14} />
          </a>
        ) : (
          <p className="text-[12px] text-ink-muted">This list can’t be expressed as one Kelsa search, so open each record from its row.</p>
        )
      }
    >
      {spec.kind === 'migration' ? (
        <DataTable rows={spec.records as Migration[]} columns={migrationColumns()} rowKey={(r) => r.leadId} dense />
      ) : (
        <DataTable rows={spec.records as Defect[]} columns={defectColumns()} rowKey={(r) => r.leadId} dense />
      )}
    </Panel>
  )
}
