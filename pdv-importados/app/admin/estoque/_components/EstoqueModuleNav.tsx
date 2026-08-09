import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  ESTOQUE_MODULE_TABS,
  type EstoqueModuleNavLabels,
  type EstoqueModuleTabId,
} from './estoqueModuleNav'

type Props = Readonly<{
  active: EstoqueModuleTabId
  labels: EstoqueModuleNavLabels
}>

/**
 * Subnavegação local do módulo Estoque (não altera o shell Admin).
 */
export function EstoqueModuleNav({ active, labels }: Props) {
  return (
    <nav
      aria-label={labels.aria}
      className="mt-1 flex flex-wrap gap-1 border-b border-[var(--color-border)] pb-2"
    >
      {ESTOQUE_MODULE_TABS.map((tab) => {
        const isActive = tab.id === active
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'rounded-control px-3 py-1.5 text-small font-medium transition-colors',
              isActive
                ? 'bg-[var(--color-info-bg)] text-brand'
                : 'text-fg-subtle hover:bg-[var(--color-surface-soft)] hover:text-fg',
            )}
          >
            {labels[tab.labelKey]}
          </Link>
        )
      })}
    </nav>
  )
}
