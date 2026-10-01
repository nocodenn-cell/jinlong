import { Skeleton } from '@/components/ui/skeleton'

/**
 * Carregamento das páginas admin: esqueleto no formato da página (título, KPIs e tabela) em vez de um
 * spinner de tela cheia — o layout não "pula" quando o conteúdo chega.
 */
export default function AdminLoading() {
  return (
    <div className="admin-v2-page admin-v2-stack min-h-[40vh]" aria-busy="true" aria-live="polite" data-testid="admin-loading">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}
