function TableSkeleton({ cols, rows }: { cols: number[]; rows: number }) {
  return (
    <div className="dragon-glass-card overflow-hidden rounded-xl">
      <div className="flex gap-4 border-b border-jl-border-1 px-4 py-2.5">
        {cols.map((w, i) => (
          <div key={i} className="h-2.5 animate-pulse rounded bg-white/[0.07]" style={{ width: w }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-jl-border-1/40 px-4 py-[9px]">
          {cols.map((w, j) => (
            <div key={j} className="h-2.5 animate-pulse rounded bg-white/[0.06]" style={{ width: w }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export default function FinanceiroLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="dragon-glass-card rounded-xl p-4">
            <div className="h-2 w-14 rounded bg-white/[0.07]" />
            <div className="mt-2 h-7 w-20 rounded bg-white/[0.09]" style={{ animationDelay: `${i * 80}ms` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1 border-b border-jl-border-1">
        {[80, 96, 88].map((w, i) => (
          <div key={i} className="h-8 rounded-t bg-white/[0.07]" style={{ width: w }} />
        ))}
      </div>
      <TableSkeleton cols={[160, 96, 80, 80, 80]} rows={8} />
    </div>
  )
}
