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
          className="flex gap-4 border-b border-white/[0.06] px-4 py-[9px]"
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
    <div>
      {/* Placeholder sticky que espelha GerenteStickyToolbar para evitar flash de borda durante navegação */}
      <div
        className="sticky z-[25] w-full border-b py-2 shadow-sm bg-[#0f172a] border-[color:var(--jl-border-2)] -mx-4 px-4 md:-mx-6 md:px-6"
        style={{ top: 'var(--gerente-sticky-top, 60px)' }}
        aria-hidden
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-60 rounded-lg bg-white/[0.07]" />
          <div className="h-9 w-28 rounded-lg bg-white/[0.07]" />
          <div className="ml-auto h-9 w-36 rounded-lg bg-white/[0.07]" />
        </div>
      </div>
      <div className="mt-4">
        <GerenteTableRouteSkeleton cols={cols} rows={rows} />
      </div>
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
