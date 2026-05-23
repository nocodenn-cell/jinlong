function Bone({ w, h = 'h-2.5', opacity = '07' }: { w: number; h?: string; opacity?: string }) {
  return <div className={`animate-pulse rounded ${h} bg-white/[0.${opacity}]`} style={{ width: w }} />
}

export default function GerenteLoading() {
  return (
    <div className="space-y-8 pt-2">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="dragon-glass-card rounded-2xl p-5">
            <Bone w={64} />
            <Bone w={96} h="h-8" opacity="09" />
            <Bone w={80} h="h-2" opacity="05" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="dragon-glass-card rounded-xl p-4">
            <Bone w={56} h="h-2" />
            <Bone w={72} h="h-6" opacity="09" />
          </div>
        ))}
      </div>
    </div>
  )
}
