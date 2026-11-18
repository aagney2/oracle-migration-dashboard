import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { NOT_SET, readinessColor, STATE_COLORS } from '../lib/config'
import { useDashboard } from '../lib/context'
import { kelsaRecordUrl } from '../lib/drill'
import { daysBetween, daysSince, fmtDate, fmtDateTime, fmtDays, fmtNumber, fmtSigned } from '../lib/format'
import type { Attachment, Migration } from '../lib/types'
import { DefectStageChip, KelsaLink, Panel } from './Drawer'
import { Chip, ReadinessChip, StatePill, Tag, tint } from './ui'

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  const empty = children === null || children === undefined || children === ''
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-[12px] text-ink-muted">{label}</dt>
      <dd className={`mt-0.5 break-words text-[13px] ${empty ? 'text-ink-faint' : 'text-ink'}`}>{empty ? NOT_SET : children}</dd>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-hairline p-4">
      <h3 className="mb-3 text-[13px] font-semibold text-ink">{title}</h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  )
}

const files = (list: Attachment[]) => (list.length ? list.map((a) => a.name).join(', ') : null)
const mono = (s: string | null) => (s ? <span className="font-mono text-[12px]">{s}</span> : null)

function VersionNote({ version, current }: { version: string | null; current: string | null }) {
  if (!version) return null
  const same = current && version.trim().toLowerCase() === current.trim().toLowerCase()
  return (
    <span className="inline-flex items-center gap-2">
      {version}
      {current && <StatePill state={same ? 'pass' : 'stale'} flag={same ? undefined : `current is ${current}`} />}
    </span>
  )
}

