'use client'

import { useState } from 'react'
import Link from 'next/link'
import { History, SlidersHorizontal } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'
import { AjusteSaldoModal, type AjusteAlvo } from './AjusteSaldoModal'
import { KardexSheet, type KardexAlvo } from './KardexSheet'
import { estoqueSaldoTone } from './estoqueSaldoDisplay'

export type EstoqueLinha = {
  id: string
  nome: string
  codigo_barras: string | null
  unidade_medida: string
  origem: string
  quantidade_atual: number | null
  estoque_minimo: number | null
  deficit: number | null
}

export type EstoqueLabels = {
  produto: string
  saldo: string
  minimo: string
  deficit: string
  unidade: string
  origem: string
  origemChina: string
  origemBrasilNf: string
  origemBrasil: string
  vazioTitulo: string
  vazioSub: string
  vazioActionLabel?: string
  vazioActionHref?: string
  ajusteTitulo: string
  ajusteAcao: string
  saldoAtual: string
  estoqueMinimo: string
  motivo: string
  observacao: string
  cancelar: string
  salvarAjuste: string
  salvando: string
  motivoAcertoInventario: string
  motivoEntradaCompra: string
  motivoPerda: string
  motivoQuebra: string
  motivoOutro: string
  kardexTitulo: string
  semMovimentos: string
  semMovimentosSub: string
  tipoVenda: string
  tipoCompra: string
  tipoEntradaNf: string
  tipoEntrada: string
  tipoSaida: string
  tipoAjuste: string
  tipoDevolucao: string
  tipoTransferencia: string
  tipoAcertoInventario: string
  tipoPerda: string
  tipoQuebra: string
  tipoOutro: string
}

const ORIGEM_BADGE: Record<string, string> = {
  china_manual:
    'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-strong)]',
  brasil_nf: 'border-[var(--color-info-border)] bg-[var(--color-info-bg)] text-brand',
  brasil_sem_nf: 'border-[var(--color-border)] bg-[var(--color-surface-muted)] text-fg-muted',
}

const SALDO_TONE_CLASS = {
  empty: 'text-fg-subtle',
  'neutral-zero': 'tabular-nums text-fg-muted',
  'danger-zero': 'font-semibold tabular-nums text-[var(--color-danger-strong)]',
  low: 'font-semibold tabular-nums text-[var(--color-warning-strong)]',
  ok: 'tabular-nums text-[var(--color-success-strong)]',
} as const

function SaldoCell({
  value,
  minimo,
}: {
  value: number | null
  minimo: number | null
}) {
  const tone = estoqueSaldoTone(value, minimo)
  if (tone === 'empty') {
    return <span className={SALDO_TONE_CLASS.empty}>—</span>
  }
  return <span className={SALDO_TONE_CLASS[tone]}>{value}</span>
}

