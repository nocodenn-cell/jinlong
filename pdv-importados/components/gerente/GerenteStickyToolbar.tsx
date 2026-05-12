'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type GerenteStickyToolbarProps = Readonly<{
  children: ReactNode
  className?: string
  /** Alinha margens negativas ao container padrão `px-4 md:px-6` das páginas gerente. */
  bleed?: 'page' | 'none'
}>

const bleedPage = '-mx-4 px-4 md:-mx-6 md:px-6'

/**
 * Faixa sticky abaixo do header (`--gerente-sticky-top` em `.gerente-shell`).
 * Use para toolbars / filtros que devem permanecer visíveis em listas longas.
 */
export function GerenteStickyToolbar({ children, className, bleed = 'page' }: GerenteStickyToolbarProps) {
  return (
    <div
      className={cn(
        'sticky z-20 border-b border-border/40 bg-gradient-to-b from-card/95 via-card/90 to-card/80 py-2 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-card/75 print:static print:border-0 print:bg-transparent print:p-0 print:shadow-none',
        'top-[var(--gerente-sticky-top,5.75rem)]',
        bleed === 'page' && bleedPage,
        className,
      )}
    >
      {children}
    </div>
  )
}
