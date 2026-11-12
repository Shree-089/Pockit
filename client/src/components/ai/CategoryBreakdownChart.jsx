import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatINR, fromPaise, percentOf } from '../../utils/money.js'

/** Donut of where this month's spending went, with a labelled legend (values never colour-only). */
export default function CategoryBreakdownChart({ categories, totalSpent }) {
  const data = categories
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .map((c) => ({ id: c.id, name: c.name, color: c.color, paise: c.spent, value: fromPaise(c.spent) }))

  if (data.length === 0) return <p className="py-6 text-center text-sm text-muted">No spending yet this month.</p>

  return (
    <div className="flex items-center gap-4">
      <div className="relative size-36 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.id} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(_, __, item) => [formatINR(item.payload.paise), item.payload.name]}
              contentStyle={{ borderRadius: 12, border: '1px solid #E7EAF0', fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-[10px] text-muted">Spent</p>
            <p className="font-heading text-sm font-bold">{formatINR(totalSpent)}</p>
          </div>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.id} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-ink">{d.name}</span>
            <span className="shrink-0 text-xs text-muted">{percentOf(d.paise, totalSpent, 0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
