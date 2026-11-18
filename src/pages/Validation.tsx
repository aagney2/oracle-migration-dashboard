import type { ReactNode } from 'react'
import { MigrationName } from '../components/Drawer'
import { Card, CardHeader, DataTable, EmptyState, Kpi, SectionTitle, StatePill, Tag, type Column } from '../components/ui'
import { AMBER, GREEN, RED } from '../lib/config'
import { useDashboard } from '../lib/context'
import { fmtNumber, fmtSigned, normKey } from '../lib/format'
import type { Check, Migration } from '../lib/types'
import { CsvButton, useExport } from './shared'

const check = (m: Migration, key: string) => m.checks.find((c) => c.key === key)!
const isStale = (v: string | null, m: Migration) => Boolean(v && m.scriptVersion && normKey(v) !== normKey(m.scriptVersion))

function Diff({ n }: { n: number | null }) {
  if (n === null) return <span className="text-ink-faint">—</span>
  return <span style={{ color: n === 0 ? GREEN : RED }}>{n === 0 ? '0' : fmtSigned(n)}</span>
}

const pill = (c: Check) => <StatePill state={c.state} check={c} />
const text = (s: string | null) => s ?? <span className="text-ink-faint">—</span>

export function Validation() {
  const { scope } = useDashboard()
  const ms = scope.migrations

  const countC = ms.map((m) => check(m, 'count'))
  const statusC = ms.map((m) => check(m, 'status'))
  const recordC = ms.map((m) => check(m, 'record'))
  const withIds = ms.filter((m) => m.validation.mismatchedIds.length)
  const totalIds = withIds.reduce((n, m) => n + m.validation.mismatchedIds.length, 0)
  const staleRows = ms.filter((m) => isStale(m.run.runScriptVersion, m) || isStale(m.validation.validatedScriptVersion, m))
  const runs = ms.filter((m) => m.run.status || m.run.runId || m.run.exitCode !== null || m.run.runScriptVersion)

  const passing = (_cs: Check[], key: string) => ms.filter((m) => check(m, key).state === 'pass')
  const sub = (cs: Check[]) => {
    const recorded = cs.filter((c) => c.state !== 'missing').length
    return recorded ? `of ${recorded} with evidence · ${cs.filter((c) => c.flag).length} inconsistent` : 'No evidence recorded yet'
  }

  useExport('oracle-validation-evidence.csv', ms, [
    { label: 'Migration', value: (m) => m.label },
    { label: 'Source rows', value: (m) => m.validation.sourceRows },
    { label: 'Target rows', value: (m) => m.validation.targetRows },
    { label: 'Row difference (target − source)', value: (m) => (m.validation.sourceRows !== null && m.validation.targetRows !== null ? m.validation.targetRows - m.validation.sourceRows : null) },
    { label: 'Count check result', value: (m) => m.validation.countResult },
    { label: 'Status expected', value: (m) => m.validation.statusExpected },
    { label: 'Status actual', value: (m) => m.validation.statusActual },
    { label: 'Status reconciliation result', value: (m) => m.validation.statusResult },
    { label: 'Record-level result', value: (m) => m.validation.recordResult },
    { label: 'Mismatched customer IDs', value: (m) => m.validation.mismatchedIds.join(' ') },
    { label: 'Mismatched ID count', value: (m) => m.validation.mismatchedIds.length },
    { label: 'Run ID', value: (m) => m.run.runId },
    { label: 'Run status', value: (m) => m.run.status },
    { label: 'Exit code', value: (m) => m.run.exitCode },
    { label: 'Log reference', value: (m) => m.run.logReference },
    { label: 'Baseline ID', value: (m) => m.run.baselineId },
    { label: 'Run script version', value: (m) => m.run.runScriptVersion },
    { label: 'Validated script version', value: (m) => m.validation.validatedScriptVersion },
    { label: 'Current script version', value: (m) => m.scriptVersion },
  ])

  const name: Column<Migration> = { key: 'm', label: 'Migration', render: (m) => <MigrationName m={m} />, sort: (m) => m.label }

  return (
    <>
      <SectionTitle sub="The evidence behind the gate: row counts, status reconciliation, record-level checks and rehearsal runs, and whether each was done on the current script version.">Validation evidence</SectionTitle>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Count checks passing" value={passing(countC, 'count').length} sub={sub(countC)} drill={{ kind: 'migration', title: 'Count check passing', records: passing(countC, 'count'), list: true }} />
        <Kpi label="Status reconciliations passing" value={passing(statusC, 'status').length} sub={sub(statusC)} drill={{ kind: 'migration', title: 'Status reconciliation passing', records: passing(statusC, 'status'), list: true }} />
        <Kpi label="Record-level checks passing" value={passing(recordC, 'record').length} sub={sub(recordC)} drill={{ kind: 'migration', title: 'Record-level check passing', records: passing(recordC, 'record'), list: true }} />
        <Kpi
          label="Mismatched customer IDs"
          value={totalIds}
          accent={totalIds ? RED : undefined}
          sub={withIds.length ? `Across ${withIds.length} ${withIds.length === 1 ? 'migration' : 'migrations'}` : 'None recorded'}
          drill={{ kind: 'migration', title: 'Migrations with mismatched customer IDs', records: withIds, list: true }}
        />
        <Kpi
          label="Stale evidence"
          value={staleRows.length}
          accent={staleRows.length ? AMBER : undefined}
          sub="Run or validation on an older script version"
          drill={{ kind: 'migration', title: 'Stale evidence', records: staleRows, list: true }}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TableCard title="Count check" subtitle="Source vs target total rows. Difference is target − source." rows={ms} file="oracle-count-check.csv">
          {(rows) => (
            <DataTable
              rows={rows}
              rowKey={(m) => m.leadId}
              dense
              initialSort={{ key: 'state', dir: 'asc' }}
              columns={[
                name,
                { key: 's', label: 'Source rows', align: 'right', render: (m) => fmtNumber(m.validation.sourceRows), sort: (m) => m.validation.sourceRows },
                { key: 't', label: 'Target rows', align: 'right', render: (m) => fmtNumber(m.validation.targetRows), sort: (m) => m.validation.targetRows },
                { key: 'd', label: 'Difference', align: 'right', render: (m) => <Diff n={check(m, 'count').diff ?? null} />, sort: (m) => Math.abs(check(m, 'count').diff ?? 0) },
                { key: 'r', label: 'Result in Kelsa', render: (m) => text(m.validation.countResult), sort: (m) => m.validation.countResult },
                { key: 'state', label: 'Check', render: (m) => pill(check(m, 'count')), sort: (m) => rank(check(m, 'count')) },
              ]}
            />
          )}
        </TableCard>
        <TableCard title="Status reconciliation" subtitle="Expected vs actual status counts. Difference is actual − expected." rows={ms} file="oracle-status-reconciliation.csv">
          {(rows) => (
            <DataTable
              rows={rows}
              rowKey={(m) => m.leadId}
              dense
              initialSort={{ key: 'state', dir: 'asc' }}
              columns={[
                name,
                { key: 'e', label: 'Expected', align: 'right', render: (m) => fmtNumber(m.validation.statusExpected), sort: (m) => m.validation.statusExpected },
                { key: 'a', label: 'Actual', align: 'right', render: (m) => fmtNumber(m.validation.statusActual), sort: (m) => m.validation.statusActual },
                { key: 'd', label: 'Difference', align: 'right', render: (m) => <Diff n={check(m, 'status').diff ?? null} />, sort: (m) => Math.abs(check(m, 'status').diff ?? 0) },
                { key: 'r', label: 'Result in Kelsa', render: (m) => text(m.validation.statusResult), sort: (m) => m.validation.statusResult },
                { key: 'state', label: 'Check', render: (m) => pill(check(m, 'status')), sort: (m) => rank(check(m, 'status')) },
              ]}
            />
          )}
        </TableCard>
      </div>

      <Card className="mt-4">
        <CardHeader title="Record-level check" subtitle="Mismatched customer IDs, split from the free-text field into a list, with the count per migration." />
        <div className="px-6 pb-5 pt-4">
          <DataTable
            rows={ms}
            rowKey={(m) => m.leadId}
            dense
            initialSort={{ key: 'n', dir: 'desc' }}
            columns={[
              name,
              { key: 'r', label: 'Result in Kelsa', render: (m) => text(m.validation.recordResult), sort: (m) => m.validation.recordResult },
              { key: 'n', label: 'Mismatched IDs', align: 'right', render: (m) => <span className="tnum font-semibold">{m.validation.mismatchedIds.length}</span>, sort: (m) => m.validation.mismatchedIds.length },
              {
                key: 'ids',
                label: 'Customer IDs',
                render: (m) =>
                  m.validation.mismatchedIds.length ? (
                    <span className="flex max-w-[520px] flex-wrap gap-1">
                      {m.validation.mismatchedIds.map((id) => (
                        <Tag key={id}>{id}</Tag>
                      ))}
                    </span>
                  ) : (
                    <span className="text-ink-faint">None</span>
                  ),
              },
              { key: 'state', label: 'Check', render: (m) => pill(check(m, 'record')), sort: (m) => rank(check(m, 'record')) },
            ]}
            empty="No migrations match these filters."
          />
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Rehearsal runs" subtitle="The latest rehearsal recorded on each migration, and whether it ran on the current script version." />
        <div className="px-6 pb-5 pt-4">
          {runs.length === 0 ? (
            <EmptyState title="No rehearsal runs recorded" message="Runs appear here once a run status, run ID or exit code is entered in Kelsa." />
          ) : (
            <DataTable
              rows={runs}
              rowKey={(m) => m.leadId}
              dense
              columns={[
                name,
                { key: 'id', label: 'Run ID', render: (m) => <span className="font-mono text-[12px]">{m.run.runId ?? '—'}</span>, sort: (m) => m.run.runId },
                { key: 'st', label: 'Run status', render: (m) => text(m.run.status), sort: (m) => m.run.status },
                { key: 'ec', label: 'Exit code', align: 'right', render: (m) => (m.run.exitCode === null ? <span className="text-ink-faint">—</span> : <span style={{ color: m.run.exitCode === 0 ? GREEN : RED }}>{m.run.exitCode}</span>), sort: (m) => m.run.exitCode },
                { key: 'log', label: 'Log reference', render: (m) => <span className="block max-w-[260px] break-all font-mono text-[12px]">{m.run.logReference ?? '—'}</span> },
                { key: 'bl', label: 'Baseline ID', render: (m) => <span className="font-mono text-[12px]">{m.run.baselineId ?? '—'}</span> },
                {
                  key: 'v',
                  label: 'Run version vs current',
                  render: (m) => (
                    <span className="inline-flex flex-wrap items-center gap-2 whitespace-nowrap">
                      {m.run.runScriptVersion ?? '—'} <span className="text-ink-faint">vs</span> {m.scriptVersion ?? '—'}
                      {pill(check(m, 'runVersion'))}
                    </span>
                  ),
                  sort: (m) => rank(check(m, 'runVersion')),
                },
                { key: 'state', label: 'Rehearsal check', render: (m) => pill(check(m, 'run')), sort: (m) => rank(check(m, 'run')) },
              ]}
            />
          )}
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Stale evidence" subtitle="Rehearsal or validation done on an older script version. A defect fix creates a new version, so this evidence has to be redone before cutover." />
        <div className="px-6 pb-5 pt-4">
          {staleRows.length === 0 ? (
            <EmptyState compact title="No stale evidence" message="Every recorded rehearsal and validation was done on the migration’s current script version." />
          ) : (
            <DataTable
              rows={staleRows}
              rowKey={(m) => m.leadId}
              dense
              columns={[
                name,
                { key: 'cur', label: 'Current version', render: (m) => m.scriptVersion },
                { key: 'run', label: 'Rehearsal version', render: (m) => <VersionCell v={m.run.runScriptVersion} m={m} /> },
                { key: 'val', label: 'Validation version', render: (m) => <VersionCell v={m.validation.validatedScriptVersion} m={m} /> },
                {
                  key: 'what',
                  label: 'Needs redoing',
                  render: (m) => [isStale(m.run.runScriptVersion, m) && 'Rehearsal', isStale(m.validation.validatedScriptVersion, m) && 'Validation'].filter(Boolean).join(' and '),
                },
              ]}
            />
          )}
        </div>
      </Card>
    </>
  )
}

