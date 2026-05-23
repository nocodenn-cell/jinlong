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

export default function VendasLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-9 w-60 rounded-lg bg-white/[0.07]" />
        <div className="h-9 w-28 rounded-lg bg-white/[0.07]" />
        <div className="ml-auto h-9 w-36 rounded-lg bg-white/[0.07]" />
      </div>
      <TableSkeleton cols={[80, 96, 160, 112, 80, 80]} rows={10} />
    </div>
  )
}
