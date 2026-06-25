'use client'

import { useState } from 'react'
import { Eye } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatBRL } from '@/lib/format/money'
import { VendaDetailSheet, type VendaAlvo } from './VendaDetailSheet'
import { toPayment, toVendaStatus } from './vendaMaps'
import { TableRowActionBtn } from '@/components/ui/admin-v2/TableRowAction'

export type VendaLinha = {
  id: string
  data: string | null
  total_liquido: number | null
  forma_pagamento: string | null
  status: string | null
  qtd_itens_total: number
  qtd_itens_distintos: number
  primeiro_produto: string | null
}

export type VendasLabels = {
  colVenda: string
  colHora: string
  colItens: string
  colPagamento: string
  colTotal: string
  colCaixa: string
  colStatus: string
  colVendedor: string
  concluida: string
  cancelada: string
  unidade: string
  unidades: string
  item: string
  itensPl: string
  pagDinheiro: string
  pagPix: string
  pagCredito: string
  pagDebito: string
  pagCartao: string
  pagOutro: string
  vazioTitulo: string
  vazioSub: string
  detalheTitulo: string
  detalheErroTitulo: string
  detalheErroSub: string
  detalheData: string
  detalheTipo: string
  detalheOperador: string
  detalheNfe: string
  detalheBruto: string
  detalheDesconto: string
  detalheLiquido: string
  detalheItens: string
  detalheNenhumItem: string
}

function statusDotTone(status: string | null): 'success' | 'danger' | 'muted' {
  const up = String(status ?? '').trim().toUpperCase()
  if (up === 'CONCLUIDA') return 'success'
  if (up === 'CANCELADA') return 'danger'
  return 'muted'
}

function StatusCell({ status, labels }: { status: string | null; labels: VendasLabels }) {
  const s = toVendaStatus(status)
  const tone = statusDotTone(status)
  const dotClass =
    tone === 'success'
      ? 'bg-emerald-400'
      : tone === 'danger'
        ? 'bg-red-400'
        : 'bg-jl-fg-3'
  if (s) {
    const label = s === 'CONCLUIDA' ? labels.concluida : s === 'CANCELADA' ? labels.cancelada : s
    const pillClass =
      tone === 'success'
        ? 'admin-v2-badge-success'
        : tone === 'danger'
          ? 'admin-v2-badge-danger'
          : 'admin-v2-badge-muted'
    return (
      <span className={`${pillClass} inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[11px] font-medium leading-none`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
        {label}
      </span>
    )
  }
  if (status) {
    return (
      <span className="admin-v2-badge-muted inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[11px] font-medium leading-none">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
        {status}
      </span>
    )
  }
  return <span className="text-jl-fg-3">—</span>
}

function paymentLabel(formaPagamento: string | null, labels: VendasLabels): string {
  const payment = toPayment(formaPagamento)
  if (payment === 'DINHEIRO') return labels.pagDinheiro
  if (payment === 'PIX') return labels.pagPix
  if (payment === 'CREDITO') return labels.pagCredito
  if (payment === 'DEBITO') return labels.pagDebito
  if (payment === 'CARTAO') return labels.pagCartao
  return labels.pagOutro
}

function ItensCell({ row, labels }: { row: VendaLinha; labels: VendasLabels }) {
  const extras = row.qtd_itens_distintos - 1
  return (
    <div className="min-w-0">
      <p className="max-w-[260px] truncate text-[12px] text-jl-fg-1">{row.primeiro_produto ?? '—'}</p>
      <p className="text-[10px] text-jl-fg-3">
        {row.qtd_itens_total} {row.qtd_itens_total === 1 ? labels.unidade : labels.unidades}
        {extras > 0 ? ` · +${extras} ${extras === 1 ? labels.item : labels.itensPl}` : ''}
      </p>
    </div>
  )
}

function HoraCell({ data }: { data: string | null }) {
  if (!data) return <span className="text-jl-fg-3">—</span>
  const d = new Date(data)
  if (Number.isNaN(d.getTime())) return <span className="text-jl-fg-3">—</span>
  return (
    <span className="whitespace-nowrap text-[12px] text-jl-fg-2">
      {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
    </span>
  )
}


export function VendasTable({ vendas, labels }: { vendas: VendaLinha[]; labels: VendasLabels }) {
  const [alvo, setAlvo] = useState<VendaAlvo | null>(null)

  const columns: Column<VendaLinha>[] = [
    {
      key: 'venda',
      header: labels.colVenda,
      sortValue: (r) => r.id,
      cell: (r) => (
        <span className="max-w-[120px] truncate font-medium text-jl-fg-1" title={r.id}>
          {r.id}
        </span>
      ),
    },
    {
      key: 'hora',
      header: labels.colHora,
      sortValue: (r) => r.data ?? '',
      cell: (r) => <HoraCell data={r.data} />,
    },
    {
      key: 'itens',
      header: labels.colItens,
      cell: (r) => <ItensCell row={r} labels={labels} />,
    },
    {
      key: 'pagamento',
      header: labels.colPagamento,
      cell: (r) => <span className="text-[12px] text-jl-fg-2">{paymentLabel(r.forma_pagamento, labels)}</span>,
    },
    {
      key: 'total',
      header: labels.colTotal,
      align: 'right',
      sortValue: (r) => r.total_liquido ?? 0,
      cell: (r) =>
        r.total_liquido == null ? (
          <span className="text-jl-fg-3">—</span>
        ) : (
          <span className="text-[12px] font-medium text-jl-fg-1">{formatBRL(r.total_liquido)}</span>
        ),
    },
    {
      key: 'caixa',
      header: labels.colCaixa,
      align: 'center',
      cell: () => <span className="text-[12px] text-jl-fg-2">01</span>,
    },
    {
      key: 'status',
      header: labels.colStatus,
      align: 'center',
      cell: (r) => <StatusCell status={r.status} labels={labels} />,
    },
    {
      key: 'vendedor',
      header: labels.colVendedor,
      cell: () => <span className="text-[12px] text-jl-fg-3">—</span>,
    },
  ]

  return (
    <>
      <DataTable
        data={vendas}
        columns={columns}
        rowKey={(r) => r.id}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="text-4xl text-jl-fg-3" aria-hidden>🧾</span>
            <p className="text-[14px] font-medium text-jl-fg-2">{labels.vazioTitulo}</p>
            <p className="text-[12px] text-jl-fg-3">{labels.vazioSub}</p>
          </div>
        }
        className="rounded-none border-x-0 border-b-0"
        onRowClick={(r) => setAlvo({ id: r.id })}
        rowActions={(row) => (
          <div className="flex items-center justify-end gap-1">
            <TableRowActionBtn
              label={`${labels.detalheTitulo} ${row.id.slice(0, 8)}`}
              onClick={(e) => { e.stopPropagation(); setAlvo({ id: row.id }) }}
            >
              <Eye size={13} aria-hidden />
            </TableRowActionBtn>
          </div>
        )}
      />

      <VendaDetailSheet
        alvo={alvo}
        onClose={() => setAlvo(null)}
        labels={{
          titulo: labels.detalheTitulo,
          erroTitulo: labels.detalheErroTitulo,
          erroSub: labels.detalheErroSub,
          data: labels.detalheData,
          tipo: labels.detalheTipo,
          operador: labels.detalheOperador,
          nfe: labels.detalheNfe,
          bruto: labels.detalheBruto,
          desconto: labels.detalheDesconto,
          liquido: labels.detalheLiquido,
          itens: labels.detalheItens,
          nenhumItem: labels.detalheNenhumItem,
        }}
      />
    </>
  )
}
