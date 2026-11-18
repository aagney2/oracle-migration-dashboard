import type { ReactNode } from 'react'
import { useTip } from '../../lib/context'
import type { DrillSpec } from '../../lib/drill'
import { fmtNumber, niceScale } from '../../lib/format'
import { drillHint, useDrill } from '../Drill'
import { tint } from '../ui'

export interface Segment {
  key: string
  label: string
  value: number
  color: string
  drill?: DrillSpec
  tip?: ReactNode
}

function useMark() {
  const { show, hide } = useTip()
  const { resolveSpec, activate } = useDrill()
  return (seg: { drill?: DrillSpec; tip: ReactNode; count: number }) => {
    const res = seg.drill ? resolveSpec(seg.drill) : null
    const clickable = res && res.kind !== 'none'
    const content = (
      <div>
        {seg.tip}
        {clickable && <div className="mt-1 text-accent-ink">{drillHint(res!, seg.count)} ↗</div>}
      </div>
    )
    return {
      clickable: Boolean(clickable),
      props: {
        onMouseEnter: (e: React.MouseEvent) => show(content, e),
        onMouseMove: (e: React.MouseEvent) => show(content, e),
        onMouseLeave: hide,
        onClick: clickable ? () => activate(seg.drill!, res!) : undefined,
        role: clickable ? 'button' : undefined,
        tabIndex: clickable ? 0 : undefined,
        onKeyDown: clickable
          ? (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') activate(seg.drill!, res!)
            }
          : undefined,
      },
    }
  }
}

/** One bar split into labelled segments, with counts listed underneath so zeros are visible too. */
export function SegmentedBar({ segments, unit = 'records' }: { segments: Segment[]; unit?: string }) {
  const mark = useMark()
  const total = segments.reduce((a, s) => a + s.value, 0)
  return (
    <div>
      <div className="flex h-10 w-full overflow-hidden rounded-lg bg-canvas ring-1 ring-inset ring-hairline">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => {
            const m = mark({ drill: s.drill, count: s.value, tip: s.tip ?? <SegTip label={s.label} value={s.value} total={total} unit={unit} /> })
            const pct = (s.value / total) * 100
            return (
              <div
                key={s.key}
                {...m.props}
                className={`flex items-center justify-center border-r-2 border-white text-[12px] font-semibold last:border-r-0 ${m.clickable ? 'cursor-pointer hover:brightness-95' : ''}`}
                style={{ width: `${pct}%`, background: s.color, color: '#fff' }}
              >
                {pct >= 6 && <span className="tnum truncate px-2">{pct >= 34 ? `${s.label} · ${s.value}` : s.value}</span>}
              </div>
            )
          })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1">
        {segments.map((s) => {
          const m = mark({ drill: s.drill, count: s.value, tip: s.tip ?? <SegTip label={s.label} value={s.value} total={total} unit={unit} /> })
          return (
            <div
              key={s.key}
              {...m.props}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-2 py-1.5 ${m.clickable ? 'cursor-pointer hover:bg-canvas' : ''}`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="text-[13px] text-ink-soft">{s.label}</span>
              <span className={`tnum text-[13px] font-semibold ${s.value ? 'text-ink' : 'text-ink-faint'}`}>{s.value}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SegTip({ label, value, total, unit }: { label: string; value: number; total: number; unit: string }) {
  return (
    <div>
      <div className="font-semibold">{label}</div>
      <div className="text-ink-muted">
        {value} of {total} {unit}
      </div>
    </div>
  )
}

export interface BarRow {
  key: string
  label: ReactNode
  sublabel?: ReactNode
  segments: Segment[]
}

/** Horizontal (optionally stacked) bars for named categories. One value axis. */
export function HBarChart({
  rows,
  format = (v: number) => fmtNumber(v),
  axisLabel,
  scale = niceScale,
  max: fixedMax,
  labelWidth = 200,
}: {
  rows: BarRow[]
  format?: (v: number) => string
  axisLabel?: string
  scale?: (v: number) => { max: number; ticks: number[]; tickLabel?: (t: number) => string }
  max?: number
  labelWidth?: number
}) {
  const mark = useMark()
  const totals = rows.map((r) => r.segments.reduce((a, s) => a + s.value, 0))
  const { max, ticks: tk, tickLabel = format } = scale(fixedMax ?? Math.max(0, ...totals))
  return (
    <div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.key} className="flex items-center gap-3">
            <div className="shrink-0 text-right" style={{ width: labelWidth }}>
              <div className="line-clamp-2 text-[13px] leading-4 text-ink" title={typeof r.label === 'string' ? r.label : undefined}>
                {r.label}
              </div>
              {r.sublabel && <div className="truncate text-[12px] text-ink-muted">{r.sublabel}</div>}
            </div>
            <div className="relative h-7 flex-1">
              <div className="absolute inset-0 flex">
                {tk.map((t) => (
                  <div key={t} className="absolute top-0 h-full border-l border-hairline/70" style={{ left: `${(t / max) * 100}%` }} />
                ))}
              </div>
              <div className="relative flex h-full items-center">
                {r.segments
                  .filter((s) => s.value > 0)
                  .map((s) => {
                    const m = mark({
                      drill: s.drill,
                      count: s.drill ? new Set(s.drill.records.map((x) => x.leadId)).size : s.value,
                      tip: s.tip ?? (
                        <div>
                          <div className="font-semibold">{typeof r.label === 'string' ? r.label : ''}</div>
                          <div className="text-ink-muted">
                            {s.label}: {format(s.value)}
                          </div>
                        </div>
                      ),
                    })
                    return (
                      <div
                        key={s.key}
                        {...m.props}
                        className={`h-5 border-r-2 border-white first:rounded-l-[4px] last:rounded-r-[4px] last:border-r-0 ${m.clickable ? 'cursor-pointer hover:brightness-95' : ''}`}
                        style={{ width: `${(s.value / max) * 100}%`, background: s.color }}
                      />
                    )
                  })}
                <span className="tnum ml-2 text-[13px] font-semibold text-ink">{format(totals[i])}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-center gap-3">
        <div className="shrink-0" style={{ width: labelWidth }} />
        <div className="relative h-5 flex-1 text-[11px] text-ink-faint">
          {tk.map((t, k) => (
            <span
              key={t}
              className={`tnum absolute whitespace-nowrap ${k === 0 ? '' : k === tk.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
              style={{ left: `${(t / max) * 100}%` }}
            >
              {tickLabel(t)}
            </span>
          ))}
        </div>
      </div>
      {axisLabel && <div className="mt-1 text-center text-[11px] text-ink-faint" style={{ paddingLeft: labelWidth }}>{axisLabel}</div>}
    </div>
  )
}

export function ShareBadge({ value, color }: { value: string; color: string }) {
  return (
    <span className="tnum rounded px-1.5 py-0.5 text-[12px] font-semibold" style={{ background: tint(color, 0.12) }}>
      {value}
    </span>
  )
}
