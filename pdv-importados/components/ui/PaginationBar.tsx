import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * PaginationBar — única API de paginação do Design System.
 *
 * Criada no 1º uso real conforme `docs/LAYOUT_KERNEL_ERP.md`, substituindo três
 * cópias locais de `PageLink`/`pageWindow` (catálogo, estoque, vendas) que
 * divergiam em raio, token de borda e escala tipográfica.
 *
 * Dois modos, porque as telas paginam de formas legitimamente diferentes:
 *
 * - `numbered` — a fonte sabe o total (RPC devolve contagem). Mostra janela de
 *   páginas com elipse.
 * - `cursor` — a fonte só sabe se **existe** próxima página (paginação por
 *   cursor, como vendas). Mostra apenas Anterior/Próxima.
 *
 * Não decide nada sobre os dados: recebe `page`, o total (ou `hasMore`) e uma
 * função que monta a URL. Navegação continua server-side via `?page=`.
 */

type PaginationBarBaseProps = {
  /** Página atual, 1-based. */
  page: number
  /** Monta o href de uma página — a tela decide quais filtros preservar. */
  pageHref: (page: number) => string
  /** Rótulo já formatado (ex.: "Página 2 de 7"). i18n fica na tela. */
  label?: string
  anteriorLabel: string
  proximaLabel: string
  className?: string
}

type PaginationBarProps = PaginationBarBaseProps &
  (
    | { mode?: 'numbered'; totalPages: number; hasMore?: never }
    | { mode: 'cursor'; hasMore: boolean; totalPages?: never }
  )

/**
 * Lê `?page=` da URL com o mesmo critério em toda tela paginada.
 *
 * Mora aqui porque é o contrato irmão da barra: quem renderiza a paginação e
 * quem interpreta o parâmetro precisam concordar sobre o que é página válida.
 * Estava copiado em catálogo, estoque e vendas.
 */
export function clampPage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '1', 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

/** Janela de páginas com elipse: 1 … atual-1 atual atual+1 … total. */
export function pageWindow(current: number, total: number): Array<number | 'gap'> {
  const out: Array<number | 'gap'> = []
  const win = new Set<number>([1, total, current - 1, current, current + 1])
  const sorted = [...win].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  let prev = 0
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push('gap')
    out.push(n)
    prev = n
  }
  return out
}

export function PaginationBar(props: PaginationBarProps) {
  const { page, pageHref, label, anteriorLabel, proximaLabel, className } = props
  const cursorMode = props.mode === 'cursor'

  const semAnterior = page <= 1
  const semProxima = cursorMode ? !props.hasMore : page >= props.totalPages

  // Uma página só e sem próxima: a barra não tem função — não renderiza.
  if (semAnterior && semProxima) return null

  return (
    <nav
      aria-label={label ?? 'Paginação'}
      className={cn('flex w-full items-center justify-between gap-3', className)}
    >
      {label ? <span className="text-caption text-fg-subtle">{label}</span> : <span />}
      <div className="flex items-center gap-1">
        <PageLink href={pageHref(page - 1)} disabled={semAnterior}>
          {anteriorLabel}
        </PageLink>
        {!cursorMode
          ? pageWindow(page, props.totalPages).map((p, i) =>
              p === 'gap' ? (
                <span key={`gap-${i}`} className="px-1 text-caption text-fg-subtle">
                  …
                </span>
              ) : (
                <PageNumber key={p} href={pageHref(p)} active={p === page}>
                  {p}
                </PageNumber>
              ),
            )
          : null}
        <PageLink href={pageHref(page + 1)} disabled={semProxima}>
          {proximaLabel}
        </PageLink>
      </div>
    </nav>
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
      <span
        aria-disabled="true"
        className="cursor-not-allowed rounded-control border border-[var(--color-border)] px-2.5 py-1 text-caption text-fg-subtle opacity-50"
      >
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="rounded-control border border-[var(--color-border)] px-2.5 py-1 text-caption text-fg-muted transition-colors hover:bg-[var(--color-surface-soft)] hover:text-fg"
    >
      {children}
    </Link>
  )
}

function PageNumber({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-7 min-w-[28px] items-center justify-center rounded-control px-1 text-caption font-medium transition-colors',
        active
          ? 'border border-[var(--color-info-border)] bg-[var(--color-info-bg)] text-brand'
          : 'border border-[var(--color-border)] text-fg-subtle hover:bg-[var(--color-surface-soft)] hover:text-fg',
      )}
    >
      {children}
    </Link>
  )
}
