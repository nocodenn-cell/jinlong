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
 *
 * Usa bg-[var(--color-background-secondary)] (night-900 solid) para garantir que o conteúdo abaixo
 * não apareça através do fundo. `border-[color:var(--border)]` usa o token
 * rgba do dragon theme diretamente (bg-card/border-border falham com rgba tokens).
 */
export function GerenteStickyToolbar({ children, className, bleed = 'page' }: GerenteStickyToolbarProps) {
  return (
    <div
      className={cn(
        'sticky z-[25] w-full border-b py-2 shadow-sm',
        'bg-[var(--color-background-secondary)] border-[color:var(--jl-border-2)]',
        'top-[var(--gerente-sticky-top,6.75rem)]',
        'print:static print:border-0 print:bg-transparent print:p-0 print:shadow-none',
        bleed === 'page' && bleedPage,
        className,
      )}
    >
      {children}
    </div>
  )
}
