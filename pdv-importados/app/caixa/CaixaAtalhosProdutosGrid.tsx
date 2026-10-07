'use client'

import type { AtalhoProdutoCaixa } from '@/app/caixa/caixaAtalhosProdutos'

type Props = {
  atalhos: readonly AtalhoProdutoCaixa[]
  disabled?: boolean
  onSelecionar: (codigo: string) => void
  titulo?: string
}

/**
 * Grade compacta de atalhos rápidos (itens sem bipagem habitual).
 */
export function CaixaAtalhosProdutosGrid({
  atalhos,
  disabled = false,
  onSelecionar,
  titulo = 'Atalhos rápidos',
}: Props) {
  if (atalhos.length === 0) return null

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="caixa-atalhos-produtos">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-2">
        {atalhos.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelecionar(item.codigo)}
            className="min-h-11 rounded-lg border border-border bg-card px-2 py-2 text-center text-sm font-semibold text-foreground transition hover:border-primary/50 hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-40"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
