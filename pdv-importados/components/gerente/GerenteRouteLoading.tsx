/**
 * Skeletons de rota estáveis (sem animate-pulse) para evitar flicker na demo.
 */

function Bone({
  w,
  h = 'h-2.5',
  opacity = '07',
}: {
  w: number
  h?: string
  opacity?: string
}) {
  return (
    <div
      className={`rounded ${h} bg-white/[0.${opacity}]`}
      style={{ width: w }}
      aria-hidden
    />
  )
}

export function GerenteTableRouteSkeleton({
  cols,
  rows,
}: {
  cols: number[]
  rows: number
}) {
  return (
    <div className="dragon-glass-card overflow-hidden rounded-xl">
      <div className="flex gap-4 border-b border-jl-border-1 px-4 py-2.5">
        {cols.map((w, i) => (
          <Bone key={i} w={w} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 border-b border-jl-border-1/40 px-4 py-[9px]"
        >
          {cols.map((w, j) => (
            <Bone key={j} w={w} opacity="06" />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Toolbar + tabela — layout típico de listagens gerente */
export function GerenteListPageRouteSkeleton({
  cols,
  rows = 10,
}: {
  cols: number[]
  rows?: number
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-9 w-60 rounded-lg bg-white/[0.07]" aria-hidden />
        <div className="h-9 w-28 rounded-lg bg-white/[0.07]" aria-hidden />
        <div className="ml-auto h-9 w-36 rounded-lg bg-white/[0.07]" aria-hidden />
      </div>
      <GerenteTableRouteSkeleton cols={cols} rows={rows} />
    </div>
  )
}

/** Fallback do segmento /gerente quando a rota filha não define loading próprio */
export function GerenteSegmentRouteSkeleton() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-4 px-4 py-6 sm:px-6">
      <GerenteListPageRouteSkeleton cols={[80, 96, 160, 112, 80, 80]} rows={8} />
    </div>
  )
}
