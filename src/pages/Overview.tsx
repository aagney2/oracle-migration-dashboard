import { HBarChart, type BarRow } from '../components/charts/bars'
import { Drill } from '../components/Drill'
import { KelsaLink } from '../components/Drawer'
import { Card, CardHeader, ChartCard, DataTable, Kpi, Legend, ReadinessChip, SectionTitle, StatePill, type Column } from '../components/ui'
import { GREY, NOT_SET, READINESS, RED, STATE_COLORS } from '../lib/config'
import { useDashboard } from '../lib/context'
import { daysSince, fmtDays, median } from '../lib/format'
import type { CheckState, Migration } from '../lib/types'
import { CsvButton, SearchBox, migrationCsv, useExport, useSearch } from './shared'

const STATE_RANK: Record<CheckState, number> = { fail: 0, stale: 1, missing: 2, pass: 3 }

export function Overview() {
  const { data, scope, openMigration } = useDashboard()
  const ms = scope.migrations
  const csv = migrationCsv(data)
  useExport('oracle-migration-readiness.csv', ms, csv)

  const by = (r: string) => ms.filter((m) => m.readiness === r)
  const cleared = ms.filter((m) => m.approval.cutoverStatus === 'Cleared')
  const clearedOk = cleared.filter((m) => m.readiness === 'ready')
  const openDefects = scope.defects.filter((d) => d.isOpen)
  const blocking = openDefects.filter((d) => d.impact === 'Blocking')
  const alerted = ms.filter((m) => m.alerts.length)
  const alertCount = alerted.reduce((n, m) => n + m.alerts.length, 0)
  const empty = ms.length === 0 ? { title: 'No migrations match these filters', message: 'Clear a filter, or register a migration in Kelsa, to see it here.' } : null

  // ---- Stage funnel
  const stageRows: BarRow[] = data.migrationStages.map((s) => {
    const inStage = ms.filter((m) => m.stageKey === s.key)
    const med = median(inStage.map((m) => daysSince(m.stageEnteredAt)))
    return {
      key: s.key,
      label: s.name,
      sublabel: inStage.length ? (med !== null ? `median ${fmtDays(med)} in stage` : 'time in stage unknown') : 'none here',
      segments: READINESS.map((r) => {
        const recs = inStage.filter((m) => m.readiness === r.key)
        return {
          key: r.key,
          label: r.label,
          value: recs.length,
          color: r.color,
          drill: { kind: 'migration' as const, title: `${s.name} · ${r.label}`, records: recs, terms: [{ field: 'stage', op: ':' as const, values: [s.name] }] },
        }
      }),
    }
  })
  const unknownStage = ms.filter((m) => !m.stageKey)
  if (unknownStage.length) {
    stageRows.push({
      key: 'unknown',
      label: 'Unknown stage',
      segments: [{ key: 'u', label: 'Migrations', value: unknownStage.length, color: GREY, drill: { kind: 'migration', title: 'In an unknown stage', records: unknownStage, list: true } }],
    })
  }

  // ---- Blocked by first failing check
  const blocked = by('blocked')
  const blockedRows: BarRow[] = data.checks
    .map((c) => {
      const recs = blocked.filter((m) => m.firstFailKey === c.key)
      return { key: c.key, label: c.label, segments: [{ key: c.key, label: 'Blocked here first', value: recs.length, color: RED, drill: { kind: 'migration' as const, title: `Blocked first by ${c.label.toLowerCase()}`, records: recs } }] }
    })
    .filter((r) => r.segments[0].value > 0)
    .sort((a, b) => b.segments[0].value - a.segments[0].value)

  return (
    <>
      <SectionTitle sub="Which migrations are safe to cut over, which are blocked, and why. Readiness is computed from the evidence on each record (9 checks on the current script version), never from the Kelsa stage alone.">
        Cutover readiness
      </SectionTitle>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi label="Migrations" value={ms.length} sub="Registered in Kelsa" drill={{ kind: 'migration', title: 'Migrations', records: ms }} />
        <Card className="flex flex-col px-5 py-4 sm:col-span-2">
          <div className="text-[12px] font-medium uppercase tracking-[0.04em] text-ink-muted">Computed readiness</div>
          <div className="mt-2 grid grid-cols-3 gap-3">
            {READINESS.map((r) => {
              const recs = by(r.key)
              return (
                <div key={r.key}>
                  <Drill spec={{ kind: 'migration', title: `${r.label} for cutover`, records: recs }} className="tnum text-[28px] font-semibold leading-9 tracking-tight">
                    <span style={{ color: recs.length ? r.color : undefined }}>{recs.length}</span>
                  </Drill>
                  <div className="flex items-center gap-1.5 text-[13px] text-ink-soft">
                    <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                    {r.label}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-canvas">
            {READINESS.map((r) => (ms.length ? <div key={r.key} style={{ width: `${(by(r.key).length / ms.length) * 100}%`, background: r.color }} /> : null))}
          </div>
        </Card>
        <Kpi
          label="Cleared for cutover"
          value={cleared.length}
          info="Cutover Status = Cleared in Kelsa. The computed gate is shown alongside, because Kelsa doesn’t enforce it."
          sub={cleared.length ? `${clearedOk.length} of ${cleared.length} pass the computed gate` : 'Cutover Status = Cleared in Kelsa'}
          drill={{ kind: 'migration', title: 'Cutover Status = Cleared', records: cleared, terms: [{ field: 'cf_cutover_status', op: ':', values: ['Cleared'] }] }}
        />
        <Kpi
          label="Open defects"
          value={openDefects.length}
          drill={{ kind: 'defect', title: 'Open defects', records: openDefects, terms: [{ field: 'stage', op: ':', values: data.defectStages.filter((s) => s.key !== 'closed').map((s) => s.name) }] }}
          footer={
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: RED }} />
                Blocking cutover
              </span>
              <Drill
                spec={{
                  kind: 'defect',
                  title: 'Open blocking defects',
                  records: blocking,
                  terms: [
                    { field: 'stage', op: ':', values: data.defectStages.filter((s) => s.key !== 'closed').map((s) => s.name) },
                    { field: 'cf_cutover_impact', op: ':', values: ['Blocking'] },
                  ],
                }}
                className="tnum text-[15px] font-semibold"
              >
                <span style={{ color: blocking.length ? RED : undefined }}>{blocking.length}</span>
              </Drill>
            </span>
          }
        />
        <Kpi
          label="Integrity alerts"
          value={alertCount}
          accent={alertCount ? RED : undefined}
          sub={alertCount ? `On ${alerted.length} ${alerted.length === 1 ? 'migration' : 'migrations'}` : 'Kelsa agrees with the evidence'}
          drill={{ kind: 'migration', title: 'Migrations with integrity alerts', records: alerted, list: true }}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <ChartCard
          className="xl:col-span-7"
          title="Stage funnel"
          subtitle="Migrations in each Kelsa stage, split by computed readiness, with the median time they’ve spent in their current stage."
          info="Time in stage is measured from the last stage-change event into the current stage."
          empty={empty}
          legend={<Legend items={READINESS.map((r) => ({ label: r.label, color: r.color }))} />}
          table={
            <DataTable
              rows={stageRows}
              rowKey={(r) => r.key}
              dense
              columns={[
                { key: 'stage', label: 'Stage', render: (r) => r.label },
                ...READINESS.map((x, i) => ({ key: x.key, label: x.label, align: 'right' as const, render: (r: BarRow) => r.segments[i]?.value ?? 0 })),
                { key: 'med', label: 'Time in stage', render: (r) => r.sublabel ?? '' },
              ]}
            />
          }
        >
          <HBarChart rows={stageRows} labelWidth={210} axisLabel="Migrations" />
        </ChartCard>
        <ChartCard
          className="xl:col-span-5"
          title="Blocked by"
          subtitle="Blocked migrations, by the first check that fails or is stale."
          empty={empty ?? (blocked.length === 0 ? { title: 'No migration is blocked', message: 'Nothing has a failing or stale check right now.' } : null)}
          table={<DataTable rows={blockedRows} rowKey={(r) => r.key} dense columns={[{ key: 'c', label: 'First failing check', render: (r) => r.label }, { key: 'n', label: 'Migrations', align: 'right', render: (r) => r.segments[0].value }]} />}
        >
          <HBarChart rows={blockedRows} labelWidth={190} axisLabel="Blocked migrations" />
        </ChartCard>
      </div>

      <Matrix rows={ms} onOpen={openMigration} csv={csv} />
    </>
  )
}

function Matrix({ rows, onOpen, csv }: { rows: Migration[]; onOpen: (id: number) => void; csv: ReturnType<typeof migrationCsv> }) {
  const { data, all } = useDashboard()
  const { q, setQ, filtered } = useSearch(rows, (m) => [m.customer, m.application, m.scriptVersion, m.owner, m.sourceEnv, m.targetEnv, m.stageName, m.readiness])

  const columns: Column<Migration>[] = [
    { key: 'customer', label: 'Customer', render: (m) => <span className="font-medium">{m.customer ?? <span className="text-ink-faint">{NOT_SET}</span>}</span>, sort: (m) => m.customer?.toLowerCase() ?? null },
    { key: 'application', label: 'Application', render: (m) => m.application ?? <span className="text-ink-faint">{NOT_SET}</span>, sort: (m) => m.application?.toLowerCase() ?? null },
    {
      key: 'env',
      label: 'Source → Target',
      render: (m) => (
        <span className="block max-w-[220px] text-[12px] leading-4 text-ink-soft">
          {m.sourceEnv ?? NOT_SET} <span className="text-ink-faint">→</span> {m.targetEnv ?? NOT_SET}
        </span>
      ),
      sort: (m) => `${m.sourceEnv ?? ''}|${m.targetEnv ?? ''}`,
    },
    { key: 'ver', label: 'Script version', render: (m) => m.scriptVersion ?? <span className="text-ink-faint">{NOT_SET}</span>, sort: (m) => m.scriptVersion },
    { key: 'owner', label: 'Owner', render: (m) => m.owner ?? <span className="text-ink-faint">{NOT_SET}</span>, sort: (m) => m.owner },
    { key: 'stage', label: 'Stage', render: (m) => <span className="whitespace-nowrap">{m.stageName}</span>, sort: (m) => data.migrationStages.findIndex((s) => s.key === m.stageKey) },
    ...data.checks.map((c) => ({
      key: `c-${c.key}`,
      label: (
        <span title={c.label} className="whitespace-nowrap">
          {c.short}
        </span>
      ),
      render: (m: Migration) => {
        const x = m.checks.find((k) => k.key === c.key)!
        return <StatePill state={x.state} check={x} flag={x.flag ? '!' : undefined} />
      },
      sort: (m: Migration) => STATE_RANK[m.checks.find((k) => k.key === c.key)!.state],
    })),
    {
      key: 'ready',
      label: 'Readiness',
      render: (m) => (
        <div className="min-w-[150px] max-w-[240px]">
          <ReadinessChip readiness={m.readiness} />
          {m.readiness !== 'ready' && <div className="mt-1 line-clamp-2 text-[12px] leading-4 text-ink-muted">{m.reason}</div>}
        </div>
      ),
      sort: (m) => ({ blocked: 0, incomplete: 1, ready: 2 })[m.readiness],
    },
    {
      key: 'defects',
      label: 'Open defects',
      align: 'right',
      render: (m) => {
        const open = m.defectIds.map((id) => all.defectById.get(id)!).filter((d) => d?.isOpen)
        const blocking = open.filter((d) => d.impact === 'Blocking').length
        if (!open.length) return <span className="text-ink-faint">0</span>
        return (
          <span onClick={(e) => e.stopPropagation()}>
            <Drill spec={{ kind: 'defect', title: `Open defects · ${m.label}`, records: open, list: true }} className="tnum font-semibold">
              {open.length}
            </Drill>
            {blocking > 0 && (
              <span className="ml-1 text-[12px] font-medium" style={{ color: STATE_COLORS.fail }}>
                ({blocking} blocking)
              </span>
            )}
          </span>
        )
      },
      sort: (m) => m.defectIds.filter((id) => all.defectById.get(id)?.isOpen).length,
    },
    { key: 'k', label: '', render: (m) => <KelsaLink kind="migration" leadId={m.leadId} compact />, align: 'right' },
  ]

  return (
    <Card className="mt-4">
      <CardHeader
        title="Readiness matrix"
        subtitle="One row per migration. Hover a check for its reason; click a row for every field, linked defects and the stage timeline."
        actions={
          <>
            <SearchBox value={q} onChange={setQ} placeholder="Search migrations" />
            <CsvButton filename="oracle-migration-readiness.csv" rows={filtered} columns={csv} />
          </>
        }
      />
      <div className="px-6 pb-5 pt-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-muted">
          {(['pass', 'fail', 'stale', 'missing'] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <StatePill state={s} />
              {s === 'pass' ? 'evidence passes' : s === 'fail' ? 'evidence fails' : s === 'stale' ? 'done on an older script version' : 'no evidence yet'}
            </span>
          ))}
          <span>
            <span className="font-semibold">!</span> recorded result disagrees with its own numbers
          </span>
        </div>
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(m) => m.leadId}
          initialSort={{ key: 'ready', dir: 'asc' }}
          onRowClick={(m) => onOpen(m.leadId)}
          dense
          empty={rows.length ? 'No migrations match this search.' : 'No migrations match these filters.'}
        />
      </div>
    </Card>
  )
}
