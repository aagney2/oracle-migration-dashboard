import { useState } from 'react'
import { HBarChart, type BarRow, type Segment } from '../components/charts/bars'
import { DefectStageChip, KelsaLink } from '../components/Drawer'
import { Card, CardHeader, ChartCard, DataTable, EmptyState, Kpi, Legend, SectionTitle, Tag, type Column } from '../components/ui'
import { ACCENT, AMBER, DEFAULT_PERIOD_DAYS, GREY, NOT_SET, RED, RETEST_LOOP_ALERT } from '../lib/config'
import { useDashboard } from '../lib/context'
import type { Term } from '../lib/drill'
import { addDaysIso, daysBetween, daysSince, fmtDate, fmtDays, istDate, median } from '../lib/format'
import type { Defect, Migration } from '../lib/types'
import { CsvButton, SearchBox, defectCsv, groupBy, useExport, useSearch } from './shared'

const IMPACTS = [
  { key: 'Blocking', label: 'Blocking', color: RED },
  { key: 'Non-blocking', label: 'Non-blocking', color: ACCENT },
  { key: '', label: 'Impact not set or unrecognised', color: GREY },
]
const impactKey = (d: Defect) => (d.impact === 'Blocking' || d.impact === 'Non-blocking' ? d.impact : '')

