/**
 * Prints the gate result for every migration (with the reason for each check),
 * defect links and match method, integrity alerts, and field values that don't
 * match the agreed options. Read-only: uses the same Kelsa client as the app.
 *
 *   npm run report             live Kelsa data (needs KELSA_USER_EMAIL / KELSA_USER_TOKEN)
 *   npm run report -- --sample the built-in sample data
 */
import 'dotenv/config'

if (process.argv.includes('--sample')) process.env.KELSA_SAMPLE_DATA = '1'
else process.env.NODE_ENV = 'production'

const { buildDataset } = await import('../server/dataset.js')
const { readinessLabel } = await import('../server/gate.js')

let data
try {
  data = await buildDataset()
} catch (err) {
  console.error(`Could not read Kelsa: ${err.message}`)
  process.exit(1)
}

const STATE = { pass: 'Pass', fail: 'Fail', stale: 'Stale', missing: 'Missing' }
const out = []
const p = (s = '') => out.push(s)

p(`# Oracle migration cutover gate (${data.source === 'sample' ? 'SAMPLE DATA' : 'live Kelsa data'}, ${new Date(data.asOf).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })} IST)`)
p(`${data.migrations.length} migrations, ${data.defects.length} defects.`)
p()
p('## Gate result per migration')
for (const m of data.migrations) {
  p()
  p(`### ${m.label}  (record ${m.leadId}, stage: ${m.stageName})`)
  p(`Readiness: **${readinessLabel(m.readiness).toUpperCase()}**. ${m.reason}`)
  for (const c of m.checks) p(`- ${c.label}: ${STATE[c.state]}${c.flag ? ` (${c.flag})` : ''}. ${c.reason}`)
}

p()
p('## Defect links')
for (const d of data.defects) {
  const targets = d.linkedMigrationIds.map((id) => data.migrations.find((m) => m.leadId === id)?.label ?? id)
  p(`- “${d.title}” (record ${d.leadId}, ${d.stageName}, ${d.impact ?? 'impact not set'}): ${d.linkMethod ? `${targets.join('; ')} by ${data.linkMethods[d.linkMethod]}` : 'UNLINKED'}${d.linkNotes.length ? `. ${d.linkNotes.join(' ')}` : ''}`)
}

p()
p('## Integrity alerts')
const alerts = data.migrations.flatMap((m) => m.alerts.map((a) => ({ m, a })))
if (!alerts.length) p('None.')
for (const { m, a } of alerts) p(`- ${data.alertLabels[a.key]}: ${m.label}. ${a.detail}`)

p()
p('## Data health')
for (const h of data.health) {
  if (!h.items.length) continue
  p(`### ${h.title}`)
  for (const i of h.items) p(`- ${i.text}`)
}

console.log(out.join('\n'))
