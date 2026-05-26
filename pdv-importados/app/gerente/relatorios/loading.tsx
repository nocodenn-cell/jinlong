function TableSkeleton({ cols, rows }: { cols: number[]; rows: number }) {
  return (
    <div className="dragon-glass-card overflow-hidden rounded-xl">
      <div className="flex gap-4 border-b border-jl-border-1 px-4 py-2.5">
        {cols.map((w, i) => (
          <div key={i} className="h-2.5 rounded bg-white/[0.07]" style={{ width: w }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-jl-border-1/40 px-4 py-[9px]">
          {cols.map((w, j) => (
            <div key={j} className="h-2.5 rounded bg-white/[0.06]" style={{ width: w }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export default function RelatoriosLoading() {
  return (
    <div className="space-y-5">
      <div className="dragon-glass-card rounded-xl p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 rounded-lg bg-white/[0.07]" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="dragon-glass-card rounded-xl p-4">
            <div className="h-2 w-14 rounded bg-white/[0.07]" />
            <div className="mt-2 h-6 w-20 rounded bg-white/[0.09]" />
          </div>
        ))}
      </div>
      <div className="dragon-glass-card rounded-xl p-5">
        <div className="h-[260px] rounded-lg bg-white/[0.04]" />
      </div>
      <TableSkeleton cols={[80, 96, 160, 112, 96, 112, 80]} rows={8} />
    </div>
  )
}
