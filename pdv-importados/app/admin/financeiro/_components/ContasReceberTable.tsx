'use client'

/**
 * FastProduct Admin — ContasReceberTable (Fase 6)
 *
 * Tabela de contas a receber. Usa o DataTable genérico (Fase 2). A LISTAGEM é
 * server-side (limitada em `limite`); esta tabela só renderiza os dados que
 * chegam, e o sort dos headers ordena localmente (client-side).
 */

import Link from 'next/link'
import { Receipt } from 'lucide-react'
import { adminVendaDetalheQuery } from '@/lib/navigation/routes'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatBRL } from '@/lib/format/money'
import { formatarDataCivilNumerica } from '@/lib/relatorios/periodoRelatorio'
import { cn } from '@/lib/utils'

export type ContaLinha = {
  id: string
  cliente_nome: string
  valor_total: number
  valor_aberto: number
  valor_pago: number
  status: string
  vencimento: string | null
  descricao: string | null
  loja_id: string
  /** Venda de origem (fiado gerado na finalização), quando houver. */
  venda_id: string | null
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
  verVenda: string
  locale: string
  receber?: string
}

function StatusPill({ status, labels }: { status: string; labels: ContasLabels }) {
  const isAberto = String(status).toUpperCase() === 'ABERTO'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-[2px] text-caption font-medium leading-none',
        isAberto ? 'admin-v2-badge-warning' : 'admin-v2-badge-gold',
      )}
    >
      {isAberto ? labels.statusAberto : labels.statusParcial}
    </span>
  )
}

export function ContasReceberTable({ contas, labels }: { contas: ContaLinha[]; labels: ContasLabels }) {
  const columns: Column<ContaLinha>[] = [
    {
      key: 'cliente',
      header: labels.colCliente,
      sortValue: (r) => r.cliente_nome,
      cell: (r) => (
        <div className="min-w-0">
          <p className="max-w-[240px] truncate text-small font-medium text-jl-fg-1">{r.cliente_nome}</p>
          {r.descricao ? <p className="max-w-[240px] truncate text-caption text-jl-fg-3">{r.descricao}</p> : null}
          {r.venda_id ? (
            <Link
              href={adminVendaDetalheQuery(r.venda_id)}
              onClick={(e) => e.stopPropagation()}
              className="mt-0.5 inline-flex items-center gap-1 text-caption text-[var(--color-info)] hover:underline"
            >
              <Receipt size={11} aria-hidden />
              {labels.verVenda}
            </Link>
          ) : null}
        </div>
      ),
    },
    {
      key: 'vencimento',
      header: labels.colVencimento,
      sortValue: (r) => r.vencimento ?? '',
      cell: (r) => (
        <span className="whitespace-nowrap text-small text-jl-fg-2">
          {formatarDataCivilNumerica(r.vencimento, labels.locale)}
        </span>
      ),
    },
    {
      key: 'total',
      header: labels.colTotal,
      align: 'right',
      sortValue: (r) => r.valor_total,
      cell: (r) => <span className="text-small font-medium text-jl-fg-1">{formatBRL(r.valor_total)}</span>,
    },
    {
      key: 'pago',
      header: labels.colPago,
      align: 'right',
      sortValue: (r) => r.valor_pago,
      cell: (r) =>
        r.valor_pago > 0 ? (
          <span className="text-small font-medium text-emerald-400">{formatBRL(r.valor_pago)}</span>
        ) : (
          <span className="text-small text-jl-fg-3">—</span>
        ),
    },
    {
      key: 'aberto',
      header: labels.colAberto,
      align: 'right',
      sortValue: (r) => r.valor_aberto,
      cell: (r) =>
        r.valor_aberto > 0 ? (
          <span className="text-small font-medium text-red-400">{formatBRL(r.valor_aberto)}</span>
        ) : (
          <span className="text-small text-emerald-400">{labels.statusQuitado}</span>
        ),
    },
    {
      key: 'status',
      header: labels.colStatus,
      align: 'center',
      cell: (r) => <StatusPill status={r.status} labels={labels} />,
    },
    {
      key: 'acoes',
      header: labels.receber ?? 'Receber',
      align: 'right',
      cell: (r) =>
        r.valor_aberto > 0 ? (
          <a
            href="#baixa-conta-financeira"
            className="admin-v2-btn-secondary inline-flex min-h-10 items-center px-3 text-small font-semibold"
            onClick={(e) => e.stopPropagation()}
          >
            {labels.receber ?? 'Receber'}
          </a>
        ) : null,
    },
  ]

  return (
    <DataTable
      data={contas}
      columns={columns}
      rowKey={(r) => r.id}
      emptyState={
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <span className="text-4xl text-jl-fg-3" aria-hidden>📋</span>
          <p className="text-body font-medium text-jl-fg-2">{labels.vazioTitulo}</p>
          <p className="text-small text-jl-fg-3">{labels.vazioSub}</p>
        </div>
      }
      className="rounded-none border-x-0 border-b-0"
    />
  )
}
