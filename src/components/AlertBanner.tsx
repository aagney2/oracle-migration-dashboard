import { AlertTriangle, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useDashboard } from '../lib/context'
import type { Alert } from '../lib/types'
import { Drill } from './Drill'
import { KelsaLink } from './Drawer'

const ORDER: Alert['key'][] = ['approvedStage', 'cleared', 'evidence']

/** Red banner: migrations Kelsa shows as further along than their evidence supports. */
export function AlertBanner() {
  const { scope, data, openMigration } = useDashboard()
  const [open, setOpen] = useState(true)
  const groups = ORDER.map((key) => ({
    key,
    label: data.alertLabels[key],
    rows: scope.migrations.flatMap((m) => m.alerts.filter((a) => a.key === key).map((a) => ({ m, a }))),
  })).filter((g) => g.rows.length)
  const total = groups.reduce((n, g) => n + g.rows.length, 0)
  if (!total) return null
  const migrations = new Set(groups.flatMap((g) => g.rows.map((r) => r.m.leadId))).size

  return (
    <section className="card mb-6 rounded-card border border-[#F4B4AE] bg-[#FEF3F2]" aria-label="Integrity alerts">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left" aria-expanded={open}>
        <AlertTriangle size={18} className="shrink-0 text-[#D03B3B]" />
        <span className="flex-1 text-[14px] font-semibold text-[#912018]">
          {total} integrity {total === 1 ? 'alert' : 'alerts'} on {migrations} {migrations === 1 ? 'migration' : 'migrations'}
          <span className="ml-2 font-normal text-[#B42318]">Kelsa shows these as further along than their evidence supports.</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-[#B42318] transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="grid gap-4 border-t border-[#F4B4AE] px-5 py-4 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="mb-2 flex items-baseline gap-2 text-[13px] font-semibold text-[#912018]">
                <Drill spec={{ kind: 'migration', title: g.label, records: g.rows.map((r) => r.m), list: true, ignoreFilters: true }} className="tnum">
                  {g.rows.length}
                </Drill>
                <span>{g.label}</span>
              </div>
              <ul className="space-y-1.5">
                {g.rows.map(({ m, a }) => (
                  <li key={m.leadId} className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-inset ring-[#F4B4AE]/60">
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" onClick={() => openMigration(m.leadId)} className="text-left text-[13px] font-medium text-ink hover:underline">
                        {m.label}
                      </button>
                      <KelsaLink kind="migration" leadId={m.leadId} compact />
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-soft">{a.detail}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
