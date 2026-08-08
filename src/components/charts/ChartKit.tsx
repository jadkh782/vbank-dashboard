import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useChartTheme } from '../../theme'
import { fmtInt } from '../../lib/format'

export interface Series {
  key: string
  color: string
}

// Axis type is UI type, not chart type — it matches the tokens in global.css so
// tick labels read as part of the page rather than as something Recharts drew.
const AXIS_TICK = {
  fontFamily: "'Inter Variable', system-ui, -apple-system, sans-serif",
  fontSize: 10,
  letterSpacing: '0.03em',
} as const

// ── Shared tooltip (values lead, line-keys, untrusted labels as text) ──────

function VizTip({
  active,
  label,
  payload,
  valueFmt,
}: {
  active?: boolean
  label?: string
  payload?: { name?: string; value?: number | string; color?: string }[]
  valueFmt?: (v: number) => string
}) {
  if (!active || !payload || payload.length === 0) return null
  const fmt = valueFmt ?? ((v: number) => fmtInt(v))
  return (
    <div className="viz-tip">
      <div className="tip-title">{label}</div>
      {payload.map((p, i) => (
        <div className="tip-row" key={i}>
          <span className="tip-key" style={{ background: p.color }} />
          <span className="tip-val">{typeof p.value === 'number' ? fmt(p.value) : p.value ?? '–'}</span>
          <span className="tip-name">{p.name}</span>
        </div>
      ))}
    </div>
  )
}

export function LegendRow({ series, kind = 'rect' }: { series: Series[]; kind?: 'rect' | 'line' }) {
  if (series.length < 2) return null
  return (
    <div className="legend">
      {series.map((s) => (
        <span className="legend-item" key={s.key}>
          <span className={kind === 'rect' ? 'key-rect' : 'key-line'} style={{ background: s.color }} />
          {s.key}
        </span>
      ))}
    </div>
  )
}

// ── Stacked bars over time ─────────────────────────────────────────────────

export function StackedBarsChart({
  data,
  series,
  height = 240,
  valueFmt,
}: {
  data: Record<string, unknown>[]
  series: Series[]
  height?: number
  valueFmt?: (v: number) => string
}) {
  const t = useChartTheme()
  const tickInterval = data.length > 40 ? Math.floor(data.length / 12) : data.length > 16 ? 1 : 0
  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid stroke={t.grid} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: t.axisInk, ...AXIS_TICK }}
            tickLine={false}
            axisLine={{ stroke: t.baseline, strokeWidth: 1 }}
            interval={tickInterval}
            dy={2}
          />
          <YAxis
            tick={{ fill: t.axisInk, ...AXIS_TICK }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tickFormatter={(v: number) => fmtInt(v)}
          />
          <Tooltip
            cursor={{ fill: t.grid, opacity: 0.45 }}
            content={<VizTip valueFmt={valueFmt} />}
            isAnimationActive={false}
          />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="a"
              fill={s.color}
              stroke={t.surface}
              strokeWidth={1}
              maxBarSize={26}
              /* Square. Rounded caps on a stacked column read as decoration and
                 make the top segment look shorter than the value it encodes. */
              radius={0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <LegendRow series={series} />
    </>
  )
}

// ── Single-series line ─────────────────────────────────────────────────────

export function TrendLineChart({
  data,
  dataKey,
  name,
  color,
  height = 200,
  valueFmt,
  domain,
  lineType = 'monotone',
}: {
  data: Record<string, unknown>[]
  dataKey: string
  name: string
  color?: string
  height?: number
  valueFmt?: (v: number) => string
  domain?: [number | 'auto', number | 'auto']
  lineType?: 'monotone' | 'stepAfter'
}) {
  const t = useChartTheme()
  const stroke = color ?? t.accent
  const tickInterval = data.length > 40 ? Math.floor(data.length / 12) : data.length > 16 ? 1 : 0
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={t.grid} strokeWidth={1} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: t.axisInk, ...AXIS_TICK }}
          tickLine={false}
          axisLine={{ stroke: t.baseline, strokeWidth: 1 }}
          interval={tickInterval}
          dy={2}
        />
        <YAxis
          tick={{ fill: t.axisInk, ...AXIS_TICK }}
          tickLine={false}
          axisLine={false}
          domain={domain}
          tickFormatter={(v: number) => (valueFmt ? valueFmt(v) : fmtInt(v))}
          width={52}
        />
        <Tooltip
          cursor={{ stroke: t.baseline, strokeWidth: 1 }}
          content={<VizTip valueFmt={valueFmt} />}
          isAnimationActive={false}
        />
        <Line
          type={lineType}
          dataKey={dataKey}
          name={name}
          stroke={stroke}
          strokeWidth={2}
          dot={false}
          connectNulls
          activeDot={{ r: 4, fill: stroke, stroke: t.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Sparkline (stat tiles) ─────────────────────────────────────────────────

export function Sparkline({ values, color }: { values: number[]; color?: string }) {
  const t = useChartTheme()
  const data = values.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width="100%" height={30}>
      <LineChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 2 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color ?? t.accent}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Card shell ─────────────────────────────────────────────────────────────

export function ChartCard({
  title,
  sub,
  children,
  refetching,
  className,
}: {
  title: string
  sub?: string
  children: ReactNode
  refetching?: boolean
  className?: string
}) {
  return (
    <div className={`card${className ? ` ${className}` : ''}`}>
      <div className="card-head">
        <span className="card-title">{title}</span>
        {sub ? <span className="card-sub">{sub}</span> : null}
      </div>
      <div className={refetching ? 'refetching' : undefined}>{children}</div>
    </div>
  )
}
