export default function AtividadesLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-6 space-y-2">
        <div className="h-6 w-56 rounded bg-white/[0.08]" />
        <div className="h-3 w-80 rounded bg-white/[0.05]" />
      </div>
      <div className="space-y-4">
        <div className="flex gap-2">
          {[80, 96, 64, 64].map((w, i) => (
            <div key={i} className="h-7 rounded-full bg-white/[0.07]" style={{ width: w }} />
          ))}
          <div className="ml-4 flex gap-2">
            {[48, 64, 56, 88, 48].map((w, i) => (
              <div key={i} className="h-7 rounded-full bg-white/[0.06]" style={{ width: w }} />
            ))}
          </div>
        </div>
        <div className="dragon-glass-card overflow-hidden rounded-xl">
          <div className="flex gap-6 border-b border-jl-border-1 px-4 py-2.5">
            {[40, 64, 200, 120].map((w, i) => (
              <div key={i} className="h-2.5 rounded bg-white/[0.07]" style={{ width: w }} />
            ))}
          </div>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex gap-6 border-b border-white/[0.06] px-4 py-[9px]">
              {[16, 48, 220, 112].map((w, j) => (
                <div key={j} className="h-2.5 rounded bg-white/[0.06]" style={{ width: w }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
