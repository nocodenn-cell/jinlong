'use client'

/**
 * Contas a receber — EntityTable SSOT (Sprint 2 / RFC-UX-007).
 */

import { EntityTable, type EntityColumn } from '@/components/ui/EntityTable'
import { EmptyState } from '@/components/ui/feedback'
import { formatDateTimeOrDash } from '@/lib/format/datetime'

export type ContaLinha = {
  id: string
  cliente_nome: string
  valor_total: number
  valor_aberto: number
  valor_pago: number
  status: string
  vencimento: string | null
  descricao: string | null
}

export type ContasLabels = {
  colCliente: string
  colVencimento: string
  colTotal: string
  colPago: string
  colAberto: string
  colStatus: string
  statusAberto: string
  statusParcial: string
  statusQuitado: string
  vazioTitulo: string
  vazioSub: string
  locale: string
}

function statusLabel(status: string, labels: ContasLabels): string {
  const s = String(status).toUpperCase()
  if (s === 'ABERTO') return labels.statusAberto
  if (s === 'QUITADO' || s === 'PAGO') return labels.statusQuitado
  return labels.statusParcial
}

export function ContasReceberTable({ contas, labels }: { contas: ContaLinha[]; labels: ContasLabels }) {
  const columns: EntityColumn<ContaLinha>[] = [
    {
      key: 'cliente',
      header: labels.colCliente,
      sortValue: (r) => r.cliente_nome,
      cell: (r) => (
        <div className="min-w-0">
          <p className="max-w-[240px] truncate text-body font-medium text-fg">{r.cliente_nome}</p>
          {r.descricao ? (
            <p className="max-w-[240px] truncate text-caption text-fg-subtle">{r.descricao}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'vencimento',
      header: labels.colVencimento,
      sortValue: (r) => r.vencimento ?? '',
      cell: (r) => (
        <span className="whitespace-nowrap text-body text-fg-muted">
          {formatDateTimeOrDash(r.vencimento, labels.locale, 'short')}
        </span>
      ),
    },
    {
      key: 'total',
      header: labels.colTotal,
      money: (r) => r.valor_total,
      moneyLocale: labels.locale,
    },
    {
      key: 'pago',
      header: labels.colPago,
      money: (r) => r.valor_pago,
      moneyLocale: labels.locale,
    },
    {
      key: 'aberto',
      header: labels.colAberto,
      money: (r) => r.valor_aberto,
      moneyLocale: labels.locale,
    },
    {
      key: 'status',
      header: labels.colStatus,
      align: 'center',
      status: (r) => ({
        status: String(r.status).toUpperCase(),
        label: statusLabel(r.status, labels),
      }),
    },
  ]

  return (
    <EntityTable
      data={contas}
      columns={columns}
      rowKey={(r) => r.id}
      emptyState={<EmptyState title={labels.vazioTitulo} description={labels.vazioSub} />}
      className="rounded-none border-x-0 border-b-0"
    />
  )
}
