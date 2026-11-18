# Oracle · Migration Cutover Readiness

A dashboard for the **Oracle** account in Kelsa (account 888). It shows which data migrations are safe to cut over, which are blocked and why, the validation and AI-review evidence behind that decision, and the defects holding migrations back.

The dashboard is **read-only against Kelsa**. The server only issues `GET` requests plus the `POST /leads/stats` aggregation read. Any other method, and any pipeline other than the two below, is refused in code (`server/kelsa.js`). The Kelsa API key stays on the server and never reaches the browser.

| Kelsa pipeline | Used for |
| --- | --- |
| Migration Process | One record per migration: registration, AI review, rehearsal, validation, approval and cutover |
| Migration Defects | Defects raised during validation, with the Open → Fix In Progress → Retest → Closed cycle |

## Pages

- **Overview**: KPIs (total, Ready / Blocked / Incomplete, cleared for cutover, open and blocking defects, integrity alerts), a stage funnel with the median time in the current stage, a "Blocked by" chart, and the readiness matrix: one row per migration with its 9 check pills. The matrix is sortable and searchable, exports to CSV, and opens the migration drawer when you click a row.
- **Migration drawer**: every field, grouped as in Kelsa; the 9 checks with their reasons; linked defects and how each was matched; the stage timeline; and Open in Kelsa.
- **Validation evidence**: count check with the difference, status reconciliation, record-level mismatched customer IDs (split into a list), rehearsal runs (run version vs current version), and stale evidence.
- **AI review**: status distribution, the AI review check's share of the gate, the Fix Script First and Model Unavailable counts, and the findings table.
- **Defects**: KPIs; open defects by stage, failed check, customer/application and fix owner; retest loops (Retest → Fix In Progress) taken from stage history; the defect table; and unlinked defects.

Global filters cover customer, application, migration owner, source and target environment, stage, readiness and created date. They apply to every tab and are kept in the URL. Defects are filtered by their own customer, application and created date, and by everything else through their linked migration.

Every number drills down to the records behind it. If a Kelsa search returns exactly the records on screen, the drill-down opens that filtered list in Kelsa. Otherwise it opens an in-app list in which every record has its own Open in Kelsa link. Before opening Kelsa, the app checks each query against the loaded data, so a link never shows more or fewer records than the dashboard counted.

Data refreshes every 5 minutes. You can also refresh manually from the header, which shows the last update time. All times are in IST.

## The cutover gate

Each migration gets 9 checks. Each check is **Pass**, **Fail**, **Stale** (done on an older script version) or **Missing** (no evidence yet).

| # | Check | Pass when |
| --- | --- | --- |
| 1 | AI review | Not required, or completed with no finding, or a finding with QA disposition *Proceed to Isolated Rehearsal*. *Fix Script First* is a Fail. |
| 2 | Rehearsal run | Run status Succeeded **and** exit code 0 |
| 3 | Rehearsal on current version | Run script version = current script version |
| 4 | Validation on current version | Validated script version = current script version |
| 5 | Count check | Result Pass and source rows = target rows (difference shown) |
| 6 | Status reconciliation | Result Pass and expected = actual |
| 7 | Record-level check | Result Pass and no mismatched customer IDs |
| 8 | No open blocking defects | No linked defect that is open with cutover impact Blocking |
| 9 | Sign-off on current version | Approved script version = current script version |

- **Ready**: all 9 checks pass.
- **Blocked**: at least one check is Fail or Stale. The first such check is shown as the reason.
- **Incomplete**: everything else.

Where the spec left room for interpretation, the gate applies these rules:

- A result of Pass whose own numbers disagree is a **Fail**, flagged *Inconsistent*. This covers a count or status check with different numbers, and a record-level check that lists mismatched IDs.
- A result of Pass with one of its numbers blank is **Missing**.
- A rehearsal recorded as Succeeded with a non-zero exit code is a **Fail**, flagged *Inconsistent*. Succeeded with no exit code is **Missing**.
- A rehearsal or validation with no script version recorded is **Missing**, not Stale.
- A sign-off on an older script version is **Stale**.
- An open defect whose cutover impact is blank or unrecognised does not block. It is listed under Data health.

Text values are free text. They're trimmed and compared case-insensitively, and dropdown values are matched to the agreed options in the same way. Anything that still doesn't match is listed under **Data health** in the header.

### Integrity alerts

The red banner lists migrations where Kelsa's own records disagree with the evidence:

- The migration is in *Approved for Cutover*, but the gate isn't passing.
- *Cutover Status* is Cleared, but the gate isn't passing.
- Kelsa's *Evidence Current and Passing* field disagrees with the computed gate. Both values are shown. A blank field doesn't raise an alert, but is listed under Data health.

### Linking defects to migrations

Each defect is matched to a migration by the first rule that finds one:

1. **Migration record ID**: *Source Migration ID* equals a migration's record ID. A bare number, `#number`, or a Kelsa URL containing `current_item_id` all work.
2. **Customer + application + script version**
3. **Customer + application**. If several migrations match, the defect is linked to all of them and this is noted.

The method used is shown next to every link. Defects that match nothing are listed under **Unlinked defects** and are never dropped.

## Run locally

Requires Node 20 or later.

```bash
npm install
cp .env.example .env     # add KELSA_USER_EMAIL and KELSA_USER_TOKEN
npm run dev
```

- Dashboard: http://127.0.0.1:5471 (Vite; `/api` is proxied to the API server)
- API: http://127.0.0.1:3471

Without credentials, development mode serves **built-in sample data**: fictional migrations and defects that exercise every gate outcome, alert and linking rule. A "Sample data" badge shows in the header while it's in use. Set `KELSA_SAMPLE_DATA=1` to force sample data. In production, missing credentials return an error rather than falling back to samples.

### Gate report from the command line

```bash
npm run report              # live Kelsa data (reads .env)
npm run report -- --sample  # built-in sample data
```

The report prints, for each migration, the gate result with the reason for every check. It also lists defect links with the match method, integrity alerts, and stored values that don't match the agreed options.

### Checks

```bash
npm test          # gate and linking unit tests
npm run build     # type-check and production build
```

## Deploy (Render)

`render.yaml` is a Render blueprint for a single Node web service.

1. In Render, create a **Blueprint** from this repository.
2. Set `KELSA_USER_EMAIL` and `KELSA_USER_TOKEN` (they're marked `sync: false`, so Render asks for them).
3. Render runs `npm install --include=dev && npm run build`, then `npm start`. The health check is `/api/health`.

In production one Express process serves both the API and the built dashboard from `dist/`. Kelsa data is cached on the server for 5 minutes (`DATA_TTL_MS`), and forced refreshes are limited to one every 15 seconds.

## Project layout

```
server/
  index.js      Express app: /api/data, /api/refresh, /api/health, static files
  kelsa.js      Read-only Kelsa client (paginated GETs, /leads/stats)
  dataset.js    Fetch, normalise, run the gate, link defects, data-health checks
  gate.js       The 9-check cutover gate, integrity alerts, defect linking
  values.js     Free-text and dropdown normalisation
  config.js     Pipelines, stages, field names, agreed options
  sample.js     Built-in sample data
src/
  pages/        Overview, Validation, AiReview, Defects
  components/   Header, filters, alert banner, drawers, charts, table
  lib/          Types, filters, drill-down resolution, formatting
scripts/report.mjs
render.yaml
```
