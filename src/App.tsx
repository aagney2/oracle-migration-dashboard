import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertBanner } from './components/AlertBanner'
import { DataHealthDrawer, healthIssueCount } from './components/DataHealth'
import { RecordDrawer } from './components/Drawer'
import { FilterBar } from './components/FilterBar'
import { Header } from './components/Header'
import { MigrationDrawer } from './components/MigrationDrawer'
import { ApiFailure, getData, refreshData } from './lib/api'
import { DashboardProvider, TooltipProvider, type ExportSpec, type Scope } from './lib/context'
import type { Ctx, DrillSpec } from './lib/drill'
import { PAGES, filterDefects, filterMigrations, useLocation } from './lib/filters'
import type { Dataset } from './lib/types'
import { AiReview } from './pages/AiReview'
import { Defects } from './pages/Defects'
import { Overview } from './pages/Overview'
import { Validation } from './pages/Validation'

type State = { status: 'loading' } | { status: 'error'; error: ApiFailure | Error } | { status: 'ready'; data: Dataset }

const AUTO_REFRESH_MS = 5 * 60_000

export default function App() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const busy = useRef(false)

  const load = useCallback(async () => {
    try {
      setState({ status: 'ready', data: await getData() })
    } catch (err) {
      setState({ status: 'error', error: err as Error })
    }
  }, [])

  const refresh = useCallback(async (manual: boolean) => {
    if (busy.current) return
    busy.current = true
    if (manual) setRefreshing(true)
    try {
      const data = await refreshData()
      setState({ status: 'ready', data })
    } catch (err) {
      // Auto-refresh failures keep the last good data on screen; a manual one says why.
      setState((s) => (s.status === 'ready' && !manual ? s : { status: 'error', error: err as Error }))
    } finally {
      busy.current = false
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const id = window.setInterval(() => refresh(false), AUTO_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  if (state.status === 'loading') return <Splash />
  if (state.status === 'error') return <ErrorScreen error={state.error} onRetry={load} />
  return (
    <TooltipProvider>
      <Dashboard data={state.data} refreshing={refreshing} onRefresh={() => refresh(true)} />
    </TooltipProvider>
  )
}

function index(data: Dataset, migrations = data.migrations, defects = data.defects): Scope {
  return {
    migrations,
    defects,
    migrationById: new Map(data.migrations.map((m) => [m.leadId, m])),
    defectById: new Map(data.defects.map((d) => [d.leadId, d])),
  }
}

function Dashboard({ data, refreshing, onRefresh }: { data: Dataset; refreshing: boolean; onRefresh: () => void }) {
  const { page, filters } = useLocation()
  const [drawer, setDrawer] = useState<DrillSpec | null>(null)
  const [migrationId, setMigrationId] = useState<number | null>(null)
  const [health, setHealth] = useState(false)
  const [exportSpec, setExport] = useState<ExportSpec | null>(null)

  const all = useMemo(() => index(data), [data])
  const scope = useMemo(() => index(data, filterMigrations(data.migrations, filters), filterDefects(data.defects, filters, data.migrations)), [data, filters])
  const ctx: Ctx = useMemo(
    () => ({
      origin: data.origin,
      accountId: data.accountId,
      migrationPipelineId: data.pipelines.migration.id,
      defectPipelineId: data.pipelines.defect.id,
      allMigrations: data.migrations,
      allDefects: data.defects,
      stageNames: Object.fromEntries([...data.migrationStages, ...data.defectStages].map((s) => [s.key, s.name])),
      filters,
    }),
    [data, filters],
  )
  const healthCount = useMemo(() => healthIssueCount(data.health), [data.health])

  useEffect(() => {
    document.title = `${PAGES.find((p) => p.path === page)!.label} · Oracle · Migration Cutover Readiness`
  }, [page])

  const openMigration = useCallback((id: number) => {
    setDrawer(null)
    setMigrationId(id)
  }, [])

  return (
    <DashboardProvider value={{ data, scope, all, ctx, page, filters, openDrawer: setDrawer, openMigration, setExport }}>
      <div className="min-h-screen bg-canvas">
        <Header
          fetchedAt={data.fetchedAt}
          stale={data.stale}
          sample={data.source === 'sample'}
          refreshing={refreshing}
          onRefresh={onRefresh}
          exportSpec={exportSpec}
          page={page}
          healthCount={healthCount}
          onHealth={() => setHealth(true)}
          refreshMinutes={Math.round(AUTO_REFRESH_MS / 60_000)}
        />
        <FilterBar />
        <main className="mx-auto max-w-[1440px] px-4 pb-16 pt-6 sm:px-8">
          {data.source === 'sample' && (
            <div className="mb-4 rounded-card border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-[13px] text-[#93370D]">
              <span className="font-semibold">Sample data.</span> Kelsa credentials aren’t configured on this server, so the dashboard is showing fictional migrations. Record links won’t
              open real Kelsa records.
            </div>
          )}
          <AlertBanner />
          {page === 'overview' && <Overview />}
          {page === 'validation' && <Validation />}
          {page === 'ai-review' && <AiReview />}
          {page === 'defects' && <Defects />}
        </main>
        <footer className="mx-auto max-w-[1440px] px-4 pb-10 text-[12px] text-ink-faint sm:px-8">
          {data.source === 'sample' ? 'Sample data' : 'Live from Kelsa'} · read-only · {data.pipelines.migration.count} migrations, {data.pipelines.defect.count} defects · readiness is computed from evidence, not
          from the Kelsa stage
        </footer>
      </div>
      {drawer && <RecordDrawer spec={drawer} onClose={() => setDrawer(null)} />}
      {migrationId !== null && <MigrationDrawer leadId={migrationId} onClose={() => setMigrationId(null)} />}
      {health && <DataHealthDrawer onClose={() => setHealth(false)} />}
    </DashboardProvider>
  )
}

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas">
      <div className="text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-hairline border-t-accent" />
        <p className="text-[13px] text-ink-muted">Loading migrations and defects from Kelsa…</p>
      </div>
    </div>
  )
}

function ErrorScreen({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const api = error instanceof ApiFailure ? error.error : null
  const title =
    api?.kind === 'access_denied'
      ? `Kelsa API access is off for ${api.pipeline ?? 'a required pipeline'}`
      : api?.kind === 'auth_not_configured'
        ? 'Kelsa credentials are not configured'
        : 'The dashboard couldn’t load'
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="max-w-[460px] rounded-card border border-hairline bg-white p-8 text-center">
        <h1 className="text-[17px] font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-[14px] leading-6 text-ink-muted">{api?.message ?? error.message}</p>
        <button type="button" onClick={onRetry} className="mt-5 h-9 rounded-lg bg-accent px-4 text-[13px] font-medium text-white hover:bg-accent-ink">
          Try again
        </button>
      </div>
    </div>
  )
}
