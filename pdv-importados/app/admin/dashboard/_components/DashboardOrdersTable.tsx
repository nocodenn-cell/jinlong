'use client'

import { Badge } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState, ErrorState } from '@/components/ui/feedback'

export type DashboardOrderRow = {
  id: string
  operador: string
  valor: string
  status: 'CONCLUIDA' | 'CANCELADA'
  data: string
  formaPagamento: string
}

type Labels = {
  colId: string
  colOperador: string
  colData: string
  colValor: string
  colPagamento: string
  colStatus: string
  statusDone: string
  statusCancelled: string
  empty: string
  loadFailed: string
}

type Props = {
  orders: DashboardOrderRow[]
  labels: Labels
  loadFailed: boolean
}

function statusBadge(
  status: DashboardOrderRow['status'],
  labels: Pick<Labels, 'statusDone' | 'statusCancelled'>,
) {
  const label = status === 'CONCLUIDA' ? labels.statusDone : labels.statusCancelled
  const className =
    status === 'CONCLUIDA'
      ? 'border border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-strong)]'
      : 'border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-strong)]'
  return <Badge className={className}>{label}</Badge>
}

/**
 * Tabela de pedidos recentes — DataTable canônica (substitui &lt;table&gt; raw).
 */
export function DashboardOrdersTable({ orders, labels, loadFailed }: Props) {
  if (loadFailed) {
    return <ErrorState title={labels.loadFailed} description={labels.loadFailed} />
  }

  const columns: Column<DashboardOrderRow>[] = [
    {
      key: 'id',
      header: labels.colId,
      priority: 'contextual',
      cell: (row) => (
        <span className="max-w-[120px] truncate font-medium text-fg" title={row.id}>
          {row.id}
        </span>
      ),
    },
    {
      key: 'operador',
      header: labels.colOperador,
      priority: 'primary',
      cell: (row) => (
        <span className="max-w-[160px] truncate" title={row.operador}>
          {row.operador}
        </span>
      ),
    },
    {
      key: 'data',
      header: labels.colData,
      cell: (row) => row.data,
    },
    {
      key: 'valor',
      header: labels.colValor,
      align: 'right',
      priority: 'primary',
      cell: (row) => row.valor,
    },
    {
      key: 'pagamento',
      header: labels.colPagamento,
      cell: (row) => (
        <span className="max-w-[140px] truncate" title={row.formaPagamento}>
          {row.formaPagamento}
        </span>
      ),
    },
    {
      key: 'status',
      header: labels.colStatus,
      cell: (row) =>
        statusBadge(row.status, {
          statusDone: labels.statusDone,
          statusCancelled: labels.statusCancelled,
        }),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={orders}
      rowKey={(row) => row.id}
      emptyState={<EmptyState title={labels.empty} />}
    />
  )
}
