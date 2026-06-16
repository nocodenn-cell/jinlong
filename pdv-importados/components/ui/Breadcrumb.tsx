/**
 * FastProduct — Breadcrumb
 *
 * Trilha de navegação simples para o topo de telas ERP (ex.: "Estoque /
 * Transferências"). Último item sempre estático (página atual).
 */

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export type BreadcrumbItem = {
  label: string
  href?: string
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12px] text-jl-fg-3">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1
        return (
          <span key={`${item.label}-${idx}`} className="flex items-center gap-1.5">
            {item.href && !isLast ? (
              <Link href={item.href} className="transition-colors hover:text-jl-fg-1">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'font-medium text-jl-fg-1' : undefined}>{item.label}</span>
            )}
            {!isLast ? <ChevronRight size={12} strokeWidth={2} aria-hidden /> : null}
          </span>
        )
      })}
    </nav>
  )
}
