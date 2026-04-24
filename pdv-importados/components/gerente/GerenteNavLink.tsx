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
            ? 'border-amber-400/70 bg-amber-50 text-amber-950'
            : 'border-slate-200 bg-white text-slate-800 hover:border-amber-300/60 hover:bg-amber-50/50'
          : active
            ? 'border-amber-500/45 bg-amber-500/15 text-amber-100'
            : 'border-slate-600/60 bg-slate-900/45 text-slate-200 hover:border-amber-500/35 hover:text-amber-200',
      )}
    >
      {children}
    </Link>
  )
}