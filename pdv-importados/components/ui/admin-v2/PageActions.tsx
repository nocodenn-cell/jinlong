import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PageActionsProps = {
  children: ReactNode
  className?: string
}

/**
 * PageActions — grupo de CTAs do cabeçalho CRUD (Novo, Importar, Exportar…).
 * Contrato visual único do Catálogo (Onda 5).
 */
export function PageActions({ children, className }: PageActionsProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2', className)}>
      {children}
    </div>
  )
}
