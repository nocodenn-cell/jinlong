/**
 * FastProduct — PaginationBar
 *
 * Barra de paginação padrão (info de página + Anterior/Próxima). Mesmo
 * padrão visual já usado inline em `app/admin/vendas/page.tsx`
 * (`PageLink`), extraído para reuso entre telas (estoque, produtos,
 * clientes, vendas).
 */

import Link from 'next/link'

export function PaginationBar({
  page,
  hasMore,
  hrefForPage,
  infoLabel,
  previousLabel = 'Anterior',
  nextLabel = 'Próxima',
}: {
  page: number
  hasMore: boolean
  hrefForPage: (page: number) => string
  infoLabel?: string
  previousLabel?: string
  nextLabel?: string
}) {
  if (page <= 1 && !hasMore) return null

  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <span className="text-[11px] text-jl-fg-3">{infoLabel}</span>
      <div className="flex items-center gap-1">
        <PageLink href={hrefForPage(page - 1)} disabled={page <= 1}>
          {previousLabel}
        </PageLink>
        <PageLink href={hrefForPage(page + 1)} disabled={!hasMore}>
          {nextLabel}
        </PageLink>
      </div>
    </div>
  )
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string
  disabled: boolean
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded-lg border border-[#242424] px-2.5 py-1 text-[11px] text-jl-fg-3 opacity-50">
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="rounded-lg border border-[#242424] px-2.5 py-1 text-[11px] text-jl-fg-2 transition-colors hover:bg-[#161616] hover:text-jl-fg-1"
    >
      {children}
    </Link>
  )
}
