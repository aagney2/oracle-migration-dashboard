import { ChevronDown, Download, FileText, Printer, RefreshCw, Stethoscope } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ExportSpec } from '../lib/context'
import { downloadCsv } from '../lib/csv'
import { PAGES, navigate, type PagePath } from '../lib/filters'
import { fmtDateTime } from '../lib/format'

export function Header({
  fetchedAt,
  stale,
  sample,
  refreshing,
  onRefresh,
  exportSpec,
  page,
  healthCount,
  onHealth,
  refreshMinutes,
}: {
  fetchedAt: string
  stale: boolean
  sample: boolean
  refreshing: boolean
  onRefresh: () => void
  exportSpec: ExportSpec | null
  page: PagePath
  healthCount: number
  onHealth: () => void
  refreshMinutes: number
}) {
  return (
    <header className="border-b border-hairline bg-white">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-4 px-4 pb-0 pt-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent text-white">
            <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
              <path d="M8 16.5l5 5L24 10.5" stroke="currentColor" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[17px] font-semibold leading-6 tracking-tight text-ink">
              Oracle <span className="text-ink-faint">·</span> Migration Cutover Readiness
            </div>
            <div className="text-[12px] text-ink-muted">
              Last updated <span className="tnum">{fmtDateTime(fetchedAt)}</span> IST · refreshes every {refreshMinutes} min
              {stale && <span className="ml-2 font-medium text-ink-soft">· Showing last good data; Kelsa didn’t respond to the latest refresh</span>}
            </div>
          </div>
          {sample && <span className="ml-1 rounded-md bg-[#FEF0C7] px-2 py-1 text-[12px] font-semibold text-[#93370D]">Sample data</span>}
        </div>
        <div className="no-print ml-auto flex items-center gap-2">
          <button type="button" onClick={onHealth} className="inline-flex h-9 items-center gap-2 rounded-lg border border-hairline px-3 text-[13px] font-medium text-ink-soft hover:bg-canvas">
            <Stethoscope size={15} />
            <span className="hidden sm:inline">Data health</span>
            {healthCount > 0 && <span className="tnum rounded-full bg-accent-soft px-1.5 text-[11px] font-semibold text-accent-ink">{healthCount}</span>}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-hairline px-3 text-[13px] font-medium text-ink-soft hover:bg-canvas disabled:opacity-60"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
          <ExportMenu spec={exportSpec} />
        </div>
        <nav className="no-print -mb-px flex w-full gap-1 overflow-x-auto" aria-label="Pages">
          {PAGES.map((p) => {
            const active = p.path === page
            return (
              <a
                key={p.path}
                href={`/${p.path === 'overview' ? '' : p.path}${window.location.search}`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) return
                  e.preventDefault()
                  navigate(p.path)
                }}
                aria-current={active ? 'page' : undefined}
                className={`whitespace-nowrap border-b-2 px-3 pb-3 pt-4 text-[13px] font-medium transition ${active ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
              >
                {p.label}
              </a>
            )
          })}
        </nav>
      </div>
    </header>
  )
}

function ExportMenu({ spec }: { spec: ExportSpec | null }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-ink">
        <Download size={15} />
        <span className="hidden sm:inline">Export</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-64 rounded-xl border border-hairline bg-white p-1.5 shadow-pop">
          <button
            type="button"
            disabled={!spec}
            onClick={() => {
              if (spec) downloadCsv(spec.filename, spec.rows, spec.columns)
              setOpen(false)
            }}
            className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-canvas disabled:opacity-50"
          >
            <FileText size={16} className="mt-0.5 text-ink-muted" />
            <span>
              <span className="block text-[13px] font-medium text-ink">CSV</span>
              <span className="block text-[12px] text-ink-muted">{spec ? `${spec.rows.length} rows, current filters` : 'Nothing to export on this page'}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setTimeout(() => window.print(), 50)
            }}
            className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-canvas"
          >
            <Printer size={16} className="mt-0.5 text-ink-muted" />
            <span>
              <span className="block text-[13px] font-medium text-ink">Print / Save as PDF</span>
              <span className="block text-[12px] text-ink-muted">This page, print-formatted</span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
