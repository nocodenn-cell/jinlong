'use client'

import { Trash2, Plus, Minus } from 'lucide-react'
import type { ItemCarrinho } from '@/lib/etiqueta/types'
import type { Mensagens } from '@/i18n/getMessages'

type EtiquetasMensagens = Mensagens['estoque']['etiquetas']

type Props = {
  itens: ItemCarrinho[]
  onAtualizarQuantidade: (produtoId: string, novaQuantidade: number) => void
  onRemover: (produtoId: string) => void
  onLimpar: () => void
  m: EtiquetasMensagens
}

export function EtiquetaCarrinho({
  itens,
  onAtualizarQuantidade,
  onRemover,
  onLimpar,
  m,
}: Props) {
  const totalEtiquetas = itens.reduce((sum, item) => sum + item.quantidade, 0)

  if (itens.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-jl-border-1 bg-jl-surface-soft p-6 text-center">
        <p className="text-sm text-jl-fg-3">{m.carrinho_vazio}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-jl-fg-1">
          {m.total}: {totalEtiquetas}
        </h3>
        <button
          type="button"
          onClick={onLimpar}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
        >
          {m.limpar}
        </button>
      </div>

      <div className="space-y-2">
        {itens.map((item) => (
          <div
            key={item.produtoId}
            className="flex items-center gap-3 rounded-lg border border-jl-border-1 bg-jl-surface-elev p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-jl-fg-1">{item.nome}</p>
              <p className="text-xs text-jl-fg-3">{item.codigoBarras}</p>
              <p className="text-xs font-semibold text-jl-fg-2">
                {m.preco}: R$ {item.precoVarejo.toFixed(2)}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onAtualizarQuantidade(item.produtoId, Math.max(1, item.quantidade - 1))
                }
                disabled={item.quantidade <= 1}
                className="rounded-md p-1 hover:bg-jl-surface-soft disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Minus className="h-4 w-4" />
              </button>

              <span className="w-8 text-center text-sm font-medium tabular-nums">
                {item.quantidade}
              </span>

              <button
                type="button"
                onClick={() => onAtualizarQuantidade(item.produtoId, item.quantidade + 1)}
                className="rounded-md p-1 hover:bg-jl-surface-soft"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => onRemover(item.produtoId)}
              className="rounded-md p-2 text-destructive hover:bg-destructive/10"
              title={m.remover}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
