import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { CsvColumn } from './csv'
import type { Ctx, DrillSpec } from './drill'
import type { Filters, PagePath } from './filters'
import type { Dataset, Defect, Migration } from './types'

export interface ExportSpec {
  filename: string
  rows: unknown[]
  columns: CsvColumn<unknown>[]
}

export interface Scope {
  migrations: Migration[]
  defects: Defect[]
  migrationById: Map<number, Migration>
  defectById: Map<number, Defect>
}

interface DashboardValue {
  data: Dataset
  /** Records after global filters. */
  scope: Scope
  /** Every record, for lookups (linked records may sit outside the filters). */
  all: Scope
  ctx: Ctx
  page: PagePath
  filters: Filters
  openDrawer: (spec: DrillSpec) => void
  openMigration: (leadId: number) => void
  setExport: (spec: ExportSpec | null) => void
}

const DashboardContext = createContext<DashboardValue | null>(null)

export function DashboardProvider({ value, children }: { value: DashboardValue; children: ReactNode }) {
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboard(): DashboardValue {
  const v = useContext(DashboardContext)
  if (!v) throw new Error('useDashboard outside provider')
  return v
}

// ---------------------------------------------------------------------------
// Tooltip: one floating element that follows the pointer, shared by every chart.
// ---------------------------------------------------------------------------

interface TipState {
  content: ReactNode
  x: number
  y: number
}
const TipContext = createContext<{ show: (content: ReactNode, e: { clientX: number; clientY: number }) => void; hide: () => void } | null>(null)

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<TipState | null>(null)
  const api = useMemo(
    () => ({
      show: (content: ReactNode, e: { clientX: number; clientY: number }) => setTip({ content, x: e.clientX, y: e.clientY }),
      hide: () => setTip(null),
    }),
    [],
  )
  const flipX = tip && tip.x > window.innerWidth - 300
  const flipY = tip && tip.y > window.innerHeight - 180
  return (
    <TipContext.Provider value={api}>
      {children}
      {tip && (
        <div
          role="tooltip"
          className="no-print pointer-events-none fixed z-[80] max-w-[300px] rounded-lg border border-hairline bg-white px-3 py-2 text-[12px] leading-[18px] text-ink shadow-pop"
          style={{
            left: flipX ? undefined : tip.x + 14,
            right: flipX ? window.innerWidth - tip.x + 14 : undefined,
            top: flipY ? undefined : tip.y + 14,
            bottom: flipY ? window.innerHeight - tip.y + 14 : undefined,
          }}
        >
          {tip.content}
        </div>
      )}
    </TipContext.Provider>
  )
}

export function useTip() {
  const v = useContext(TipContext)
  if (!v) throw new Error('useTip outside provider')
  return v
}

/** Spread onto any element to give it a hover tooltip. */
export function useTipHandlers(content: ReactNode) {
  const { show, hide } = useTip()
  return {
    onMouseEnter: (e: React.MouseEvent) => show(content, e),
    onMouseMove: (e: React.MouseEvent) => show(content, e),
    onMouseLeave: hide,
  }
}