export function MigrationDrawer({ leadId, onClose }: { leadId: number; onClose: () => void }) {
  const { all, data, openDrawer } = useDashboard()
  const m = all.migrationById.get(leadId)
  if (!m) return null
  const linked = m.defectIds.map((id) => all.defectById.get(id)!).filter(Boolean)
  const v = m.validation
  const color = readinessColor(m.readiness)

  return (
    <Panel
      wide
      title={m.label}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span>{m.stageName}</span>
          <span className="text-ink-faint">·</span>
          <span>{m.stageEnteredAt ? `${fmtDays(daysSince(m.stageEnteredAt))} in stage` : 'Time in stage unknown'}</span>
          <span className="text-ink-faint">·</span>
          <span>Owner: {m.owner ?? NOT_SET}</span>
        </span>
      }
      onClose={onClose}
      actions={
        <a
          href={kelsaRecordUrl(data.origin, data.pipelines.migration.id, m.leadId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-ink"
        >
          Open in Kelsa <ExternalLink size={13} />
        </a>
      }
    >
      <div className="space-y-4">
        <section className="rounded-card border p-4" style={{ borderColor: tint(color, 0.45), background: tint(color, 0.05) }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-ink">Cutover gate</span>
            <ReadinessChip readiness={m.readiness} />
          </div>
          <p className="mt-1.5 text-[13px] leading-5 text-ink-soft">{m.reason}</p>
          {m.alerts.length > 0 && (
            <ul className="mt-3 space-y-1">
              {m.alerts.map((a) => (
                <li key={a.key} className="text-[13px] font-medium" style={{ color: '#B42318' }}>
                  {data.alertLabels[a.key]}. <span className="font-normal text-ink-soft">{a.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-card border border-hairline">
          <h3 className="px-4 pt-4 text-[13px] font-semibold text-ink">The 9 checks</h3>
          <ol className="mt-2 divide-y divide-hairline/70">
            {m.checks.map((c, i) => (
              <li key={c.key} className="flex gap-3 px-4 py-2.5">
                <span className="tnum w-4 shrink-0 pt-0.5 text-[12px] text-ink-faint">{i + 1}</span>
                <span className="w-[200px] shrink-0 text-[13px] font-medium text-ink">{c.label}</span>
                <span className="w-[120px] shrink-0">
                  <StatePill state={c.state} flag={c.flag} />
                </span>
                <span className="text-[13px] leading-5 text-ink-soft">
                  {c.reason}
                  {c.note && <span className="block text-[12px] text-ink-muted">{c.note}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <Group title="Registration">
          <Field label="Customer">{m.customer}</Field>
          <Field label="Application">{m.application}</Field>
          <Field label="Source environment">{m.sourceEnv}</Field>
          <Field label="Target environment">{m.targetEnv}</Field>
          <Field label="Script version (current)">{m.scriptVersion}</Field>
          <Field label="Migration owner">{m.owner}</Field>
          <Field label="Approved status mapping">{files(m.registration.approvedStatusMapping)}</Field>
          <Field label="Migration script">{files(m.registration.migrationScript)}</Field>
          <Field label="Test cases">{files(m.registration.testCases)}</Field>
          <Field label="Registered">{fmtDateTime(m.createdAt)} IST</Field>
        </Group>

        <Group title="AI review">
          <Field label="AI review status">{m.ai.status}</Field>
          <Field label="AI review required">{m.ai.required}</Field>
          <Field label="QA disposition">{m.ai.qaDisposition}</Field>
          <Field label="Finding location">{m.ai.findingFile ? `${m.ai.findingFile}${m.ai.findingLine !== null ? `, line ${m.ai.findingLine}` : ''}` : null}</Field>
          <Field label="Rule violated" wide>
            {m.ai.ruleViolated}
          </Field>
          <Field label="Evidence" wide>
            {mono(m.ai.evidence)}
          </Field>
          <Field label="Suggested fix" wide>
            {m.ai.suggestedFix}
          </Field>
        </Group>

        <Group title="Rehearsal">
          <Field label="Rehearsal run status">{m.run.status}</Field>
          <Field label="Exit code">{m.run.exitCode !== null ? String(m.run.exitCode) : null}</Field>
          <Field label="Run ID">{mono(m.run.runId)}</Field>
          <Field label="Run script version">
            <VersionNote version={m.run.runScriptVersion} current={m.scriptVersion} />
          </Field>
          <Field label="Log reference">{mono(m.run.logReference)}</Field>
          <Field label="Baseline ID">{mono(m.run.baselineId)}</Field>
        </Group>

        <Group title="Validation">
          <Field label="Validated script version">
            <VersionNote version={v.validatedScriptVersion} current={m.scriptVersion} />
          </Field>
          <Field label="Count check result">{v.countResult}</Field>
          <Field label="Source total rows">{v.sourceRows !== null ? fmtNumber(v.sourceRows) : null}</Field>
          <Field label="Target total rows">
            {v.targetRows !== null ? `${fmtNumber(v.targetRows)}${v.sourceRows !== null ? ` (${fmtSigned(v.targetRows - v.sourceRows)})` : ''}` : null}
          </Field>
          <Field label="Status reconciliation result">{v.statusResult}</Field>
          <Field label="Status expected / actual">
            {v.statusExpected !== null || v.statusActual !== null
              ? `${fmtNumber(v.statusExpected)} / ${fmtNumber(v.statusActual)}${v.statusExpected !== null && v.statusActual !== null ? ` (${fmtSigned(v.statusActual - v.statusExpected)})` : ''}`
              : null}
          </Field>
          <Field label="Record-level check result">{v.recordResult}</Field>
          <Field label={`Mismatched customer IDs${v.mismatchedIds.length ? ` (${v.mismatchedIds.length})` : ''}`} wide>
            {v.mismatchedIds.length ? (
              <span className="flex flex-wrap gap-1">
                {v.mismatchedIds.map((id) => (
                  <Tag key={id}>{id}</Tag>
                ))}
              </span>
            ) : null}
          </Field>
        </Group>

        <Group title="Approval and cutover">
          <Field label="Approved script version">
            <VersionNote version={m.approval.approvedScriptVersion} current={m.scriptVersion} />
          </Field>
          <Field label="Cutover status (Kelsa)">{m.approval.cutoverStatus}</Field>
          <Field label="Evidence current and passing (Kelsa)">
            {m.approval.evidenceFlag ? (
              <span className="inline-flex items-center gap-2">
                {m.approval.evidenceFlag}
                {(m.approval.evidenceFlag === 'Yes') !== (m.readiness === 'ready') && <Chip label="Disagrees with computed gate" color={STATE_COLORS.fail} />}
              </span>
            ) : null}
          </Field>
          <Field label="Computed gate">{m.readiness === 'ready' ? 'Yes' : 'No'}</Field>
        </Group>

        <section className="rounded-card border border-hairline p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-ink">Linked defects</h3>
          {linked.length === 0 ? (
            <p className="text-[13px] text-ink-muted">No defects are linked to this migration.</p>
          ) : (
            <ul className="divide-y divide-hairline/70">
              {linked.map((d) => (
                <li key={d.leadId} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-ink">{d.title}</div>
                    <div className="text-[12px] text-ink-muted">{d.sentence}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <DefectStageChip d={d} />
                      <Tag>{d.impact ?? 'Impact not set'}</Tag>
                      <Tag tone="blue">Matched by {data.linkMethods[d.linkMethod!].toLowerCase()}</Tag>
                    </div>
                  </div>
                  <KelsaLink kind="defect" leadId={d.leadId} compact />
                </li>
              ))}
            </ul>
          )}
          {linked.length > 1 && (
            <button
              type="button"
              onClick={() => openDrawer({ kind: 'defect', title: `Defects linked to ${m.label}`, records: linked, list: true })}
              className="mt-2 text-[12px] font-medium text-accent hover:underline"
            >
              List all {linked.length}
            </button>
          )}
        </section>

        <section className="rounded-card border border-hairline p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-ink">Stage timeline</h3>
          <Timeline m={m} />
        </section>
      </div>
    </Panel>
  )
}

function Timeline({ m }: { m: Migration }) {
  const entries = [{ stage: 'Registered', at: m.createdAt, user: null as string | null }, ...m.history.map((h) => ({ stage: h.stage, at: h.at, user: h.user }))]
  if (!m.history.length) {
    return <p className="text-[13px] text-ink-muted">No stage changes recorded in Kelsa. Registered {fmtDate(m.createdAt)}; currently in {m.stageName}.</p>
  }
  return (
    <ol className="relative ml-1 border-l border-hairline pl-5">
      {entries.map((e, i) => {
        const next = entries[i + 1]?.at ?? null
        const dur = next ? daysBetween(e.at, next) : daysSince(e.at)
        return (
          <li key={`${e.at}-${i}`} className="relative pb-3 last:pb-0">
            <span className={`absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${i === entries.length - 1 ? 'bg-accent' : 'bg-ink-faint'}`} />
            <div className="text-[13px] font-medium text-ink">{e.stage}</div>
            <div className="text-[12px] text-ink-muted">
              {fmtDateTime(e.at)} IST{e.user ? ` · ${e.user}` : ''} · {next ? `${fmtDays(dur)} until next stage` : `${fmtDays(dur)} so far`}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
