function Bone({ w, h = 'h-2.5' }: { w: number; h?: string }) {
  return (
    <div
      className={`${h} rounded bg-white/[0.07]`}
      style={{ width: w }}
    />
  )
}

function TableSkeleton({ cols, rows }: { cols: number[]; rows: number }) {
  return (
    <div className="dragon-glass-card overflow-hidden rounded-xl">
      <div className="flex gap-4 border-b border-jl-border-1 px-4 py-2.5">
        {cols.map((w, i) => (
          <div key={i} className="h-2.5 rounded bg-white/[0.07]" style={{ width: w }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-white/[0.06] px-4 py-[9px]">
          {cols.map((w, j) => (
            <div key={j} className="h-2.5 rounded bg-white/[0.06]" style={{ width: w }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export default function RelatorioEstoqueLoading() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
      {/* Title */}
      <div className="mb-5 flex flex-col gap-2">
        <Bone w={200} h="h-5" />
        <Bone w={320} />
      </div>

      {/* KPI cards */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="dragon-glass-card rounded-xl p-4">
            <Bone w={80} />
            <Bone w={48} h="h-6" />
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="dragon-glass-card mb-4 flex flex-wrap gap-2 rounded-xl px-4 py-3">
        <Bone w={64} h="h-6" />
        <Bone w={64} h="h-6" />
        <Bone w={80} h="h-6" />
        <Bone w={96} h="h-6" />
        <Bone w={96} h="h-6" />
        <Bone w={96} h="h-6" />
        <div className="flex-1" />
        <Bone w={100} h="h-7" />
      </div>

      {/* Table */}
      <TableSkeleton cols={[180, 80, 56, 96, 64, 56, 56]} rows={10} />
    </div>
  )
}
