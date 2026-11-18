import { HBarChart, SegmentedBar, type BarRow } from '../components/charts/bars'
import { KelsaLink, MigrationName } from '../components/Drawer'
import { Card, CardHeader, ChartCard, DataTable, EmptyState, Kpi, SectionTitle, StatePill } from '../components/ui'
import { ACCENT, AMBER, GREEN, GREY, NOT_SET, RED, STATE_COLORS, STATE_LABELS } from '../lib/config'
import { useDashboard } from '../lib/context'
import { normKey } from '../lib/format'
import type { Migration } from '../lib/types'
import { CsvButton, SearchBox, groupBy, useExport, useSearch } from './shared'

const STATUS_ORDER = ['Not Run', 'Completed - No Finding', 'Completed - Finding Recorded', 'Model Unavailable']
const STATUS_COLORS: Record<string, string> = {
  'Not Run': GREY,
  'Completed - No Finding': GREEN,
  'Completed - Finding Recorded': ACCENT,
  'Model Unavailable': AMBER,
}

const isFinding = (m: Migration) =>
  m.ai.status === 'Completed - Finding Recorded' || Boolean(m.ai.findingFile || m.ai.ruleViolated || m.ai.evidence || m.ai.suggestedFix || m.ai.findingLine !== null)

export function AiReview() {
  const { scope } = useDashboard()
  const ms = scope.migrations
  const findings = ms.filter(isFinding)
  const fixFirst = ms.filter((m) => m.ai.qaDisposition === 'Fix Script First')
  const unavailable = ms.filter((m) => m.ai.status === 'Model Unavailable')
  const notRequired = ms.filter((m) => m.ai.required === 'No')
  const noFinding = ms.filter((m) => m.ai.status === 'Completed - No Finding')
  const term = (field: string, value: string) => [{ field, op: ':' as const, values: [value] }]

  // Status distribution: the agreed options first, then anything else stored, then blanks.
  const groups = groupBy(ms, (m) => m.ai.status ?? '')
  const keys = [...STATUS_ORDER, ...[...groups.keys()].filter((k) => k && !STATUS_ORDER.includes(k)).sort(), '']
  const statusRows: BarRow[] = keys
    .filter((k) => STATUS_ORDER.includes(k) || groups.has(k))
    .map((k) => {
      const recs = groups.get(k) ?? []
      const known = STATUS_ORDER.includes(k)
      const raw = recs[0]?.q.cf_ai_review_status
      return {
        key: k || 'none',
        label: k || NOT_SET,
        sublabel: k && !known ? 'not one of the agreed options' : undefined,
        segments: [
          {
            key: 's',
            label: 'Migrations',
            value: recs.length,
            color: k ? (STATUS_COLORS[k] ?? RED) : GREY,
            drill: { kind: 'migration' as const, title: `AI review status: ${k || NOT_SET}`, records: recs, terms: k && raw ? term('cf_ai_review_status', raw) : undefined },
          },
        ],
      }
    })

  const gate = (['pass', 'fail', 'missing'] as const).map((s) => {
    const recs = ms.filter((m) => m.checks.find((c) => c.key === 'ai')!.state === s)
    return { key: s, label: STATE_LABELS[s], value: recs.length, color: STATE_COLORS[s], drill: { kind: 'migration' as const, title: `AI review check: ${STATE_LABELS[s]}`, records: recs } }
  })

  const { q, setQ, filtered } = useSearch(findings, (m) => [m.customer, m.application, m.ai.findingFile, m.ai.ruleViolated, m.ai.evidence, m.ai.suggestedFix, m.ai.qaDisposition])
  const csv = [
    { label: 'Customer', value: (m: Migration) => m.customer },
    { label: 'Application', value: (m: Migration) => m.application },
    { label: 'Script version', value: (m: Migration) => m.scriptVersion },
    { label: 'AI review status', value: (m: Migration) => m.ai.status },
    { label: 'File', value: (m: Migration) => m.ai.findingFile },
    { label: 'Line', value: (m: Migration) => m.ai.findingLine },
    { label: 'Rule violated', value: (m: Migration) => m.ai.ruleViolated },
    { label: 'Evidence', value: (m: Migration) => m.ai.evidence },
    { label: 'Suggested fix', value: (m: Migration) => m.ai.suggestedFix },
    { label: 'QA disposition', value: (m: Migration) => m.ai.qaDisposition },
  ]
  useExport('oracle-ai-review-findings.csv', filtered, csv)

  const empty = ms.length === 0 ? { title: 'No migrations match these filters', message: 'Clear a filter to see AI review results.' } : null
  const long = (s: string | null) => (s ? <span className="block max-w-[320px] whitespace-pre-wrap text-[12px] leading-[18px] text-ink-soft">{s}</span> : <span className="text-ink-faint">—</span>)

  return (
    <>
      <SectionTitle sub="What the AI script review found before rehearsal, and what QA decided. A finding only clears the gate once QA marks it Proceed to Isolated Rehearsal.">AI review</SectionTitle>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Findings recorded" value={findings.length} sub="Migrations with an AI finding" drill={{ kind: 'migration', title: 'AI findings recorded', records: findings }} />
        <Kpi
          label="Fix Script First"
          value={fixFirst.length}
          accent={fixFirst.length ? RED : undefined}
          sub="QA sent the script back; blocks cutover"
          drill={{ kind: 'migration', title: 'QA disposition: Fix Script First', records: fixFirst, terms: term('cf_qa_disposition', 'Fix Script First') }}
        />
        <Kpi
          label="Model unavailable"
          value={unavailable.length}
          accent={unavailable.length ? AMBER : undefined}
          sub="Review couldn’t run; needs a rerun"
          drill={{ kind: 'migration', title: 'AI review status: Model Unavailable', records: unavailable }}
        />
        <Kpi label="No finding" value={noFinding.length} sub="Review completed clean" drill={{ kind: 'migration', title: 'AI review status: No Finding', records: noFinding }} />
        <Kpi label="Review not required" value={notRequired.length} sub="AI Review Required = No" drill={{ kind: 'migration', title: 'AI review not required', records: notRequired }} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <ChartCard
          className="xl:col-span-7"
          title="AI review status"
          subtitle="Migrations by the AI review status recorded in Kelsa, including blanks and values outside the agreed options."
          empty={empty}
          table={<DataTable rows={statusRows} rowKey={(r) => r.key} dense columns={[{ key: 'l', label: 'Status', render: (r) => r.label }, { key: 'n', label: 'Migrations', align: 'right', render: (r) => r.segments[0].value }]} />}
        >
          <HBarChart rows={statusRows} labelWidth={230} axisLabel="Migrations" />
        </ChartCard>
        <ChartCard className="xl:col-span-5" title="AI review check in the gate" subtitle="How the AI review counts toward cutover readiness." empty={empty}>
          <SegmentedBar segments={gate} unit="migrations" />
          <ul className="mt-4 space-y-1.5 text-[12px] leading-[18px] text-ink-muted">
            <li><StatePill state="pass" /> Not required, no finding, or finding with QA Proceed</li>
            <li><StatePill state="fail" /> QA disposition is Fix Script First</li>
            <li><StatePill state="missing" /> Not run, model unavailable, or finding awaiting QA</li>
          </ul>
        </ChartCard>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Findings"
          subtitle="Every AI finding with the QA decision on it."
          actions={
            <>
              <SearchBox value={q} onChange={setQ} placeholder="Search findings" />
              <CsvButton filename="oracle-ai-review-findings.csv" rows={filtered} columns={csv} />
            </>
          }
        />
        <div className="px-6 pb-5 pt-4">
          {findings.length === 0 ? (
            <EmptyState title="No AI findings recorded" message={ms.length ? 'None of the migrations in view has an AI finding.' : 'No migrations match these filters.'} />
          ) : (
            <DataTable
              rows={filtered}
              rowKey={(m) => m.leadId}
              dense
              initialSort={{ key: 'qa', dir: 'asc' }}
              empty="No findings match this search."
              columns={[
                { key: 'm', label: 'Customer · Application', render: (m) => <MigrationName m={m} />, sort: (m) => m.label },
                { key: 'f', label: 'File', render: (m) => <span className="break-all font-mono text-[12px]">{m.ai.findingFile ?? '—'}</span>, sort: (m) => m.ai.findingFile },
                { key: 'l', label: 'Line', align: 'right', render: (m) => m.ai.findingLine ?? '—', sort: (m) => m.ai.findingLine },
                { key: 'r', label: 'Rule violated', render: (m) => long(m.ai.ruleViolated), sort: (m) => m.ai.ruleViolated },
                { key: 'e', label: 'Evidence', render: (m) => long(m.ai.evidence) },
                { key: 's', label: 'Suggested fix', render: (m) => long(m.ai.suggestedFix) },
                {
                  key: 'qa',
                  label: 'QA disposition',
                  render: (m) =>
                    m.ai.qaDisposition ? (
                      <span className="font-medium" style={{ color: m.ai.qaDisposition === 'Fix Script First' ? RED : normKey(m.ai.qaDisposition).startsWith('proceed') ? GREEN : undefined }}>
                        {m.ai.qaDisposition}
                      </span>
                    ) : (
                      <span style={{ color: AMBER }}>Awaiting QA</span>
                    ),
                  sort: (m) => (m.ai.qaDisposition === 'Fix Script First' ? 0 : m.ai.qaDisposition ? 2 : 1),
                },
                { key: 'k', label: '', align: 'right', render: (m) => <KelsaLink kind="migration" leadId={m.leadId} compact /> },
              ]}
            />
          )}
        </div>
      </Card>
    </>
  )
}
