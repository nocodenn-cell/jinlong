import Link from 'next/link'
import { DragonEmblemIcon } from '@/components/icons/DragonEmblemIcon'
import { cn } from '@/lib/utils'

type PropsSymbol = {
  variant: 'symbol'
  className?: string
  href?: string
  'aria-label'?: string
}

type PropsWithSubtitle = {
  variant: 'full' | 'wordmark'
  /** Linha secundária da marca (ex.: Jīn Lóng / 金龍) — veja `brand.logo_subtitle` nos JSON. */
  logoSubtitle: string
  className?: string
  href?: string
  'aria-label'?: string
}

export type LogoProps = PropsSymbol | PropsWithSubtitle

/**
 * Logomarca oficial Jīn Lóng + subtítulo de marca (i18n).
 * `full`: ícone + wordmark · `symbol`: só o dragão · `wordmark`: só texto.
 */
export function Logo(props: LogoProps) {
  const { className, href, 'aria-label': ariaLabel } = props
  const logoSubtitle = props.variant !== 'symbol' ? props.logoSubtitle : undefined
  const hasHref = Boolean(href)

  const wordmark = (
    <span className="flex flex-col items-center leading-none">
      <span className="logo-wordmark-main text-2xl sm:text-3xl font-semibold tracking-tight">
        Jīn Lóng
      </span>
      {logoSubtitle ? (
        <span className="dragon-hero-subtitle logo-wordmark-subtitle mt-1 text-[11px] font-medium tracking-[0.12em] sm:text-xs sm:tracking-[0.18em]">
          {logoSubtitle}
        </span>
      ) : null}
    </span>
  )

  const mark =
    props.variant === 'wordmark' ? (
      <span className={cn('inline-flex flex-col items-center', !hasHref ? className : undefined)}>{wordmark}</span>
    ) : (
      <span
        className={cn(
          'inline-flex items-center gap-2',
          props.variant === 'full' ? 'flex-col sm:flex-row sm:items-end' : 'items-center justify-center',
          hasHref ? undefined : className,
        )}
      >
        {props.variant === 'full' ? (
          <DragonEmblemIcon className={cn('dragon-hero-mark shrink-0', 'h-16 w-16 sm:h-20 sm:w-20')} />
        ) : (
          <DragonEmblemIcon className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
        )}
        {props.variant === 'full' ? wordmark : null}
      </span>
    )

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          'inline-flex rounded-lg outline-none ring-offset-2 ring-offset-slate-950 focus-visible:ring-2 focus-visible:ring-amber-400/70',
          className,
        )}
        aria-label={ariaLabel ?? 'Jīn Lóng — início'}
      >
        {mark}
      </Link>
    )
  }

  return mark
}