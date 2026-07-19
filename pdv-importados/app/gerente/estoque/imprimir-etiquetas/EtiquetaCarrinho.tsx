'use client'

import { Trash2, Plus, Minus } from 'lucide-react'
import type { ItemCarrinho } from '@/lib/etiqueta/types'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { formatDecimalBRL } from '@/lib/format/money'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { SectionCard } from '@/components/ui/admin-v2'

type Props = {
  itens: ItemCarrinho[]
  onAtualizarQuantidade: (produtoId: string, novaQuantidade: number) => void
  onRemover: (produtoId: string) => void
  onLimpar: () => void
  idioma: Idioma
}

const LABELS: Record<Idioma, { quantidade: string; remover: string; limpar: string; total: string; preco: string; vazio: string }> = {
  pt: {
    quantidade: 'Qtd',
    remover: 'Remover',
    limpar: 'Limpar Carrinho',
    total: 'Total',
    preco: 'Preço',
    vazio: 'Carrinho vazio',
  },
  zh: {
    quantidade: '数量',
    remover: '删除',
    limpar: '清空购物车',
    total: '总计',
    preco: '价格',
    vazio: '购物车为空',
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
      <SectionCard className="border-dashed">
        <EmptyState title={labels.vazio} />
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title={`${labels.total}: ${totalEtiquetas}`}
      action={
        <Button type="button" variant="ghost" size="sm" onClick={onLimpar}>
          {labels.limpar}
        </Button>
      }
    >
      <div className="space-y-2">
        {itens.map((item) => (
          <div
            key={item.produtoId}
            className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-medium">{item.nome}</p>
              <p className="text-caption text-fg-muted">{item.codigoBarras}</p>
              <p className="text-caption font-semibold text-fg">
                {labels.preco}: R$ {formatDecimalBRL(item.precoVarejo)}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onAtualizarQuantidade(item.produtoId, Math.max(1, item.quantidade - 1))}
                disabled={item.quantidade <= 1}
                aria-label={`${labels.quantidade} -1`}
              >
                <Minus className="h-4 w-4" />
              </Button>

              <span className="w-8 text-center text-body font-medium">{item.quantidade}</span>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onAtualizarQuantidade(item.produtoId, item.quantidade + 1)}
                aria-label={`${labels.quantidade} +1`}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-[var(--color-danger-strong)] hover:bg-[var(--color-danger-bg)]"
              onClick={() => onRemover(item.produtoId)}
              title={labels.remover}
              aria-label={labels.remover}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
