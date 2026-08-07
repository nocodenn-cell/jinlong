import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * PaginationBar — única API de paginação do Design System.
 *
 * Modos:
 * - `numbered` — total conhecido
 * - `cursor` — só sabe se existe próxima
 * - `infinite` — load-more (Sprint 0 / UX-S0-21)
 */

type PaginationBarCommon = {
  label?: string
  className?: string
}

type PaginationBarProps = PaginationBarCommon &
  (
    | {
        mode?: 'numbered'
        page: number
        pageHref: (page: number) => string
        totalPages: number
        anteriorLabel: string
        proximaLabel: string
        hasMore?: never
        onLoadMore?: never
        loadMoreLabel?: never
      }
    | {
        mode: 'cursor'
        page: number
        pageHref: (page: number) => string
        hasMore: boolean
        anteriorLabel: string
        proximaLabel: string
        totalPages?: never
        onLoadMore?: never
        loadMoreLabel?: never
      }
    | {
        mode: 'infinite'
        hasMore: boolean
        onLoadMore: () => void
        loadMoreLabel: string
        page?: never
        pageHref?: never
        totalPages?: never
        anteriorLabel?: never
        proximaLabel?: never
      }
  )

/**
 * Lê `?page=` da URL com o mesmo critério em toda tela paginada.
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
  const { label, className } = props

  if (props.mode === 'infinite') {
    if (!props.hasMore) return null
    return (
      <nav
        aria-label={label ?? 'Paginação'}
        className={cn('flex w-full items-center justify-center gap-3', className)}
      >
        <button
          type="button"
          onClick={props.onLoadMore}
          className="rounded-control border border-[var(--color-border)] px-3 py-1.5 text-caption text-fg-muted transition-colors hover:bg-[var(--color-surface-soft)] hover:text-fg"
        >
          {props.loadMoreLabel}
        </button>
      </nav>
    )
  }

  const { page, pageHref, anteriorLabel, proximaLabel } = props
  const cursorMode = props.mode === 'cursor'
  const semAnterior = page <= 1
  const semProxima = cursorMode ? !props.hasMore : page >= props.totalPages

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