export function EstoqueTable({ linhas, labels }: { linhas: EstoqueLinha[]; labels: EstoqueLabels }) {
  const [ajusteAlvo, setAjusteAlvo] = useState<AjusteAlvo | null>(null)
  const [kardexAlvo, setKardexAlvo] = useState<KardexAlvo | null>(null)

  const showDeficit = linhas.some((r) => r.deficit != null && r.deficit > 0)

  const columns: Column<EstoqueLinha>[] = [
    {
      key: 'produto',
      header: labels.produto,
      priority: 'primary',
      cell: (r) => (
        <div className="min-w-0 max-w-[280px]">
          <p className="truncate text-body font-medium text-fg" title={r.nome}>
            {r.nome}
          </p>
          <p className="font-mono text-caption text-fg-muted">
            {r.codigo_barras?.trim() ? r.codigo_barras : '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'saldo',
      header: labels.saldo,
      align: 'right',
      priority: 'primary',
      cell: (r) => <SaldoCell value={r.quantidade_atual} minimo={r.estoque_minimo} />,
    },
    {
      key: 'minimo',
      header: labels.minimo,
      align: 'right',
      cell: (r) =>
        r.estoque_minimo === null ? (
          <span className="text-fg-subtle">—</span>
        ) : (
          <span className="tabular-nums text-fg-muted">{r.estoque_minimo}</span>
        ),
    },
    ...(showDeficit
      ? [
          {
            key: 'deficit',
            header: labels.deficit,
            align: 'right' as const,
            cell: (r: EstoqueLinha) =>
              r.deficit != null && r.deficit > 0 ? (
                <span className="font-medium tabular-nums text-[var(--color-warning-strong)]">
                  -{r.deficit}
                </span>
              ) : (
                <span className="text-fg-subtle">—</span>
              ),
          } satisfies Column<EstoqueLinha>,
        ]
      : []),
    {
      key: 'unidade',
      header: labels.unidade,
      align: 'center',
      priority: 'contextual',
      cell: (r) => (
        <span className="text-caption uppercase text-fg-subtle">{r.unidade_medida}</span>
      ),
    },
    {
      key: 'origem',
      header: labels.origem,
      cell: (r) => {
        const badgeClass = ORIGEM_BADGE[r.origem]
        if (!badgeClass) return <span className="text-fg-subtle">—</span>
        const origemLabel =
          r.origem === 'china_manual'
            ? labels.origemChina
            : r.origem === 'brasil_nf'
              ? labels.origemBrasilNf
              : labels.origemBrasil
        return <Badge className={cn('text-caption font-medium', badgeClass)}>{origemLabel}</Badge>
      },
    },
  ]

  const emptyNode =
    labels.vazioActionHref && labels.vazioActionLabel ? (
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <EmptyState title={labels.vazioTitulo} description={labels.vazioSub} className="py-0" />
        <Button asChild variant="secondary" size="sm">
          <Link href={labels.vazioActionHref}>{labels.vazioActionLabel}</Link>
        </Button>
      </div>
    ) : (
      <EmptyState title={labels.vazioTitulo} description={labels.vazioSub} />
    )

  return (
    <>
      <DataTable
        data={linhas}
        columns={columns}
        rowKey={(r) => r.id}
        emptyState={emptyNode}
        stickyHeader
        className="rounded-none border-x-0 border-b-0"
        rowActions={(row) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-1.5"
              aria-label={`${labels.ajusteTitulo} ${row.nome}`}
              title={labels.ajusteTitulo}
              onClick={(e) => {
                e.stopPropagation()
                setAjusteAlvo({
                  produtoId: row.id,
                  produtoNome: row.nome,
                  quantidadeAtual: row.quantidade_atual ?? 0,
                  estoqueMinimo: row.estoque_minimo ?? 0,
                })
              }}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">{labels.ajusteAcao}</span>
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`${labels.kardexTitulo} ${row.nome}`}
              title={labels.kardexTitulo}
              onClick={(e) => {
                e.stopPropagation()
                setKardexAlvo({ produtoId: row.id, produtoNome: row.nome })
              }}
            >
              <History className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}
      />

      <AjusteSaldoModal
        alvo={ajusteAlvo}
        onClose={() => setAjusteAlvo(null)}
        labels={{
          titulo: labels.ajusteTitulo,
          saldoAtual: labels.saldoAtual,
          estoqueMinimo: labels.estoqueMinimo,
          motivo: labels.motivo,
          observacao: labels.observacao,
          cancelar: labels.cancelar,
          salvar: labels.salvarAjuste,
          salvando: labels.salvando,
          motivos: [
            { value: 'ACERTO_INVENTARIO', label: labels.motivoAcertoInventario },
            { value: 'COMPRA', label: labels.motivoEntradaCompra },
            { value: 'PERDA', label: labels.motivoPerda },
            { value: 'QUEBRA', label: labels.motivoQuebra },
            { value: 'OUTRO', label: labels.motivoOutro },
          ],
        }}
      />
      <KardexSheet
        alvo={kardexAlvo}
        onClose={() => setKardexAlvo(null)}
        labels={{
          titulo: labels.kardexTitulo,
          semMovimentos: labels.semMovimentos,
          semMovimentosSub: labels.semMovimentosSub,
          tipoMap: {
            VENDA: labels.tipoVenda,
            COMPRA: labels.tipoCompra,
            ENTRADA_NF: labels.tipoEntradaNf,
            ENTRADA: labels.tipoEntrada,
            SAIDA: labels.tipoSaida,
            AJUSTE: labels.tipoAjuste,
            ACERTO_INVENTARIO: labels.tipoAcertoInventario,
            PERDA: labels.tipoPerda,
            QUEBRA: labels.tipoQuebra,
            DEVOLUCAO: labels.tipoDevolucao,
            TRANSFERENCIA: labels.tipoTransferencia,
            OUTRO: labels.tipoOutro,
          },
        }}
      />
    </>
  )
}
