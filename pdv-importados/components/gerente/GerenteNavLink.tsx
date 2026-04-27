'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useGerenteUiTheme } from '@/components/gerente/GerenteThemeContext'
import { isGerenteLightChrome } from '@/components/gerente/gerenteUiTheme'
import { cn } from '@/lib/utils'

export type GerenteNavLinkProps = {
  href: string
  active: boolean
  children: ReactNode
}

/** Abas / filtros secundários no painel gerente — responde ao tema claro/escuro. */
export function GerenteNavLink({ href, active, children }: GerenteNavLinkProps) {
  const { theme } = useGerenteUiTheme()
  const light = isGerenteLightChrome(theme)

  return (
    <Link
      href={href}
      className={cn(
        'rounded-lg border px-3 py-1.5 text-sm font-medium no-underline transition-colors',
        light
          ? active
            ? 'app-border app-accent-text app-surface-soft'
            : 'app-border app-surface app-surface-text hover:app-accent-text'
          : active
            ? 'app-border app-accent-text app-surface-soft'
            : 'app-border app-surface app-surface-text hover:app-accent-text',
      )}
    >
      {children}
    </Link>
  )
}