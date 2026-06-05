'use client'

import { useState } from 'react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatBRL } from '@/lib/format/money'

type ContaPagarRow = {
  id: string
  fornecedor_nome: string
  descricao: string
  valor_total: number
  valor_pago: number
  valor_aberto: number
  status: string
  vencimento: string | null
}

type Props = {
  dados: {
    rows: Array<Record<string, unknown>>
    total: number
    capped: boolean
  }
}

export function ContasPagarContent({ dados }: Props) {
  const [rows] = useState<ContaPagarRow[]>(
    dados.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      fornecedor_nome: r.fornecedor_nome ?? '—',
      descricao: r.descricao,
      valor_total: r.valor_total,
      valor_pago: r.valor_total - r.valor_aberto,
      valor_aberto: r.valor_aberto,
      status: r.status,
      vencimento: r.vencimento,
    }))
  )

  const columns: Column<ContaPagarRow>[] = [
    {
      key: 'fornecedor',
      header: 'Fornecedor',
      sortValue: (r) => r.fornecedor_nome,
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium text-zinc-200">{r.fornecedor_nome}</p>
          <p className="text-[11px] text-zinc-500">{r.descricao.slice(0, 40)}</p>
        </div>
      ),
    },
    {
      key: 'vencimento',
      header: 'Vencimento',
      sortValue: (r) => r.vencimento ?? '9999-12-31',
      cell: (r) => (
        <span className="text-[12px] text-zinc-400">
          {r.vencimento ? new Date(r.vencimento).toLocaleDateString('pt-BR') : '—'}
        </span>
      ),
    },
    {
      key: 'valor',
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
      cell: (r) => <span className="text-[12px] text-green-400">{formatBRL(r.valor_pago)}</span>,
    },
    {
      key: 'aberto',
      header: 'Aberto',
      align: 'right',
      sortValue: (r) => r.valor_aberto,
      cell: (r) => <span className="text-[12px] text-amber-400">{formatBRL(r.valor_aberto)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <span
          className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium"
          style={{
            background:
              r.status === 'PAGA' ? 'var(--fp-success-bg)' : r.status === 'PARCIAL' ? 'var(--fp-info-bg)' : 'var(--fp-warning-bg)',
            color:
              r.status === 'PAGA' ? 'var(--fp-success)' : r.status === 'PARCIAL' ? 'var(--fp-info)' : 'var(--fp-warning)',
          }}
        >
          {r.status === 'PAGA' ? 'Paga' : r.status === 'PARCIAL' ? 'Parcial' : 'Aberta'}
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col">
      {/* Cabeçalho com contador */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <span className="text-[13px] font-medium text-zinc-300">
          Contas a Pagar ({dados.total})
        </span>
        {dados.capped && (
          <span className="text-[11px] text-amber-400">
            ⚠️ Limitado a 200 itens
          </span>
        )}
      </div>

      {/* Tabela */}
      <DataTable
        data={rows}
        columns={columns}
        rowKey={(r) => r.id}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="text-3xl text-zinc-700" aria-hidden>
              📋
            </span>
            <p className="text-[12px] text-zinc-500">Nenhuma conta a pagar</p>
          </div>
        }
        className="rounded-none border-x-0"
      />
    </div>
  )
}
