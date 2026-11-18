import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { useDashboard } from '../lib/context'
import { fmtDateTime } from '../lib/format'
import type { HealthSection } from '../lib/types'
import { KelsaLink, Panel } from './Drawer'

export function healthIssueCount(sections: HealthSection[]) {
  return sections.filter((s) => s.items.some((i) => i.tone === 'warn' || i.tone === 'info')).length
}

export function DataHealthDrawer({ onClose }: { onClose: () => void }) {
  const { data } = useDashboard()
  const p = data.pipelines
  return (
    <Panel title="Data health" subtitle={`Checks on the ${data.source === 'sample' ? 'sample' : 'live Kelsa'} data as of ${fmtDateTime(data.fetchedAt)} IST`} onClose={onClose}>
      <section className="mb-6 rounded-card border border-hairline p-4">
        <h3 className="text-[13px] font-semibold text-ink">Records read from Kelsa</h3>
        <p className="mt-1 text-[12px] text-ink-muted">Every view is built to read correctly with a handful of records and to fill out as real migrations are added.</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {[p.migration, p.defect].map((x) => (
            <div key={x.name} className="rounded-lg bg-canvas px-3 py-2">
              <div className="tnum text-[20px] font-semibold text-ink">{x.count}</div>
              <div className="text-[12px] text-ink-muted">{x.name}</div>
            </div>
          ))}
        </div>
      </section>
      <div className="space-y-3">
        {data.health.map((s) => {
          const flagged = s.items.filter((i) => i.tone !== 'ok')
          return (
            <section key={s.key} className="rounded-card border border-hairline p-4">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                {flagged.some((i) => i.tone === 'warn') ? (
                  <AlertCircle size={15} className="text-[#D03B3B]" />
                ) : flagged.length ? (
                  <Info size={15} className="text-accent" />
                ) : (
                  <CheckCircle2 size={15} className="text-[#1BAF7A]" />
                )}
                {s.title}
                {flagged.length > 0 && <span className="tnum rounded-full bg-canvas px-1.5 text-[11px] font-semibold text-ink-soft">{flagged.length}</span>}
              </h3>
              <p className="mt-1 text-[12px] leading-5 text-ink-muted">{s.detail}</p>
              {s.items.length === 0 ? (
                <p className="mt-2 text-[13px] text-ink-soft">Nothing to report.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {s.items.map((i, n) => (
                    <li key={n} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-[13px] leading-5 text-ink">
                      <span className="min-w-0 flex-1">{i.text}</span>
                      {i.pipelineKey && i.leadIds?.length ? (
                        <span className="flex flex-wrap gap-2">
                          {i.leadIds.slice(0, 4).map((id) => (
                            <KelsaLink key={id} kind={i.pipelineKey!} leadId={id} compact>
                              {i.leadIds!.length > 1 ? `#${id}` : 'Open in Kelsa'}
                            </KelsaLink>
                          ))}
                          {i.leadIds.length > 4 && <span className="text-[12px] text-ink-muted">+{i.leadIds.length - 4} more</span>}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </Panel>
  )
}
