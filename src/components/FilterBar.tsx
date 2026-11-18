import { Calendar, Check, ChevronDown, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NOT_SET, READINESS } from '../lib/config'
import { useDashboard } from '../lib/context'
import { fmtDate } from '../lib/format'
import { FILTER_LABELS, MULTI, NONE, TEXT_KEYS, clearAll, filterMigrations, migrationDisplay, migrationValue, setFilters, type MultiKey } from '../lib/filters'
import type { Migration } from '../lib/types'

interface Opt {
  value: string
  label: string
  count: number
}

function MultiSelect({ label, options, selected, onChange }: { label: string; options: Opt[]; selected: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()))
  const active = selected.length > 0
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition ${active ? 'border-accent/40 bg-accent-soft text-accent-ink' : 'border-hairline bg-white text-ink-soft hover:border-ink-faint/60'}`}
      >
        {label}
        {active && <span className="tnum rounded bg-white px-1 text-[11px]">{selected.length}</span>}
        <ChevronDown size={14} className={open ? 'rotate-180 transition' : 'transition'} />
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-40 w-72 rounded-xl border border-hairline bg-white p-2 shadow-pop">
          {options.length > 7 && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-hairline px-2">
              <Search size={14} className="text-ink-faint" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}`} className="h-8 w-full bg-transparent text-[13px] outline-none" />
            </div>
          )}
          <div className="max-h-72 overflow-y-auto">
            {shown.length === 0 && <div className="px-2 py-3 text-[13px] text-ink-muted">No values recorded yet.</div>}
            {shown.map((o) => {
              const on = selected.includes(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onChange(on ? selected.filter((s) => s !== o.value) : [...selected, o.value])}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-canvas"
                >
                  <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? 'border-accent bg-accent text-white' : 'border-ink-faint/60'}`}>{on && <Check size={12} />}</span>
                  <span className={`flex-1 truncate ${o.count ? 'text-ink' : 'text-ink-faint'}`}>{o.label}</span>
                  <span className="tnum text-[12px] text-ink-faint">{o.count}</span>
                </button>
              )
            })}
          </div>
          {active && (
            <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-[12px] font-medium text-accent hover:bg-canvas">
              Clear {label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** The most common spelling of a free-text value represents its group. */
export function displayNames(ms: Migration[], key: (typeof TEXT_KEYS)[number]): Map<string, string> {
  const tally = new Map<string, Map<string, number>>()
  for (const m of ms) {
    const k = migrationValue[key](m)
    const shown = migrationDisplay[key](m) ?? NOT_SET
    if (!tally.has(k)) tally.set(k, new Map())
    const t = tally.get(k)!
    t.set(shown, (t.get(shown) ?? 0) + 1)
  }
  const out = new Map<string, string>()
  for (const [k, t] of tally) out.set(k, [...t.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0])
  return out
}

export function FilterBar() {
  const { data, filters, scope } = useDashboard()
  const all = data.migrations

  const opts = useMemo(() => {
    const out = {} as Record<MultiKey, Opt[]>
    for (const key of MULTI) {
      const pool = filterMigrations(all, filters, key)
      const counts = new Map<string, number>()
      for (const m of pool) counts.set(migrationValue[key](m), (counts.get(migrationValue[key](m)) ?? 0) + 1)
      let values: { value: string; label: string }[]
      if (key === 'stage') {
        values = data.migrationStages.map((s) => ({ value: s.key, label: s.name }))
        if (all.some((m) => !m.stageKey)) values.push({ value: NONE, label: 'Unknown stage' })
      } else if (key === 'readiness') {
        values = READINESS.map((r) => ({ value: r.key, label: r.label }))
      } else {
        const names = displayNames(all, key)
        values = [...names.entries()]
          .map(([value, label]) => ({ value, label: value === NONE ? NOT_SET : label }))
          .sort((a, b) => (a.value === NONE ? 1 : b.value === NONE ? -1 : a.label.localeCompare(b.label)))
      }
      out[key] = values.map((v) => ({ ...v, count: counts.get(v.value) ?? 0 }))
    }
    return out
  }, [all, filters, data.migrationStages])

  const chips: { key: string; label: string; onRemove: () => void }[] = []
  for (const k of MULTI) {
    for (const v of filters[k]) {
      const label = opts[k].find((o) => o.value === v)?.label ?? v
      chips.push({ key: `${k}:${v}`, label: `${FILTER_LABELS[k]}: ${label}`, onRemove: () => setFilters((f) => ({ ...f, [k]: f[k].filter((x) => x !== v) })) })
    }
  }
  if (filters.from || filters.to) {
    chips.push({ key: 'dates', label: `Created: ${filters.from ? fmtDate(filters.from) : 'any'} – ${filters.to ? fmtDate(filters.to) : 'any'}`, onRemove: () => setFilters((f) => ({ ...f, from: null, to: null })) })
  }

  return (
    <div className="no-print sticky top-0 z-30 border-b border-hairline bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-4 py-3 sm:px-8">
        {MULTI.map((k) => (
          <MultiSelect key={k} label={FILTER_LABELS[k]} options={opts[k]} selected={filters[k]} onChange={(v) => setFilters((f) => ({ ...f, [k]: v }))} />
        ))}
        <DateRange />
        <span className="tnum ml-auto text-[12px] text-ink-muted">
          {scope.migrations.length} of {all.length} migrations · {scope.defects.length} of {data.defects.length} defects
        </span>
      </div>
      {chips.length > 0 && (
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-4 pb-3 sm:px-8">
          {chips.map((c) => (
            <span key={c.key} className="inline-flex h-7 items-center gap-1 rounded-full border border-accent/30 bg-white pl-3 pr-1 text-[12px] font-medium text-ink">
              {c.label}
              <button type="button" onClick={c.onRemove} aria-label={`Remove ${c.label}`} className="grid h-5 w-5 place-items-center rounded-full text-ink-muted hover:bg-canvas hover:text-ink">
                <X size={12} />
              </button>
            </span>
          ))}
          <button type="button" onClick={clearAll} className="text-[12px] font-medium text-accent hover:underline">
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}

function DateRange() {
  const { filters } = useDashboard()
  const active = Boolean(filters.from || filters.to)
  return (
    <div className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] ${active ? 'border-accent/40 bg-accent-soft' : 'border-hairline bg-white'}`}>
      <Calendar size={14} className="text-ink-muted" />
      <span className="font-medium text-ink-soft">Created</span>
      <input
        type="date"
        aria-label="Created from"
        value={filters.from ?? ''}
        max={filters.to ?? undefined}
        onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || null }))}
        className="tnum h-6 bg-transparent text-[12px] text-ink outline-none"
      />
      <span className="text-ink-faint">–</span>
      <input
        type="date"
        aria-label="Created to"
        value={filters.to ?? ''}
        min={filters.from ?? undefined}
        onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || null }))}
        className="tnum h-6 bg-transparent text-[12px] text-ink outline-none"
      />
    </div>
  )
}
