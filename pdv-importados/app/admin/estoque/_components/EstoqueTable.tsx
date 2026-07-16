'use client'

import { useState } from 'react'
import { History, SlidersHorizontal } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { cn } from '@/lib/utils'
import { AjusteSaldoModal, type AjusteAlvo } from './AjusteSaldoModal'
import { KardexSheet, type KardexAlvo } from './KardexSheet'

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
  ajusteTitulo: string
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
  kardexErroCarregar: string
  kardexTentarNovamente: string
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
  china_manual: 'admin-v2-badge-gold',
  brasil_nf: 'admin-v2-badge-warning',
  brasil_sem_nf: 'admin-v2-badge-muted',
}

type Severity = 'zero' | 'low' | 'ok'

function severidadeSaldo(atual: number | null, minimo: number | null): Severity {
  if (atual === null) return 'ok'
  if (atual <= 0) return 'zero'
  if (minimo != null && atual <= minimo) return 'low'
  return 'ok'
}

const SEV_CLASS: Record<Severity, string> = {
  zero: 'font-semibold text-red-400',
  low: 'font-semibold text-amber-400',
  ok: 'text-emerald-400',
}

function ActionBtn({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-jl-fg-3 transition-colors hover:bg-jl-surface-elev hover:text-jl-fg-1"
    >
      {children}
    </button>
  )
}

export function EstoqueTable({ linhas, labels }: { linhas: EstoqueLinha[]; labels: EstoqueLabels }) {
  const [ajusteAlvo, setAjusteAlvo] = useState<AjusteAlvo | null>(null)
  const [kardexAlvo, setKardexAlvo] = useState<KardexAlvo | null>(null)

  const columns: Column<EstoqueLinha>[] = [
    {
      key: 'produto',
      header: labels.produto,
      sortValue: (r) => r.nome,
      cell: (r) => (
        <div className="min-w-0">
          <p className="max-w-[240px] truncate text-[12px] font-medium text-jl-fg-1">{r.nome}</p>
          <p className="font-mono text-[10px] text-jl-fg-3">{r.codigo_barras ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'saldo',
      header: labels.saldo,
      align: 'right',
      sortValue: (r) => r.quantidade_atual ?? Number.NEGATIVE_INFINITY,
      cell: (r) => {
        if (r.quantidade_atual === null) return <span className="text-jl-fg-3">—</span>
        const sev = severidadeSaldo(r.quantidade_atual, r.estoque_minimo)
        return <span className={SEV_CLASS[sev]}>{r.quantidade_atual}</span>
      },
    },
    {
      key: 'minimo',
      header: labels.minimo,
      align: 'right',
      sortValue: (r) => r.estoque_minimo ?? Number.NEGATIVE_INFINITY,
      cell: (r) =>
        r.estoque_minimo === null ? (
          <span className="text-jl-fg-3">—</span>
        ) : (
          <span className="text-jl-fg-2">{r.estoque_minimo}</span>
        ),
    },
    {
      key: 'deficit',
      header: labels.deficit,
      align: 'right',
      sortValue: (r) => r.deficit ?? 0,
      cell: (r) =>
        r.deficit != null && r.deficit > 0 ? (
          <span className="font-medium text-amber-400">-{r.deficit}</span>
        ) : (
          <span className="text-jl-fg-3">—</span>
        ),
    },
    {
      key: 'unidade',
      header: labels.unidade,
      align: 'center',
      cell: (r) => <span className="text-[11px] uppercase text-jl-fg-3">{r.unidade_medida}</span>,
    },
    {
      key: 'origem',
      header: labels.origem,
      cell: (r) => {
        const badgeClass = ORIGEM_BADGE[r.origem]
        if (!badgeClass) return <span className="text-jl-fg-3">—</span>
        const origemLabel = r.origem === 'china_manual' ? labels.origemChina
          : r.origem === 'brasil_nf' ? labels.origemBrasilNf
          : labels.origemBrasil
        return (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium leading-none',
              badgeClass,
            )}
          >
            {origemLabel}
          </span>
        )
      },
    },
  ]

  return (
    <>
      <DataTable
        data={linhas}
        columns={columns}
        rowKey={(r) => r.id}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="text-4xl text-jl-fg-3" aria-hidden>📦</span>
            <p className="text-[14px] font-medium text-jl-fg-2">{labels.vazioTitulo}</p>
            <p className="text-[12px] text-jl-fg-3">{labels.vazioSub}</p>
          </div>
        }
        className="rounded-none border-x-0 border-b-0"
        rowActions={(row) => (
          <div className="flex items-center justify-end gap-1">
            <ActionBtn
              label={`${labels.ajusteTitulo} ${row.nome}`}
              onClick={() =>
                setAjusteAlvo({
                  produtoId: row.id,
                  produtoNome: row.nome,
                  quantidadeAtual: row.quantidade_atual ?? 0,
                  estoqueMinimo: row.estoque_minimo ?? 0,
                })
              }
            >
              <SlidersHorizontal size={13} aria-hidden />
            </ActionBtn>
            <ActionBtn
              label={`${labels.kardexTitulo} ${row.nome}`}
              onClick={() => setKardexAlvo({ produtoId: row.id, produtoNome: row.nome })}
            >
              <History size={13} aria-hidden />
            </ActionBtn>
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
          erroCarregar: labels.kardexErroCarregar,
          tentarNovamente: labels.kardexTentarNovamente,
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
