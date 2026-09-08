'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { StatusChip } from '@/components/ui/StatusChip'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState, ErrorState } from '@/components/ui/feedback'
import { ROUTES } from '@shared-core/navigation/routes'
import { shortOrderId } from '../dashboardUtils'

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
  emptyDescription?: string
  loadFailed: string
  openOrdersAria: string
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
  return <StatusChip status={status} label={label} />
}

/**
 * Tabela de pedidos recentes — DataTable canônica (substitui &lt;table&gt; raw).
 */
export function DashboardOrdersTable({ orders, labels, loadFailed }: Props) {
  const router = useRouter()

  if (loadFailed) {
    return <ErrorState title={labels.loadFailed} description={labels.loadFailed} />
  }

  const columns: Column<DashboardOrderRow>[] = [
    {
      key: 'id',
      header: labels.colId,
      priority: 'contextual',
      cell: (row) => (
        <Link
          href={ROUTES.admin.vendas}
          className="max-w-[120px] truncate font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
          title={row.id}
          aria-label={`${labels.openOrdersAria}: ${row.id}`}
          onClick={(event) => event.stopPropagation()}
        >
          {shortOrderId(row.id)}
        </Link>
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
      onRowClick={() => router.push(ROUTES.admin.vendas)}
      emptyState={
        <EmptyState title={labels.empty} description={labels.emptyDescription} />
      }
    />
  )
}
