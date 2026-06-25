'use client'

/**
 * Dashboard — Pedidos recentes (Admin V2).
 * Usa o DataTable compartilhado: ordenação, densidade e badge de status
 * consistentes com as demais telas (Vendas, Catálogo, Estoque).
 */

import { DataTable, type Column } from '@/components/ui/DataTable'

export type VendaStatus = 'CONCLUIDA' | 'CANCELADA'

export type RecentOrderRow = {
  id: string
  operador: string
  /** Valor formatado para exibição (BRL). */
  valor: string
  /** Valor numérico bruto — usado apenas para ordenação. */
  valorRaw: number
  status: VendaStatus
  /** Data formatada para exibição. */
  data: string
  /** Timestamp ISO bruto — usado apenas para ordenação. */
  dataRaw: string
  formaPagamento: string
}

export type RecentOrdersLabels = {
  colId: string
  colOperador: string
  colData: string
  colValor: string
  colPagamento: string
  colStatus: string
  statusDone: string
  statusCancelled: string
  empty: string
}

function StatusCell({ status, labels }: { status: VendaStatus; labels: RecentOrdersLabels }) {
  const done = status === 'CONCLUIDA'
  const pillClass = done ? 'admin-v2-badge-success' : 'admin-v2-badge-danger'
  const dotClass = done ? 'bg-emerald-400' : 'bg-red-400'
  const label = done ? labels.statusDone : labels.statusCancelled
  return (
    <span
      className={`${pillClass} inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[11px] font-medium leading-none`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
      {label}
    </span>
  )
}

function buildColumns(labels: RecentOrdersLabels): Column<RecentOrderRow>[] {
  return [
    {
      key: 'id',
      header: labels.colId,
      sortValue: (r) => r.id,
      cell: (r) => (
        <span className="block max-w-[120px] truncate font-medium text-jl-fg-1" title={r.id}>
          {r.id}
        </span>
      ),
    },
    {
      key: 'operador',
      header: labels.colOperador,
      sortValue: (r) => r.operador,
      cell: (r) => (
        <span className="block max-w-[160px] truncate text-jl-fg-2" title={r.operador}>
          {r.operador}
        </span>
      ),
    },
    {
      key: 'data',
      header: labels.colData,
      sortValue: (r) => r.dataRaw,
      cell: (r) => <span className="whitespace-nowrap text-jl-fg-2">{r.data}</span>,
    },
    {
      key: 'valor',
      header: labels.colValor,
      align: 'right',
      sortValue: (r) => r.valorRaw,
      cell: (r) => <span className="font-medium text-jl-fg-1">{r.valor}</span>,
    },
    {
      key: 'pagamento',
      header: labels.colPagamento,
      sortValue: (r) => r.formaPagamento,
      cell: (r) => (
        <span className="block max-w-[140px] truncate text-jl-fg-2" title={r.formaPagamento}>
          {r.formaPagamento}
        </span>
      ),
    },
    {
      key: 'status',
      header: labels.colStatus,
      align: 'center',
      sortValue: (r) => r.status,
      cell: (r) => <StatusCell status={r.status} labels={labels} />,
    },
  ]
}

export function RecentOrdersTable({
  orders,
  labels,
}: {
  orders: RecentOrderRow[]
  labels: RecentOrdersLabels
}) {
  return (
    <DataTable
      data={orders}
      columns={buildColumns(labels)}
      rowKey={(r) => r.id}
      emptyState={<p className="font-medium text-jl-fg-3">{labels.empty}</p>}
    />
  )
}