export function Defects() {
  const { data, scope, all, filters } = useDashboard()
  const ds = scope.defects
  const open = ds.filter((d) => d.isOpen)
  const openStages = data.defectStages.filter((s) => s.key !== 'closed').map((s) => s.name)
  const openTerm: Term = { field: 'stage', op: ':', values: openStages }
  const blocking = open.filter((d) => d.impact === 'Blocking')
  const retest = ds.filter((d) => d.stageKey === 'retest')
  const retestName = data.defectStages.find((s) => s.key === 'retest')?.name

  const today = istDate(new Date().toISOString())!
  const periodFrom = filters.from ?? addDaysIso(today, -DEFAULT_PERIOD_DAYS)
  const periodTo = filters.to ?? today
  const periodLabel = filters.from || filters.to ? `${fmtDate(periodFrom)} – ${fmtDate(periodTo)}` : `Last ${DEFAULT_PERIOD_DAYS} days`
  const closedInPeriod = ds.filter((d) => {
    const c = istDate(d.closedAt)
    return !d.isOpen && c !== null && c >= periodFrom && c <= periodTo
  })
  const closedAll = ds.filter((d) => !d.isOpen)
  const medAge = median(open.map((d) => daysSince(d.createdAt)))
  const medClose = median(closedAll.map((d) => daysBetween(d.createdAt, d.closedAt)))
  const noCloseTime = closedAll.filter((d) => !d.closedAt).length

  const loops = ds.filter((d) => d.retestLoops >= RETEST_LOOP_ALERT)
  const anyLoops = ds.filter((d) => d.retestLoops > 0)
  const totalLoops = ds.reduce((n, d) => n + d.retestLoops, 0)
  const unlinked = ds.filter((d) => !d.linkMethod)

  // ---- Breakdowns of open defects, each bar split by cutover impact
  const impactSegments = (recs: Defect[], title: string, terms?: Term[]): Segment[] =>
    IMPACTS.map((i) => {
      const r = recs.filter((d) => impactKey(d) === i.key)
      return {
        key: i.key || 'none',
        label: i.label,
        value: r.length,
        color: i.color,
        drill: { kind: 'defect' as const, title: `${title} · ${i.label}`, records: r, terms: terms && i.key ? [...terms, { field: 'cf_cutover_impact', op: ':' as const, values: [i.key] }] : undefined },
      }
    })
  const breakdown = (key: (d: Defect) => string | null, title: string, field?: string): BarRow[] =>
    [...groupBy(open, (d) => key(d) ?? '').entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([k, recs]) => {
        const raw = field ? recs[0].q[field] : null
        const sameRaw = field && raw && recs.every((d) => d.q[field] === raw)
        const terms = sameRaw ? [openTerm, { field, op: ':' as const, values: [raw!] }] : undefined
        return { key: k || 'none', label: k || NOT_SET, segments: impactSegments(recs, `Open defects · ${title}: ${k || NOT_SET}`, terms) }
      })

  const byStage: BarRow[] = data.defectStages
    .filter((s) => s.key !== 'closed')
    .map((s) => {
      const recs = open.filter((d) => d.stageKey === s.key)
      return { key: s.key, label: s.name, segments: impactSegments(recs, s.name, [{ field: 'stage', op: ':', values: [s.name] }]) }
    })
  const otherStage = open.filter((d) => !d.stageKey)
  if (otherStage.length) byStage.push({ key: 'unknown', label: 'Unknown stage', segments: impactSegments(otherStage, 'Unknown stage') })

  const byCheck = breakdown((d) => d.failedCheck, 'Failed check', 'cf_failed_check')
  const byApp = breakdown((d) => (d.customer || d.application ? `${d.customer ?? NOT_SET} · ${d.application ?? NOT_SET}` : null), 'Customer · Application')
  const byOwner = breakdown((d) => d.fixOwner, 'Fix owner', 'cf_fix_owner')

  const noOpen = open.length === 0 ? { title: ds.length ? 'No open defects' : 'No defects match these filters', message: ds.length ? 'Every defect in view is closed.' : 'Defects appear here once they’re raised in Kelsa.' } : null
  const legend = <Legend items={IMPACTS.map((i) => ({ label: i.label, color: i.color }))} />
  const breakdownTable = (rows: BarRow[], label: string) => (
    <DataTable
      rows={rows}
      rowKey={(r) => r.key}
      dense
      columns={[{ key: 'l', label, render: (r) => r.label }, ...IMPACTS.map((i, n) => ({ key: i.key || 'none', label: i.label, align: 'right' as const, render: (r: BarRow) => r.segments[n].value }))]}
    />
  )

  const csv = defectCsv(data, all.migrationById)
  useExport('oracle-migration-defects.csv', ds, csv)

  return (
    <>
      <SectionTitle sub="Defects raised during validation, where they’re stuck, and which migrations they hold back. Each defect is linked to its migration by record ID, then customer + application + script version, then customer + application.">
        Defects
      </SectionTitle>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi label="Open" value={open.length} drill={{ kind: 'defect', title: 'Open defects', records: open, terms: [openTerm] }} sub="Not yet closed" />
        <Kpi
          label="Blocking, open"
          value={blocking.length}
          accent={blocking.length ? RED : undefined}
          sub="Hold their migration at the gate"
          drill={{ kind: 'defect', title: 'Open blocking defects', records: blocking, terms: [openTerm, { field: 'cf_cutover_impact', op: ':', values: ['Blocking'] }] }}
        />
        <Kpi
          label="In retest"
          value={retest.length}
          sub="Fix delivered, being retested"
          drill={{ kind: 'defect', title: 'Defects in retest', records: retest, terms: retestName ? [{ field: 'stage', op: ':', values: [retestName] }] : undefined }}
        />
        <Kpi label="Closed in period" value={closedInPeriod.length} sub={periodLabel} drill={{ kind: 'defect', title: `Closed · ${periodLabel}`, records: closedInPeriod, list: true }} />
        <Kpi label="Median age of open" value={fmtDays(medAge)} sub={open.length ? `Across ${open.length} open` : 'No open defects'} drill={{ kind: 'defect', title: 'Open defects', records: open, terms: [openTerm] }} />
        <Kpi
          label="Median time to close"
          value={fmtDays(medClose)}
          sub={closedAll.length ? `Across ${closedAll.length - noCloseTime} closed${noCloseTime ? ` (${noCloseTime} without a close time)` : ''}` : 'Nothing closed yet'}
          drill={{ kind: 'defect', title: 'Closed defects', records: closedAll, list: true }}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Open defects by stage" subtitle="Where open defects sit in the fix cycle." empty={noOpen} legend={legend} table={breakdownTable(byStage, 'Stage')}>
          <HBarChart rows={byStage} labelWidth={170} axisLabel="Open defects" />
        </ChartCard>
        <ChartCard title="Open defects by failed check" subtitle="Which validation check raised them." empty={noOpen} legend={legend} table={breakdownTable(byCheck, 'Failed check')}>
          <HBarChart rows={byCheck} labelWidth={190} axisLabel="Open defects" />
        </ChartCard>
        <ChartCard title="Open defects by customer and application" subtitle="As recorded on the defect." empty={noOpen} legend={legend} table={breakdownTable(byApp, 'Customer · Application')}>
          <HBarChart rows={byApp} labelWidth={230} axisLabel="Open defects" />
        </ChartCard>
        <ChartCard title="Open defects by fix owner" subtitle="Who the fix is with." empty={noOpen} legend={legend} table={breakdownTable(byOwner, 'Fix owner')}>
          <HBarChart rows={byOwner} labelWidth={190} axisLabel="Open defects" />
        </ChartCard>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Retest loops"
          subtitle={`Times a defect went from ${retestName ?? 'Retest'} back to ${data.defectStages.find((s) => s.key === 'fix')?.name ?? 'Fix In Progress'}, counted from Kelsa stage history. Defects with ${RETEST_LOOP_ALERT} or more loops are listed.`}
        />
        <div className="px-6 pb-5 pt-4">
          <div className="mb-4 flex flex-wrap gap-x-8 gap-y-2 text-[13px] text-ink-soft">
            <span>
              <span className="tnum text-[20px] font-semibold text-ink">{totalLoops}</span> loops in total
            </span>
            <span>
              <span className="tnum text-[20px] font-semibold text-ink">{anyLoops.length}</span> defects looped at least once
            </span>
            <span>
              <span className="tnum text-[20px] font-semibold" style={{ color: loops.length ? AMBER : undefined }}>
                {loops.length}
              </span>{' '}
              looped {RETEST_LOOP_ALERT}+ times
            </span>
          </div>
          {loops.length === 0 ? (
            <EmptyState compact title={`No defect has looped ${RETEST_LOOP_ALERT} or more times`} message="Fixes are passing retest within one attempt." />
          ) : (
            <DataTable
              rows={loops}
              rowKey={(d) => d.leadId}
              dense
              initialSort={{ key: 'n', dir: 'desc' }}
              columns={[
                titleColumn,
                { key: 'n', label: 'Loops', align: 'right', render: (d) => <span className="tnum font-semibold" style={{ color: AMBER }}>{d.retestLoops}</span>, sort: (d) => d.retestLoops },
                { key: 'st', label: 'Stage', render: (d) => <DefectStageChip d={d} />, sort: (d) => d.stageName },
                { key: 'o', label: 'Fix owner', render: (d) => d.fixOwner ?? <span className="text-ink-faint">{NOT_SET}</span> },
                { key: 'k', label: '', align: 'right', render: (d) => <KelsaLink kind="defect" leadId={d.leadId} compact /> },
              ]}
            />
          )}
        </div>
      </Card>

      <DefectTable rows={ds} csv={csv} />

      <Card className="mt-4">
        <CardHeader title="Unlinked defects" subtitle="Defects that couldn’t be matched to any migration by record ID, customer + application + script version, or customer + application. They’re kept here so none are lost." />
        <div className="px-6 pb-5 pt-4">
          {unlinked.length === 0 ? (
            <EmptyState compact title="Every defect is linked to a migration" message="Nothing is waiting to be matched." />
          ) : (
            <DataTable
              rows={unlinked}
              rowKey={(d) => d.leadId}
              dense
              columns={[
                titleColumn,
                { key: 'c', label: 'Customer · Application', render: (d) => `${d.customer ?? NOT_SET} · ${d.application ?? NOT_SET}`, sort: (d) => d.customer },
                { key: 'v', label: 'Script version', render: (d) => d.scriptVersion ?? <span className="text-ink-faint">{NOT_SET}</span> },
                { key: 's', label: 'Source migration ID', render: (d) => d.sourceMigrationId ?? <span className="text-ink-faint">{NOT_SET}</span> },
                { key: 'why', label: 'Why it didn’t match', render: (d) => <span className="block max-w-[360px] text-[12px] leading-[18px] text-ink-muted">{d.linkNotes.join(' ') || 'No migration has the same customer and application.'}</span> },
                { key: 'st', label: 'Stage', render: (d) => <DefectStageChip d={d} /> },
                { key: 'k', label: '', align: 'right', render: (d) => <KelsaLink kind="defect" leadId={d.leadId} compact /> },
              ]}
            />
          )}
        </div>
      </Card>
    </>
  )
}

