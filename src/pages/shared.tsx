import { Download, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { STATE_LABELS } from '../lib/config'
import { useDashboard } from '../lib/context'
import { downloadCsv, type CsvColumn } from '../lib/csv'
import { kelsaRecordUrl } from '../lib/drill'
import { daysSince, fmtDateTime, normKey } from '../lib/format'
import type { Dataset, Defect, Migration } from '../lib/types'

/** Registers the page's main table with the header's Export menu. */
export function useExport<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  const { setExport } = useDashboard()
  const latest = useRef({ rows, columns })
  latest.current = { rows, columns }
  // Registered once per page; the getters read the latest rows, so a page that
  // rebuilds its row array on every render can't trigger a render loop.
  useEffect(() => {
    setExport({
      filename,
      get rows() {
        return latest.current.rows as unknown[]
      },
      get columns() {
        return latest.current.columns as CsvColumn<unknown>[]
      },
    })
    return () => setExport(null)
  }, [filename, setExport])
}

export function migrationCsv(data: Dataset): CsvColumn<Migration>[] {
  return [
    { label: 'Customer', value: (m) => m.customer },
    { label: 'Application', value: (m) => m.application },
    { label: 'Source environment', value: (m) => m.sourceEnv },
    { label: 'Target environment', value: (m) => m.targetEnv },
    { label: 'Script version', value: (m) => m.scriptVersion },
    { label: 'Migration owner', value: (m) => m.owner },
    { label: 'Stage', value: (m) => m.stageName },
    ...data.checks.map((c) => ({
      label: c.label,
      value: (m: Migration) => {
        const x = m.checks.find((k) => k.key === c.key)!
        return `${STATE_LABELS[x.state]}${x.flag ? ` (${x.flag})` : ''}: ${x.reason}`
      },
    })),
    { label: 'Readiness', value: (m) => m.readiness[0].toUpperCase() + m.readiness.slice(1) },
    { label: 'Reason', value: (m) => m.reason },
    { label: 'Open defects', value: (m) => m.defectIds.length },
    { label: 'Cutover status (Kelsa)', value: (m) => m.approval.cutoverStatus },
    { label: 'Evidence current and passing (Kelsa)', value: (m) => m.approval.evidenceFlag },
    { label: 'Created (IST)', value: (m) => fmtDateTime(m.createdAt) },
    { label: 'Kelsa link', value: (m) => kelsaRecordUrl(data.origin, data.pipelines.migration.id, m.leadId) },
  ]
}

export function defectCsv(data: Dataset, byId: Map<number, Migration>): CsvColumn<Defect>[] {
  return [
    { label: 'Defect', value: (d) => d.title },
    { label: 'Summary', value: (d) => d.sentence },
    { label: 'Customer', value: (d) => d.customer },
    { label: 'Application', value: (d) => d.application },
    { label: 'Script version', value: (d) => d.scriptVersion },
    { label: 'Failed check', value: (d) => d.failedCheck },
    { label: 'Cutover impact', value: (d) => d.impact },
    { label: 'Expected', value: (d) => d.expected },
    { label: 'Actual', value: (d) => d.actual },
    { label: 'Fix owner', value: (d) => d.fixOwner },
    { label: 'Stage', value: (d) => d.stageName },
    { label: 'Age (days)', value: (d) => Math.floor(daysSince(d.createdAt) ?? 0) },
    { label: 'Retest script version', value: (d) => d.retestScriptVersion },
    { label: 'Retest loops', value: (d) => d.retestLoops },
    { label: 'Linked migration', value: (d) => d.linkedMigrationIds.map((id) => byId.get(id)?.label ?? id).join('; ') },
    { label: 'Match method', value: (d) => (d.linkMethod ? data.linkMethods[d.linkMethod] : 'Unlinked') },
    { label: 'Kelsa link', value: (d) => kelsaRecordUrl(data.origin, data.pipelines.defect.id, d.leadId) },
  ]
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-8 w-full items-center gap-2 rounded-lg border border-hairline bg-white px-2.5 sm:w-64">
      <Search size={14} className="shrink-0 text-ink-faint" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-7 w-full bg-transparent text-[13px] outline-none" />
    </label>
  )
}

export function CsvButton<T>({ filename, rows, columns }: { filename: string; rows: T[]; columns: CsvColumn<T>[] }) {
  return (
    <button
      type="button"
      disabled={!rows.length}
      onClick={() => downloadCsv(filename, rows, columns)}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-[12px] font-medium text-ink-soft hover:bg-canvas disabled:opacity-50"
    >
      <Download size={14} />
      CSV
    </button>
  )
}

/** Case-insensitive search across the given fields. */
export function useSearch<T>(rows: T[], fields: (r: T) => (string | null | undefined)[]) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const k = normKey(q)
    if (!k) return rows
    return rows.filter((r) => fields(r).some((f) => normKey(f).includes(k)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q])
  return { q, setQ, filtered }
}

export const groupBy = <T,>(rows: T[], key: (r: T) => string) => {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(r)
  }
  return map
}
