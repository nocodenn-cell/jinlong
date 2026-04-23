import Link from 'next/link'
import { DragonIcon } from '@/components/icons/DragonIcon'
import { cn } from '@/lib/utils'

type Variant = 'full' | 'symbol' | 'wordmark'

type PropsSymbol = {
  variant: 'symbol'
  className?: string
  href?: string
  'aria-label'?: string
}

type PropsWithSubtitle = {
  variant: 'full' | 'wordmark'
  /** Linha secundária da marca (ex.: Dragon POS / 龙码收银) — veja `brand.logo_subtitle` nos JSON. */
  logoSubtitle: string
  className?: string
  href?: string
  'aria-label'?: string
}

export type LogoProps = PropsSymbol | PropsWithSubtitle

/**
 * Logomarca oficial Fastproduct + subtítulo de marca (i18n).
 * `full`: ícone + wordmark · `symbol`: só o dragão · `wordmark`: só texto.
 */
export function Logo(props: LogoProps) {
  const { className, href, 'aria-label': ariaLabel } = props
  const logoSubtitle = props.variant !== 'symbol' ? props.logoSubtitle : undefined

  const wordmark = (
    <span className="flex flex-col items-center leading-none">
      <span className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-50">
        Fastproduct
      </span>
      {logoSubtitle ? (
        <span className="mt-1 text-[11px] font-medium tracking-[0.12em] text-amber-500/90 sm:text-xs sm:tracking-[0.18em]">
          {logoSubtitle}
        </span>
      ) : null}
    </span>
  )

  const mark =
    props.variant === 'wordmark' ? (
      <span className={cn('inline-flex flex-col items-center', className)}>{wordmark}</span>
    ) : (
      <span
        className={cn(
          'inline-flex items-center gap-2',
          props.variant === 'full' ? 'flex-col sm:flex-row sm:items-end' : 'items-center justify-center',
          className,
        )}
      >
        {props.variant === 'full' ? (
          <DragonIcon className={cn('shrink-0 text-amber-500', 'h-16 w-16 sm:h-20 sm:w-20')} />
        ) : (
          <DragonIcon className={cn('shrink-0 text-amber-500', 'h-8 w-8 sm:h-9 sm:w-9')} />
        )}
        {props.variant === 'full' ? wordmark : null}
      </span>
    )

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          'rounded-lg outline-none ring-offset-2 ring-offset-slate-950 focus-visible:ring-2 focus-visible:ring-amber-400/70',
        )}
        aria-label={ariaLabel ?? 'Fastproduct — início'}
      >
        {mark}
      </Link>
    )
  }

  return mark
}
