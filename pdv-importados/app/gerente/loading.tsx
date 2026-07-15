import { Skeleton } from '@/components/ui/skeleton'

/** Feedback imediato ao navegar entre telas do gerente (evita área em branco). */
export default function GerenteLoading() {
  return (
    <div className="space-y-4 p-4" aria-busy="true">
      <div className="space-y-2">
        <Skeleton width="14rem" height="1.5rem" variant="rounded" />
        <Skeleton width="20rem" height="0.875rem" variant="text" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} width="100%" height="4.5rem" variant="rounded" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} width="100%" height="2rem" variant="rounded" />
        ))}
      </div>
    </div>
  )
}