const titleColumn: Column<Defect> = {
  key: 't',
  label: 'Defect',
  render: (d) => (
    <div className="min-w-[200px] max-w-[360px]">
      <div className="font-medium">{d.title}</div>
      <div className="mt-0.5 text-[12px] leading-[18px] text-ink-muted">{d.sentence}</div>
    </div>
  ),
  sort: (d) => d.title.toLowerCase(),
}

const SHOW = [
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
] as const

function DefectTable({ rows, csv }: { rows: Defect[]; csv: ReturnType<typeof defectCsv> }) {
  const { data, all, openMigration } = useDashboard()
  const [show, setShow] = useState<(typeof SHOW)[number]['key']>('open')
  const shown = rows.filter((d) => (show === 'all' ? true : show === 'open' ? d.isOpen : !d.isOpen))
  const { q, setQ, filtered } = useSearch(shown, (d) => [d.title, d.sentence, d.customer, d.application, d.fixOwner, d.failedCheck, d.stageName])
  const linked = (d: Defect) => d.linkedMigrationIds.map((id) => all.migrationById.get(id)).filter((m): m is Migration => Boolean(m))

  return (
    <Card className="mt-4">
      <CardHeader
        title="All defects"
        subtitle="Each defect in plain words, with what it affects and who owns the fix."
        actions={
          <>
            <div className="hidden rounded-lg border border-hairline p-0.5 sm:flex">
              {SHOW.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setShow(s.key)}
                  className={`h-7 rounded-md px-2.5 text-[12px] font-medium ${show === s.key ? 'bg-ink text-white' : 'text-ink-soft hover:bg-canvas'}`}
                >
                  {s.label} <span className="tnum opacity-70">{rows.filter((d) => (s.key === 'all' ? true : s.key === 'open' ? d.isOpen : !d.isOpen)).length}</span>
                </button>
              ))}
            </div>
            <SearchBox value={q} onChange={setQ} placeholder="Search defects" />
            <CsvButton filename="oracle-migration-defects.csv" rows={filtered} columns={csv} />
          </>
        }
      />
      <div className="px-6 pb-5 pt-4">
        {rows.length === 0 ? (
          <EmptyState title="No defects match these filters" message="Defects appear here once they’re raised in Kelsa." />
        ) : (
          <DataTable
            rows={filtered}
            rowKey={(d) => d.leadId}
            dense
            pageSize={50}
            initialSort={{ key: 'age', dir: 'desc' }}
            empty={q ? 'No defects match this search.' : `No ${show === 'all' ? '' : show} defects.`}
            columns={[
              titleColumn,
              { key: 'c', label: 'Customer · Application', render: (d) => <span className="whitespace-nowrap">{d.customer ?? NOT_SET} · {d.application ?? NOT_SET}</span>, sort: (d) => `${d.customer ?? ''}|${d.application ?? ''}` },
              { key: 'fc', label: 'Failed check', render: (d) => d.failedCheck ?? <span className="text-ink-faint">{NOT_SET}</span>, sort: (d) => d.failedCheck },
              {
                key: 'imp',
                label: 'Cutover impact',
                render: (d) =>
                  d.impact ? (
                    <span className="whitespace-nowrap font-medium" style={{ color: d.impact === 'Blocking' ? RED : undefined }}>
                      {d.impact}
                    </span>
                  ) : (
                    <span className="text-ink-faint">{NOT_SET}</span>
                  ),
                sort: (d) => (d.impact === 'Blocking' ? 0 : d.impact ? 1 : 2),
              },
              {
                key: 'ea',
                label: 'Expected → Actual',
                render: (d) => (
                  <span className="block max-w-[220px] text-[12px] leading-[18px]">
                    {d.expected ?? '—'} <span className="text-ink-faint">→</span> {d.actual ?? '—'}
                  </span>
                ),
              },
              {
                key: 'ids',
                label: 'Affected IDs',
                align: 'right',
                render: (d) => (d.affectedIds.length ? <span title={d.affectedIds.join(', ')}>{d.affectedIds.length}</span> : <span className="text-ink-faint">0</span>),
                sort: (d) => d.affectedIds.length,
              },
              { key: 'o', label: 'Fix owner', render: (d) => d.fixOwner ?? <span className="text-ink-faint">{NOT_SET}</span>, sort: (d) => d.fixOwner },
              { key: 'st', label: 'Stage', render: (d) => <DefectStageChip d={d} />, sort: (d) => data.defectStages.findIndex((s) => s.key === d.stageKey) },
              {
                key: 'age',
                label: 'Age',
                align: 'right',
                render: (d) => <span className="whitespace-nowrap">{d.isOpen ? fmtDays(daysSince(d.createdAt)) : `closed in ${fmtDays(daysBetween(d.createdAt, d.closedAt))}`}</span>,
                sort: (d) => (d.isOpen ? (daysSince(d.createdAt) ?? 0) : -1),
              },
              { key: 'rv', label: 'Retest version', render: (d) => d.retestScriptVersion ?? <span className="text-ink-faint">—</span>, sort: (d) => d.retestScriptVersion },
              {
                key: 'mig',
                label: 'Linked migration',
                render: (d) => {
                  const ms = linked(d)
                  if (!ms.length) return <Tag>Unlinked</Tag>
                  return (
                    <div className="min-w-[180px] space-y-1">
                      {ms.map((m) => (
                        <button key={m.leadId} type="button" onClick={() => openMigration(m.leadId)} className="block text-left text-[12px] font-medium leading-4 text-ink hover:underline">
                          {m.label}
                        </button>
                      ))}
                      <div className="text-[11px] text-ink-muted">Matched by {data.linkMethods[d.linkMethod!].toLowerCase()}</div>
                    </div>
                  )
                },
                sort: (d) => linked(d)[0]?.label ?? null,
              },
              { key: 'k', label: '', align: 'right', render: (d) => <KelsaLink kind="defect" leadId={d.leadId} compact /> },
            ]}
          />
        )}
      </div>
    </Card>
  )
}
