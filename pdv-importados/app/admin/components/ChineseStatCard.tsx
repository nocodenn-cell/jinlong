import type { LucideIcon } from 'lucide-react'

type ChineseStatCardProps = {
  titleLine: string
  titleCn?: string
  value: string
  trend: string
  up: boolean
  icon: LucideIcon
  iconAccentClass: string
  /** Selo 福 e cartão papel — só no modo oriental. */
  variant?: 'oriental' | 'minimal'
}

export function ChineseStatCard({
  titleLine,
  titleCn,
  value,
  trend,
  up,
  icon: Icon,
  iconAccentClass,
  variant = 'oriental',
}: ChineseStatCardProps) {
  const oriental = variant === 'oriental'
  const shell = oriental
    ? 'card-chinese relative flex min-h-[148px] flex-col p-5'
    : 'relative flex min-h-[148px] flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm'

  return (
    <div
      className={shell}
      title={
        oriental
          ? 'Selo chinês 福 — Símbolo de prosperidade e boa sorte'
          : undefined
      }
    >
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="mb-3 flex items-start justify-between gap-2 pl-1">
          <div
            className="shrink-0 rounded-lg p-2"
            style={{ background: oriental ? 'rgba(45, 90, 74, 0.1)' : 'rgb(248 250 252)' }}
          >
            <Icon className={iconAccentClass} size={22} strokeWidth={1.75} />
          </div>
          <span
            className={`max-w-[55%] truncate text-right text-xs font-semibold tabular-nums ${
              up ? (oriental ? 'text-[#2d5a4a]' : 'text-emerald-700') : 'text-red-600'
            }`}
            title={trend}
          >
            {up ? '↑' : '↓'} {trend}
          </span>
        </div>
        <p className="mb-0.5 pl-1 text-xs font-medium text-slate-600">{titleLine}</p>
        {titleCn ? (
          <p
            className={`mb-1 pl-1 text-[11px] font-medium ${oriental ? 'text-[#5c4d28]' : 'text-slate-500'}`}
            title={titleCn}
          >
            {titleCn}
          </p>
        ) : null}
        <h3 className="mt-auto pl-1 text-2xl font-bold tabular-nums text-slate-900">{value}</h3>
      </div>

      {oriental ? (
        <div
          className="pointer-events-none absolute bottom-1 right-2 z-0 text-4xl font-bold leading-none text-[#d4af37] opacity-[0.07] select-none"
          aria-hidden
        >
          福
        </div>
      ) : null}
    </div>
  )
}
