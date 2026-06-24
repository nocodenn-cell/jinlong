import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AdminV2UtilityBar } from './AdminV2UtilityBar'

export type BreadcrumbItem = {
  label: string
  href?: string
}

type PageHeaderProps = {
  title: string
  subtitle?: string
  /** Ações primárias/secundárias (botões) exibidas à direita do cabeçalho. */
  filters?: ReactNode
  /** Trilha de navegação estilo Bling: ex. [{ label: 'Estoque' }, { label: 'Produtos' }] */
  breadcrumbs?: BreadcrumbItem[]
  className?: string
}

export function PageHeader({ title, subtitle, filters, breadcrumbs, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-5 border-b border-[var(--admin-v2-border)] pb-4', className)}>

      {/* Breadcrumbs — contexto de localização como no Bling */}
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Navegação estrutural" className="mb-2 flex items-center gap-1">
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1
            return (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight className="h-3 w-3 shrink-0 text-jl-fg-3" aria-hidden />
                )}
                {crumb.href && !isLast ? (
                  <Link
                    href={crumb.href}
                    className="text-[12px] text-jl-fg-3 transition-colors hover:text-jl-fg-2"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={cn(
                      'text-[12px]',
                      isLast ? 'font-medium text-jl-fg-2' : 'text-jl-fg-3',
                    )}
                    aria-current={isLast ? 'page' : undefined}
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            )
          })}
        </nav>
      ) : null}

      {/* Título + ações — título à esquerda, ações à direita como no Bling */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-jl-fg-1 md:text-2xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-[13px] text-jl-fg-3">{subtitle}</p> : null}
        </div>

        {/* Ações + utilitários alinhados à direita */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {filters}
          <AdminV2UtilityBar />
        </div>
      </div>
    </header>
  )
}
