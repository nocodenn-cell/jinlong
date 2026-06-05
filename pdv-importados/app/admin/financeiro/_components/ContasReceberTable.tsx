'use client'

/**
 * FastProduct Admin — ContasReceberTable (Fase 6)
 *
 * Tabela de contas a receber. Usa o DataTable genérico (Fase 2). A LISTAGEM é
 * server-side (limitada em `limite`); esta tabela só renderiza os dados que
 * chegam, e o sort dos headers ordena localmente (client-side).
 *
 * Status ABERTO/PARCIAL em badges; valor aberto em cores (vermelho se aberto,
 * verde se pago).
 */

import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatBRL } from '@/lib/format/money'
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

function StatusPill({ status }: { status: string }) {
  const isAberto = String(status).toUpperCase() === 'ABERTO'
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium leading-none"
      style={
        isAberto
          ? {
              background: 'var(--fp-warning-bg)',
              border: '1px solid var(--fp-warning-border)',
              color: 'var(--fp-warning)',
            }
          : {
              background: 'var(--fp-info-bg)',
              border: '1px solid var(--fp-info-border)',
              color: 'var(--fp-info)',
            }
      }
    >
      {isAberto ? 'Aberto' : 'Parcial'}
    </span>
  )
}

function ContasEmpty() {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <span className="text-4xl text-zinc-700" aria-hidden>
        📋
      </span>
      <p className="text-[14px] font-medium text-zinc-400">Nenhuma conta encontrada</p>
      <p className="text-[12px] text-zinc-600">Ajuste o período, o status ou a busca.</p>
    </div>
  )
}

export function ContasReceberTable({ contas }: { contas: ContaLinha[] }) {
  const columns: Column<ContaLinha>[] = [
    {
      key: 'cliente',
      header: 'Cliente',
      sortValue: (r) => r.cliente_nome,
      cell: (r) => (
        <div className="min-w-0">
          <p className="max-w-[240px] truncate text-[12px] font-medium text-zinc-200">{r.cliente_nome}</p>
          {r.descricao ? <p className="max-w-[240px] truncate text-[10px] text-zinc-600">{r.descricao}</p> : null}
        </div>
      ),
    },
    {
      key: 'vencimento',
      header: 'Vencimento',
      sortValue: (r) => r.vencimento ?? '',
      cell: (r) => (
        <span className="whitespace-nowrap text-[12px] text-zinc-300">
          {formatDateTimeOrDash(r.vencimento, 'pt-BR', 'short')}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortValue: (r) => r.valor_total,
      cell: (r) => <span className="text-[12px] font-medium text-zinc-200">{formatBRL(r.valor_total)}</span>,
    },
    {
      key: 'pago',
      header: 'Pago',
      align: 'right',
      sortValue: (r) => r.valor_pago,
      cell: (r) =>
        r.valor_pago > 0 ? (
          <span className="text-[12px] font-medium text-green-400">{formatBRL(r.valor_pago)}</span>
        ) : (
          <span className="text-[12px] text-zinc-700">—</span>
        ),
    },
    {
      key: 'aberto',
      header: 'Aberto',
      align: 'right',
      sortValue: (r) => r.valor_aberto,
      cell: (r) =>
        r.valor_aberto > 0 ? (
          <span className="text-[12px] font-medium text-red-400">{formatBRL(r.valor_aberto)}</span>
        ) : (
          <span className="text-[12px] text-green-400">Quitado</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      cell: (r) => <StatusPill status={r.status} />,
    },
  ]

  return (
    <DataTable
      data={contas}
      columns={columns}
      rowKey={(r) => r.id}
      emptyState={<ContasEmpty />}
      className="rounded-none border-x-0"
    />
  )
}
