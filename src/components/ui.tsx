import { ArrowDown, ArrowUp, ChartNoAxesColumn, Info, Table2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { STATE_COLORS, STATE_LABELS, readinessColor, readinessLabel } from '../lib/config'
import { useTipHandlers } from '../lib/context'
import type { DrillSpec } from '../lib/drill'
import type { Check, CheckState, Readiness } from '../lib/types'
import { Drill } from './Drill'

export function tint(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card rounded-card border border-hairline bg-white ${className}`}>{children}</section>
}

export function InfoTip({ children }: { children: ReactNode }) {
  const handlers = useTipHandlers(<div className="max-w-[260px]">{children}</div>)
  return (
    <span {...handlers} className="inline-flex cursor-help text-ink-faint hover:text-ink-muted" aria-label="More information">
      <Info size={14} />
    </span>
  )
}

export function CardHeader({ title, subtitle, info, actions }: { title: ReactNode; subtitle?: ReactNode; info?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4 px-6 pt-5">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold leading-6 text-ink">
          {title}
          {info && <InfoTip>{info}</InfoTip>}
        </h2>
        {subtitle && <p className="mt-0.5 text-[13px] leading-5 text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 no-print">{actions}</div>}
    </header>
  )
}

/** A chart with a "View as table" toggle and a mandatory empty state. */
export function ChartCard({
  title,
  subtitle,
  info,
  table,
  empty,
  legend,
  children,
  className = '',
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  info?: ReactNode
  table?: ReactNode
  /** When set, the chart is replaced by this one-line explanation. */
  empty?: { title: string; message: string } | null
  legend?: ReactNode
  children: ReactNode
  className?: string
  actions?: ReactNode
}) {
  const [asTable, setAsTable] = useState(false)
  const toggle =
    table && !empty ? (
      <button
        type="button"
        onClick={() => setAsTable((v) => !v)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-[12px] font-medium text-ink-soft hover:bg-canvas"
      >
        {asTable ? <ChartNoAxesColumn size={14} /> : <Table2 size={14} />}
        {asTable ? 'View as chart' : 'View as table'}
      </button>
    ) : null
  return (
    <Card className={`flex flex-col ${className}`}>
      <CardHeader title={title} subtitle={subtitle} info={info} actions={<>{actions}{toggle}</>} />
      <div className="flex-1 px-6 pb-6 pt-4">
        {empty ? (
          <EmptyState title={empty.title} message={empty.message} />
        ) : (
          <>
            <div className={asTable ? 'hidden print:block' : ''}>{children}</div>
            {asTable && <div>{table}</div>}
            {legend && !asTable && <div className="mt-4">{legend}</div>}
          </>
        )}
      </div>
    </Card>
  )
}

export function EmptyState({ title, message, compact }: { title: string; message: string; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-hairline bg-canvas/60 text-center ${compact ? 'px-4 py-5' : 'px-6 py-10'}`}>
      <div className="mb-2 grid h-8 w-8 place-items-center rounded-full bg-white text-ink-faint ring-1 ring-hairline">
        <ChartNoAxesColumn size={16} />
      </div>
      <p className="text-[13px] font-semibold text-ink-soft">{title}</p>
      <p className="mt-1 max-w-[440px] text-[13px] leading-5 text-ink-muted">{message}</p>
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string; hollow?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={i.hollow ? { border: `2px solid ${i.color}` } : { background: i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  )
}

export function Kpi({
  label,
  value,
  sub,
  drill,
  info,
  footer,
  accent,
  className = '',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  drill?: DrillSpec
  info?: ReactNode
  footer?: ReactNode
  /** Colour dot beside the label, and the value in that colour. */
  accent?: string
  className?: string
}) {
  const v = (
    <span className="tnum text-[28px] font-semibold leading-9 tracking-tight" style={{ color: accent ?? '#1B2330' }}>
      {value}
    </span>
  )
  return (
    <Card className={`flex flex-col px-5 py-4 ${className}`}>
      <div className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.04em] text-ink-muted">
        {accent && <span className="h-2 w-2 rounded-full" style={{ background: accent }} />}
        {label}
        {info && <InfoTip>{info}</InfoTip>}
      </div>
      <div className="mt-2">{drill ? <Drill spec={drill}>{v}</Drill> : v}</div>
      {sub && <div className="mt-1 text-[13px] leading-5 text-ink-muted">{sub}</div>}
      {footer && <div className="mt-3 border-t border-hairline pt-3 text-[13px] text-ink-soft">{footer}</div>}
    </Card>
  )
}

