'use client'

import { Trash2, Plus, Minus } from 'lucide-react'
import type { ItemCarrinho } from '@/lib/etiqueta/types'
import type { Idioma } from '@/idioma/normalizeIdioma'

type Props = {
  itens: ItemCarrinho[]
  onAtualizarQuantidade: (produtoId: string, novaQuantidade: number) => void
  onRemover: (produtoId: string) => void
  onLimpar: () => void
  idioma: Idioma
}

const LABELS: Record<Idioma, { quantidade: string; remover: string; limpar: string; total: string; preco: string }> = {
  pt: {
    quantidade: 'Qtd',
    remover: 'Remover',
    limpar: 'Limpar Carrinho',
    total: 'Total',
    preco: 'Preço',
  },
  zh: {
    quantidade: '数量',
    remover: '删除',
    limpar: '清空购物车',
    total: '总计',
    preco: '价格',
  },
}

export function EtiquetaCarrinho({
  itens,
  onAtualizarQuantidade,
  onRemover,
  onLimpar,
  idioma,
}: Props) {
  const labels = LABELS[idioma]
  const totalEtiquetas = itens.reduce((sum, item) => sum + item.quantidade, 0)

  if (itens.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-500">
          {idioma === 'zh' ? '购物车为空' : 'Carrinho vazio'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {labels.total}: {totalEtiquetas}
        </h3>
        <button
          type="button"
          onClick={onLimpar}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
        >
          {labels.limpar}
        </button>
      </div>

      <div className="space-y-2">
        {itens.map((item) => (
          <div
            key={item.produtoId}
            className="flex items-center gap-3 rounded-lg border bg-white p-3 shadow-sm"
          >
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">{item.nome}</p>
              <p className="text-xs text-gray-500">{item.codigoBarras}</p>
              <p className="text-xs font-semibold text-gray-700">
                {labels.preco}: R$ {item.precoVarejo.toFixed(2)}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onAtualizarQuantidade(item.produtoId, Math.max(1, item.quantidade - 1))}
                disabled={item.quantidade <= 1}
                className="rounded-md p-1 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Minus className="h-4 w-4" />
              </button>

              <span className="w-8 text-center text-sm font-medium">{item.quantidade}</span>

              <button
                type="button"
                onClick={() => onAtualizarQuantidade(item.produtoId, item.quantidade + 1)}
                className="rounded-md p-1 hover:bg-gray-100"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => onRemover(item.produtoId)}
              className="rounded-md p-2 text-destructive hover:bg-destructive/10"
              title={labels.remover}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
