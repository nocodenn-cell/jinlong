'use client'

import { useState } from 'react'
import { ArrowDownToLine } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatBRL } from '@/lib/format/money'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { cn } from '@/lib/utils'
import { BaixaTituloModal } from './BaixaTituloModal'

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

function StatusPill({ status, labels }: { status: string; labels: ContasLabels }) {
  const isAberto = String(status).toUpperCase() === 'ABERTO'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-[2px] text-[11px] font-medium leading-none',
        isAberto ? 'admin-v2-badge-warning' : 'admin-v2-badge-gold',
      )}
    >
      {isAberto ? labels.statusAberto : labels.statusParcial}
    </span>
  )
}

export function ContasReceberTable({ contas, labels }: { contas: ContaLinha[]; labels: ContasLabels }) {
  const [alvo, setAlvo] = useState<ContaLinha | null>(null)

  const columns: Column<ContaLinha>[] = [
    {
      key: 'cliente',
      header: labels.colCliente,
      sortValue: (r) => r.cliente_nome,
      cell: (r) => (
        <div className="min-w-0">
          <p className="max-w-[240px] truncate text-[12px] font-medium text-jl-fg-1">{r.cliente_nome}</p>
          {r.descricao ? <p className="max-w-[240px] truncate text-[10px] text-jl-fg-3">{r.descricao}</p> : null}
        </div>
      ),
    },
    {
      key: 'vencimento',
      header: labels.colVencimento,
      sortValue: (r) => r.vencimento ?? '',
      cell: (r) => (
        <span className="whitespace-nowrap text-[12px] text-jl-fg-2">
          {formatDateTimeOrDash(r.vencimento, labels.locale, 'short')}
        </span>
      ),
    },
    {
      key: 'total',
      header: labels.colTotal,
      align: 'right',
      sortValue: (r) => r.valor_total,
      cell: (r) => <span className="text-[12px] font-medium text-jl-fg-1">{formatBRL(r.valor_total)}</span>,
    },
    {
      key: 'pago',
      header: labels.colPago,
      align: 'right',
      sortValue: (r) => r.valor_pago,
      cell: (r) =>
        r.valor_pago > 0 ? (
          <span className="text-[12px] font-medium text-emerald-400">{formatBRL(r.valor_pago)}</span>
        ) : (
          <span className="text-[12px] text-jl-fg-3">—</span>
        ),
    },
    {
      key: 'aberto',
      header: labels.colAberto,
      align: 'right',
      sortValue: (r) => r.valor_aberto,
      cell: (r) =>
        r.valor_aberto > 0 ? (
          <span className="text-[12px] font-medium text-red-400">{formatBRL(r.valor_aberto)}</span>
        ) : (
          <span className="text-[12px] text-emerald-400">{labels.statusQuitado}</span>
        ),
    },
    {
      key: 'status',
      header: labels.colStatus,
      align: 'center',
      cell: (r) => <StatusPill status={r.status} labels={labels} />,
    },
  ]

  return (
    <>
      <DataTable
        data={contas}
        columns={columns}
        rowKey={(r) => r.id}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="text-4xl text-jl-fg-3" aria-hidden>📋</span>
            <p className="text-[14px] font-medium text-jl-fg-2">{labels.vazioTitulo}</p>
            <p className="text-[12px] text-jl-fg-3">{labels.vazioSub}</p>
          </div>
        }
        className="rounded-none border-x-0 border-b-0"
        rowActions={(row) =>
          row.valor_aberto > 0 ? (
            <div className="flex items-center justify-end">
              <button
                type="button"
                aria-label="Receber título"
                title="Receber título"
                onClick={(e) => {
                  e.stopPropagation()
                  setAlvo(row)
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-emerald-400 transition-colors hover:bg-emerald-400/10"
              >
                <ArrowDownToLine size={13} aria-hidden />
              </button>
            </div>
          ) : null
        }
      />
      <BaixaTituloModal alvo={alvo} onClose={() => setAlvo(null)} />
    </>
  )
}