function VersionCell({ v, m }: { v: string | null; m: Migration }) {
  if (!v) return <span className="text-ink-faint">Not recorded</span>
  return (
    <span className="inline-flex items-center gap-2">
      {v}
      <StatePill state={isStale(v, m) ? 'stale' : 'pass'} />
    </span>
  )
}

const rank = (c: Check) => ({ fail: 0, stale: 1, missing: 2, pass: 3 })[c.state]

function TableCard({ title, subtitle, rows, file, children }: { title: string; subtitle: string; rows: Migration[]; file: string; children: (rows: Migration[]) => ReactNode }) {
  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        actions={
          <CsvButton
            filename={file}
            rows={rows}
            columns={[
              { label: 'Migration', value: (m: Migration) => m.label },
              { label: 'Source rows', value: (m: Migration) => m.validation.sourceRows },
              { label: 'Target rows', value: (m: Migration) => m.validation.targetRows },
              { label: 'Count check result', value: (m: Migration) => m.validation.countResult },
              { label: 'Status expected', value: (m: Migration) => m.validation.statusExpected },
              { label: 'Status actual', value: (m: Migration) => m.validation.statusActual },
              { label: 'Status reconciliation result', value: (m: Migration) => m.validation.statusResult },
            ]}
          />
        }
      />
      <div className="px-6 pb-5 pt-4">{rows.length ? children(rows) : <EmptyState compact title="No migrations match these filters" message="Clear a filter to see validation evidence." />}</div>
    </Card>
  )
}
