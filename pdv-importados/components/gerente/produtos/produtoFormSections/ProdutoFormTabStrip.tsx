'use client'

import { cn } from '@/lib/utils'

export type ProdutoFormTabId = 'basico' | 'estoque' | 'compra' | 'venda' | 'fiscal'

export type ProdutoFormTabDef = Readonly<{
  id: ProdutoFormTabId
  label: string
}>

type Props = Readonly<{
  tabs: readonly ProdutoFormTabDef[]
  active: ProdutoFormTabId
  onChange: (id: ProdutoFormTabId) => void
  disabled?: boolean
}>

/** Faixa de abas simples para organizar o formulário de produto por seção. */
export function ProdutoFormTabStrip({ tabs, active, onChange, disabled }: Props) {
  return (
    <div role="tablist" className="mb-4 flex flex-wrap gap-1 border-b border-[var(--color-border-secondary)]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          disabled={disabled}
          onClick={() => onChange(tab.id)}
          className={cn(
            'relative -mb-px rounded-t-md px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50',
            tab.id === active
              ? 'border-b-2 border-jl-accent text-jl-fg-1'
              : 'text-jl-fg-3 hover:text-jl-fg-2',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
