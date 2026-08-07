import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueleto de rota para as telas de listagem do admin.
 *
 * Existe porque `app/admin/loading.tsx` é um spinner genérico para 26 telas: o
 * layout salta ao trocar do spinner para a página. Aqui as faixas ocupam as
 * mesmas posições do conteúdo real (header → KPIs → filtros → tabela), então a
 * transição não desloca nada.
 *
 * Puramente visual — `aria-hidden` no `Skeleton` e `role="status"` no wrapper,
 * para o leitor de tela anunciar "carregando" uma vez em vez de ler as barras.
 */

type ListPageSkeletonProps = {
  /** Nº de cards de KPI acima da lista (0 = tela sem KPIs). */
  kpis?: number
  /** Nº de linhas esboçadas na tabela. */
  rows?: number
  /** Faixa de filtros acima da tabela. */
  filters?: boolean
  label?: string
}

export function ListPageSkeleton({
  kpis = 0,
  rows = 8,
  filters = true,
  label = 'Carregando…',
}: ListPageSkeletonProps) {
  return (
    <div className="admin-v2-page admin-v2-stack" role="status" aria-live="polite" aria-label={label}>
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton width="14rem" height="1.75rem" variant="text" />
          <Skeleton width="22rem" height="0.875rem" variant="text" />
        </div>
        <Skeleton width="9rem" height="2.25rem" variant="rounded" />
      </div>

      {kpis > 0 ? (
        <div className="admin-v2-grid-kpi">
          {Array.from({ length: kpis }).map((_, i) => (
            <Skeleton key={`kpi-${i}`} height="8rem" variant="rounded" />
          ))}
        </div>
      ) : null}

      {filters ? <Skeleton height="2.5rem" variant="rounded" /> : null}

      <div className="overflow-hidden rounded-card border border-[var(--color-border)]">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2.5">
          <Skeleton width="10rem" height="0.75rem" variant="text" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={`row-${i}`}
            className="flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-2.5 last:border-b-0"
          >
            <Skeleton className="flex-1" height="0.875rem" variant="text" />
            <Skeleton width="6rem" height="0.875rem" variant="text" />
            <Skeleton width="4rem" height="0.875rem" variant="text" />
            <Skeleton width="3.5rem" height="1.25rem" variant="rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
