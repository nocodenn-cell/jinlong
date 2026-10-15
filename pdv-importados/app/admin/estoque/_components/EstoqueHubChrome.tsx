import type { ReactNode } from 'react'
import { PageHeader } from '@/components/ui/admin-v2'
import { EstoqueHubNav } from '@/components/ui/admin-v2/EstoqueHubNav'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  subtitle: string
  children: ReactNode
  className?: string
}

/** Título, descrição e abas do hub — mesma ordem em todas as rotas de estoque. */
export function EstoqueHubChrome({ title, subtitle, children, className }: Props) {
  return (
    <div className={cn('estoque-operacional admin-v2-page', className)} data-testid="estoque-hub-chrome">
      <PageHeader title={title} subtitle={subtitle} />
      <EstoqueHubNav />
      {children}
    </div>
  )
}
