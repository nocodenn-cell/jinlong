'use client'

import { useState } from 'react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatBRL } from '@/lib/format/money'

type CompraRow = {
  id: string
  numero: string
  fornecedor_nome: string
  valor_total: number
  status: string
  data_criacao: string
}

type Props = {
  dados: {
    rows: Array<Record<string, unknown>>
    total: number
  }
}

export function ComprasContent({ dados }: Props) {
  const [rows] = useState<CompraRow[]>(
    dados.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      numero: r.numero ?? '—',
      fornecedor_nome: r.fornecedor_nome ?? '—',
      valor_total: r.valor_total ?? 0,
      status: r.status ?? 'pendente',
      data_criacao: r.data_criacao,
    }))
  )

  const columns: Column<CompraRow>[] = [
    {
      key: 'numero',
      header: 'Número',
      sortValue: (r) => r.numero,
      cell: (r) => <span className="font-medium text-zinc-200">{r.numero}</span>,
    },
    {
      key: 'fornecedor',
      header: 'Fornecedor',
      sortValue: (r) => r.fornecedor_nome,
      cell: (r) => <span className="text-[12px] text-zinc-300">{r.fornecedor_nome}</span>,
    },
    {
      key: 'data',
      header: 'Data',
      sortValue: (r) => r.data_criacao,
      cell: (r) => (
        <span className="text-[12px] text-zinc-400">
          {new Date(r.data_criacao).toLocaleDateString('pt-BR')}
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
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <span
          className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium"
          style={{
            background: r.status === 'recebida' ? 'var(--fp-success-bg)' : 'var(--fp-warning-bg)',
            color: r.status === 'recebida' ? 'var(--fp-success)' : 'var(--fp-warning)',
          }}
        >
          {r.status === 'recebida' ? 'Recebida' : 'Pendente'}
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col">
      {/* Cabeçalho com contador */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <span className="text-[13px] font-medium text-zinc-300">
          Compras ({dados.total})
        </span>
      </div>

      {/* Tabela */}
      <DataTable
        data={rows}
        columns={columns}
        rowKey={(r) => r.id}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="text-3xl text-zinc-700" aria-hidden>
              📦
            </span>
            <p className="text-[12px] text-zinc-500">Nenhuma compra encontrada</p>
          </div>
        }
        className="rounded-none border-x-0"
      />
    </div>
  )
}
