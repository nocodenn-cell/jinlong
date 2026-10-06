'use client'

import { Trash2, Plus, Minus } from 'lucide-react'
import type { ItemCarrinho } from '@/lib/etiqueta/types'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { formatDecimalBRL } from '@/lib/format/money'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { SectionCard } from '@/components/ui/admin-v2'
import { normalizarQuantidadeEtiqueta } from './etiquetaCarrinhoMerge'

type Props = {
  itens: ItemCarrinho[]
  onAtualizarQuantidade: (produtoId: string, novaQuantidade: number) => void
  onRemover: (produtoId: string) => void
  onLimpar: () => void
  onSelecionarPreview?: (produtoId: string) => void
  produtoPreviewId?: string | null
  idioma: Idioma
  maxPorPdf: number
}

const LABELS: Record<
  Idioma,
  {
    quantidade: string
    remover: string
    limpar: string
    total: string
    preco: string
    vazio: string
    lote: string
  }
> = {
  pt: {
    quantidade: 'Qtd',
    remover: 'Remover',
    limpar: 'Limpar',
    total: 'Total',
    preco: 'Preço',
    vazio: 'Nenhum produto no lote. Busque pelo nome ou código de barras.',
    lote: 'Lote para impressão',
  },
  zh: {
    quantidade: '数量',
    remover: '删除',
    limpar: '清空',
    total: '总计',
    preco: '价格',
    vazio: '批次为空。请按名称或条码搜索产品。',
    lote: '打印批次',
  },
}

export function EtiquetaCarrinho({
  itens,
  onAtualizarQuantidade,
  onRemover,
  onLimpar,
  onSelecionarPreview,
  produtoPreviewId,
  idioma,
  maxPorPdf,
}: Props) {
  const labels = LABELS[idioma]
  const totalEtiquetas = itens.reduce((sum, item) => sum + item.quantidade, 0)

  if (itens.length === 0) {
    return (
      <SectionCard className="h-auto border-dashed" title={labels.lote}>
        <EmptyState title={labels.vazio} />
      </SectionCard>
    )
  }

  return (
    <SectionCard
      className="h-auto"
      title={`${labels.lote} · ${labels.total}: ${totalEtiquetas}`}
      action={
        <Button type="button" variant="ghost" size="sm" onClick={onLimpar}>
          {labels.limpar}
        </Button>
      }
    >
      <div className="space-y-2">
        {itens.map((item) => {
          const ativo = produtoPreviewId === item.produtoId
          return (
            <div
              key={item.produtoId}
              role={onSelecionarPreview ? 'button' : undefined}
              tabIndex={onSelecionarPreview ? 0 : undefined}
              onClick={() => onSelecionarPreview?.(item.produtoId)}
              onKeyDown={(e) => {
                if (!onSelecionarPreview) return
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelecionarPreview(item.produtoId)
                }
              }}
              className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 transition-colors ${
                ativo
                  ? 'border-brand/35 bg-[var(--color-info-bg)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)]'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium">{item.nome}</p>
                <p className="text-caption text-fg-muted">{item.codigoBarras || '—'}</p>
                <p className="text-caption font-semibold text-fg">
                  {labels.preco}: R$ {formatDecimalBRL(item.precoVarejo)}
                </p>
              </div>

              <div
                className="flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() =>
                    onAtualizarQuantidade(
                      item.produtoId,
                      normalizarQuantidadeEtiqueta(item.quantidade - 1),
                    )
                  }
                  disabled={item.quantidade <= 1}
                  aria-label={`${labels.quantidade} -1`}
                >
                  <Minus className="h-4 w-4" />
                </Button>

                <input
                  type="number"
                  min={1}
                  max={maxPorPdf}
                  step={1}
                  value={item.quantidade}
                  aria-label={`${labels.quantidade} ${item.nome}`}
                  className="w-16 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-center text-body"
                  onChange={(e) => {
                    const value = Number(e.target.value)
                    if (Number.isInteger(value) && value >= 1) {
                      onAtualizarQuantidade(
                        item.produtoId,
                        normalizarQuantidadeEtiqueta(Math.min(value, maxPorPdf)),
                      )
                    }
                  }}
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() =>
                    onAtualizarQuantidade(
                      item.produtoId,
                      normalizarQuantidadeEtiqueta(item.quantidade + 1),
                    )
                  }
                  disabled={item.quantidade >= maxPorPdf}
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
                onClick={(e) => {
                  e.stopPropagation()
                  onRemover(item.produtoId)
                }}
                title={labels.remover}
                aria-label={labels.remover}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}