export function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium" style={{ background: tint(color, 0.12), color: '#1B2330' }}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

export const ReadinessChip = ({ readiness }: { readiness: Readiness }) => <Chip label={readinessLabel(readiness)} color={readinessColor(readiness)} />

/** Compact check result: colour plus its text label, with the reason on hover. */
export function StatePill({ state, check, flag }: { state: CheckState; check?: Check; flag?: string }) {
  const handlers = useTipHandlers(
    check ? (
      <div>
        <div className="font-semibold">
          {check.label}: {STATE_LABELS[state]}
          {check.flag ? ` · ${check.flag}` : ''}
        </div>
        <div className="mt-0.5 text-ink-muted">{check.reason}</div>
      </div>
    ) : null,
  )
  const color = STATE_COLORS[state]
  const shownFlag = flag ?? check?.flag
  return (
    <span
      {...(check ? handlers : {})}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-4"
      style={{ background: tint(color, state === 'missing' ? 0.16 : 0.13), color: state === 'missing' ? '#475467' : '#1B2330' }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      {STATE_LABELS[state]}
      {shownFlag && <span className="font-medium text-ink-muted">· {shownFlag}</span>}
    </span>
  )
}

export function Tag({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'blue' }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12px] font-medium ${tone === 'blue' ? 'bg-accent-soft text-accent-ink' : 'bg-canvas text-ink-soft ring-1 ring-inset ring-hairline'}`}
    >
      {children}
    </span>
  )
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4 mt-2">
      <h1 className="text-[22px] font-semibold leading-8 tracking-tight text-ink">{children}</h1>
      {sub && <p className="mt-1 max-w-[760px] text-[14px] leading-[22px] text-ink-muted">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sortable table
// ---------------------------------------------------------------------------

export interface Column<T> {
  key: string
  label: ReactNode
  render: (row: T) => ReactNode
  sort?: (row: T) => string | number | null
  align?: 'left' | 'right'
  width?: string
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  empty,
  dense,
  pageSize,
  onRowClick,
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string | number
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  empty?: string
  dense?: boolean
  /** Show only the first rows (after sorting) until "Show all" is clicked. */
  pageSize?: number
  onRowClick?: (row: T) => void
}) {
  const [sort, setSort] = useState(initialSort ?? null)
  const [expanded, setExpanded] = useState(false)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sort) return rows
    const get = col.sort
    return [...rows].sort((a, b) => {
      const x = get(a)
      const y = get(b)
      if (x === y) return 0
      if (x === null || x === undefined) return 1
      if (y === null || y === undefined) return -1
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })
      return sort.dir === 'asc' ? c : -c
    })
  }, [rows, columns, sort])
  const limited = pageSize !== undefined && sorted.length > pageSize
  const visible = limited && !expanded ? sorted.slice(0, pageSize) : sorted

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-hairline">
            {columns.map((c) => {
              const active = sort?.key === c.key
              return (
                <th
                  key={c.key}
                  scope="col"
                  style={{ width: c.width }}
                  className={`whitespace-nowrap py-2 pr-4 text-[12px] font-medium text-ink-muted ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {c.sort ? (
                    <button
                      type="button"
                      className={`inline-flex items-center gap-1 hover:text-ink ${active ? 'text-ink' : ''}`}
                      onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 'desc' ? 'asc' : 'desc' }))}
                    >
                      {c.label}
                      {active && (sort!.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-6 text-center text-ink-muted">
                {empty ?? 'Nothing to show.'}
              </td>
            </tr>
          ) : (
            visible.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`border-b border-hairline/70 last:border-0 hover:bg-canvas/60 ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`${dense ? 'py-2' : 'py-3'} pr-4 align-top text-ink ${c.align === 'right' ? 'tnum text-right' : ''}`}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {limited && (
        <div className="no-print flex items-center justify-between border-t border-hairline pt-3 text-[12px] text-ink-muted">
          <span className="tnum">{expanded ? `All ${sorted.length} rows` : `Showing ${pageSize} of ${sorted.length}`}</span>
          <button type="button" onClick={() => setExpanded((e) => !e)} className="font-medium text-accent hover:underline">
            {expanded ? 'Show fewer' : `Show all ${sorted.length}`}
          </button>
        </div>
      )}
    </div>
  )
}
