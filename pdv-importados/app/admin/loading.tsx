import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton estrutural do Admin V2 — espelha PageHeader + grid de KPIs +
 * SectionCard com linhas de tabela, para que a navegação entre telas dê
 * feedback imediato em vez de área em branco.
 */
export default function AdminLoading() {
  return (
    <div className="admin-v2-page admin-v2-stack" aria-busy="true">
      <header className="mb-5 border-b border-[var(--admin-v2-border)] pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Skeleton width="14rem" height="1.75rem" variant="rounded" />
            <Skeleton width="20rem" height="0.875rem" variant="text" />
          </div>
          <Skeleton width="16rem" height="2rem" variant="rounded" />
        </div>
      </header>

      <div className="admin-v2-grid-kpi">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="admin-v2-section-card rounded-lg p-4">
            <Skeleton width="6rem" height="0.75rem" variant="text" />
            <Skeleton width="8rem" height="1.5rem" variant="rounded" className="mt-2" />
          </div>
        ))}
      </div>

      <div className="admin-v2-section-card rounded-lg p-4">
        <div className="mb-3 flex items-center justify-between border-b border-[var(--admin-v2-border)] pb-3">
          <Skeleton width="10rem" height="1.125rem" variant="rounded" />
          <Skeleton width="6rem" height="1.5rem" variant="rounded" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} width="100%" height="2rem" variant="rounded" />
          ))}
        </div>
      </div>
    </div>
  )
}
