'use client'

import { useState } from 'react'
import { ArrowUpFromLine } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatBRL } from '@/lib/format/money'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { cn } from '@/lib/utils'
import { PagarContaModal } from './PagarContaModal'

export type ContaPagarLinha = {
  id: string
  fornecedor_nome: string | null
  fornecedor_id: string
  descricao: string | null
  nfe_numero: string | null
  vencimento: string
  valor_total: number
  valor_pago: number
  status: string
}

function StatusPill({ status }: { status: string }) {
  const up = status.toUpperCase()
  const cls =
    up === 'PENDENTE'
      ? 'admin-v2-badge-warning'
      : up === 'PARCIAL'
        ? 'admin-v2-badge-gold'
        : 'admin-v2-badge-muted'
  const label =
    up === 'PENDENTE' ? 'Pendente' : up === 'PARCIAL' ? 'Parcial' : up === 'PAGO' ? 'Pago' : status
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-[2px] text-[11px] font-medium leading-none',
        cls,
      )}
    >
      {label}
    </span>
  )
}

export function ContasPagarTable({
  contas,
  locale,
}: {
  contas: ContaPagarLinha[]
  locale: string
}) {
  const [alvo, setAlvo] = useState<ContaPagarLinha | null>(null)

  const columns: Column<ContaPagarLinha>[] = [
    {
      key: 'fornecedor',
      header: 'Fornecedor',
      sortValue: (r) => r.fornecedor_nome ?? '',
      cell: (r) => (
        <div className="min-w-0">
          <p className="max-w-[200px] truncate text-[12px] font-medium text-jl-fg-1">
            {r.fornecedor_nome ?? '—'}
          </p>
          {r.nfe_numero ? (
            <p className="text-[10px] text-jl-fg-3">NF {r.nfe_numero}</p>
          ) : r.descricao ? (
            <p className="max-w-[200px] truncate text-[10px] text-jl-fg-3">{r.descricao}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'vencimento',
      header: 'Vencimento',
      sortValue: (r) => r.vencimento,
      cell: (r) => (
        <span className="whitespace-nowrap text-[12px] text-jl-fg-2">
          {formatDateTimeOrDash(r.vencimento, locale, 'short')}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortValue: (r) => r.valor_total,
      cell: (r) => (
        <span className="text-[12px] font-medium text-jl-fg-1">{formatBRL(r.valor_total)}</span>
      ),
    },
    {
      key: 'pago',
      header: 'Pago',
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
      header: 'Em aberto',
      align: 'right',
      sortValue: (r) => r.valor_total - r.valor_pago,
      cell: (r) => {
        const aberto = r.valor_total - r.valor_pago
        return aberto > 0.005 ? (
          <span className="text-[12px] font-medium text-red-400">{formatBRL(aberto)}</span>
        ) : (
          <span className="text-[12px] text-emerald-400">Quitado</span>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      cell: (r) => <StatusPill status={r.status} />,
    },
  ]

  const isPendente = (r: ContaPagarLinha) =>
    r.status.toUpperCase() === 'PENDENTE' || r.status.toUpperCase() === 'PARCIAL'

  return (
    <>
      <DataTable
        data={contas}
        columns={columns}
        rowKey={(r) => r.id}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="text-4xl text-jl-fg-3" aria-hidden>📤</span>
            <p className="text-[14px] font-medium text-jl-fg-2">Nenhuma conta a pagar</p>
            <p className="text-[12px] text-jl-fg-3">
              Contas a pagar pendentes e parciais aparecerão aqui.
            </p>
          </div>
        }
        className="rounded-none border-x-0 border-b-0"
        rowActions={(row) =>
          isPendente(row) ? (
            <div className="flex items-center justify-end">
              <button
                type="button"
                aria-label="Pagar conta"
                title="Pagar conta"
                onClick={(e) => {
                  e.stopPropagation()
                  setAlvo(row)
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-amber-400 transition-colors hover:bg-amber-400/10"
              >
                <ArrowUpFromLine size={13} aria-hidden />
              </button>
            </div>
          ) : null
        }
      />
      <PagarContaModal alvo={alvo} onClose={() => setAlvo(null)} />
    </>
  )
}
