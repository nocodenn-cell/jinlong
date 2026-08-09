/**
 * Skeleton de navegação do Catálogo (RSC loading UI).
 * Só chrome visual — sem fetch nem regras de negócio.
 */

export default function AdminCatalogoLoading() {
  return (
    <div className="admin-v2-page" aria-busy="true" aria-live="polite">
      <div className="mb-5 border-b border-[var(--color-border)] pb-5">
        <div className="h-8 w-40 animate-pulse rounded-md bg-[var(--color-surface-soft)]" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded-md bg-[var(--color-surface-soft)]" />
        <div className="mt-4 flex flex-wrap gap-2">
          <div className="h-9 w-36 animate-pulse rounded-md bg-[var(--color-surface-soft)]" />
          <div className="h-9 w-36 animate-pulse rounded-md bg-[var(--color-surface-soft)]" />
          <div className="h-9 w-28 animate-pulse rounded-md bg-[var(--color-surface-soft)]" />
        </div>
      </div>
      <div className="mb-4 space-y-2">
        <div className="h-10 max-w-xl animate-pulse rounded-md bg-[var(--color-surface-soft)]" />
        <div className="flex gap-2">
          <div className="h-8 w-40 animate-pulse rounded-md bg-[var(--color-surface-soft)]" />
          <div className="h-8 w-48 animate-pulse rounded-md bg-[var(--color-surface-soft)]" />
        </div>
      </div>
      <div className="admin-v2-panel space-y-2 rounded-lg p-3">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="h-10 animate-pulse rounded-md bg-[var(--color-surface-soft)]"
          />
        ))}
      </div>
    </div>
  )
}
