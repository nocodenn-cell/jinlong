'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  EXECUTIVE_VIEW_IDS,
  executiveViewHref,
  isExecutiveRelatoriosView,
  type ExecutiveViewId,
} from '@/lib/navigation/executiveViews'
import { ROUTES } from '@/lib/navigation/routes'
import { cn } from '@/lib/utils'
import { useExecT } from '@/lib/i18n/useExecT'

type ExecutiveAnalyticsHubNavProps = {
  /** View forçada (SSR). Se omitida, lê `?view=` da URL. */
  activeView?: ExecutiveViewId
  className?: string
}

/**
 * Hub horizontal das 5 abas executivas (ponte dashboard ↔ relatórios).
 */
function resolveActiveView(
  pathname: string,
  viewParam: string | null,
  forced?: ExecutiveViewId,
): ExecutiveViewId | null {
  if (forced) return forced
  if (pathname === ROUTES.admin.dashboard || pathname.startsWith(`${ROUTES.admin.dashboard}/`)) {
    return 'visao-geral'
  }
  if (isExecutiveRelatoriosView(viewParam)) return viewParam
  return null
}

export function ExecutiveAnalyticsHubNav({ activeView, className }: ExecutiveAnalyticsHubNavProps) {
  const t = useExecT()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = resolveActiveView(pathname, searchParams?.get('view') ?? null, activeView)

  return (
    <nav
      className={cn(
        'mb-4 flex flex-wrap gap-1 border-b border-[var(--color-border)] pb-2',
        className,
      )}
      aria-label={t('hdr.abas_executivas')}
      data-testid="executive-analytics-hub-nav"
    >
      {EXECUTIVE_VIEW_IDS.map((view) => {
        const href = executiveViewHref(view)
        const active = current === view
        return (
          <Link
            key={view}
            href={href}
            data-active={active}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-full px-3 py-1.5 text-small font-medium transition-colors',
              active
                ? 'bg-[rgba(251,191,36,0.15)] text-[var(--color-brand-primary)]'
                : 'text-fg-subtle hover:text-fg',
            )}
          >
            {view === 'visao-geral' ? t('hdr.visao_geral') : t(`view.${view}`)}
          </Link>
        )
      })}
    </nav>
  )
}
