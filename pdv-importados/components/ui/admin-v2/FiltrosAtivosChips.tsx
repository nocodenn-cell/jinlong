import Link from 'next/link'

/**
 * Marcadores de filtros ativos (A3 da auditoria UI/UX): cada chip remove o próprio filtro (href sem ele) e
 * "Limpar filtros" remove todos. Só links: funciona em Server e Client Components, sem estado.
 */
export type FiltroAtivoChip = { key: string; label: string; href: string }

export function FiltrosAtivosChips({
  chips,
  limparHref,
  labels,
  className,
}: {
  chips: readonly FiltroAtivoChip[]
  limparHref?: string
  labels: { regiao: string; remover: string; limpar: string }
  className?: string
}) {
  if (chips.length === 0) return null
  return (
    <div
      role="group"
      aria-label={labels.regiao}
      data-testid="filtros-ativos"
      className={className ?? 'flex flex-wrap items-center gap-1.5'}
    >
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          className="admin-v2-chip"
          data-filtro={chip.key}
          aria-label={labels.remover.replace('{{label}}', chip.label)}
        >
          {chip.label}
          <span aria-hidden className="text-jl-fg-3">
            ✕
          </span>
        </Link>
      ))}
      {limparHref ? (
        <Link
          href={limparHref}
          data-testid="filtros-limpar"
          className="text-caption font-medium text-jl-fg-3 underline-offset-2 hover:text-jl-fg-1 hover:underline"
        >
          {labels.limpar}
        </Link>
      ) : null}
    </div>
  )
}
