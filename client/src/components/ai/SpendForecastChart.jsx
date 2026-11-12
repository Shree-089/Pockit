import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatINR, formatINRCompact, fromPaise } from '../../utils/money.js'
import { formatDateLabel } from '../../utils/calculations.js'

/*
 * Cumulative spend this month (solid), straight-line forecast (dashed) and the
 * even-pace guardrail (grey). Data comes from buildSpendSeries() in paise;
 * converted to rupees here only for the chart scale.
 */
const COLORS = { actual: '#4169E1', projected: '#4169E1', guardrail: '#73788C' }

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-card">
      <p className="mb-1 font-semibold text-ink">{formatDateLabel(point.date)} · Day {point.day}</p>
      {point.actual != null && <p className="text-ink">Spent so far: {formatINR(point.actualPaise)}</p>}
      {point.actual == null && point.projected != null && <p className="text-ink">Forecast: {formatINR(point.projectedPaise)}</p>}
      <p className="text-muted">Even-pace budget: {formatINR(point.guardrailPaise)}</p>
    </div>
  )
}

export default function SpendForecastChart({ series, todayDay }) {
  const data = series.map((p) => ({
    ...p,
    actualPaise: p.actual,
    projectedPaise: p.projected,
    guardrailPaise: p.guardrail,
    actual: p.actual == null ? null : fromPaise(p.actual),
    projected: p.projected == null ? null : fromPaise(p.projected),
    guardrail: fromPaise(p.guardrail),
  }))

  return (
    <div>
      <div className="h-44 w-full" role="img" aria-label="Cumulative spending this month with forecast and even-pace budget line">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.actual} stopOpacity={0.18} />
                <stop offset="100%" stopColor={COLORS.actual} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="day"
              ticks={[1, todayDay, data.length]}
              tickFormatter={(d) => (d === todayDay ? 'Today' : `Day ${d}`)}
              tick={{ fontSize: 11, fill: '#73788C' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              width={44}
              tickFormatter={(v) => formatINRCompact(v * 100)}
              tick={{ fontSize: 11, fill: '#73788C' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#E7EAF0', strokeWidth: 2 }} />
            <ReferenceLine x={todayDay} stroke="#E7EAF0" strokeWidth={2} />
            <Line dataKey="guardrail" type="linear" stroke={COLORS.guardrail} strokeWidth={2} strokeDasharray="2 4" dot={false} activeDot={false} isAnimationActive={false} />
            <Area dataKey="actual" type="monotone" stroke={COLORS.actual} strokeWidth={2} fill="url(#spendFill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} connectNulls={false} />
            <Line dataKey="projected" type="linear" stroke={COLORS.projected} strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-royal" /> Spent</li>
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-royal" /> Forecast</li>
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dotted border-muted" /> Even-pace budget</li>
      </ul>
    </div>
  )
}
