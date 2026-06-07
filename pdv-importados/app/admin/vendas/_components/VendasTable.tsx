'use client'

/**
 * FastProduct Admin — VendasTable (Fase 5)
 *
 * Tabela de vendas. Usa o DataTable genérico (Fase 2). A PAGINAÇÃO é server-side
 * por CURSOR (a action de origem só expõe `hasMore`, sem total) — resolvida no
 * page.tsx via ?page=; esta tabela só renderiza a página atual e o sort dos
 * headers ordena a página corrente (client-side).
 */

import { useState } from 'react'
import { Eye } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge, PaymentBadge } from '@/components/ui/badges'
import { formatBRL } from '@/lib/format/money'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { VendaDetailSheet, type VendaAlvo } from './VendaDetailSheet'
import { toPayment, toVendaStatus } from './vendaMaps'

export type VendaLinha = {
  id: string
  data: string | null
  total_liquido: number | null
  forma_pagamento: string | null
  status: string | null
  qtd_itens_total: number
  qtd_itens_distintos: number
  primeiro_produto: string | null
}

function StatusCell({ status }: { status: string | null }) {
  const s = toVendaStatus(status)
  if (s) return <StatusBadge status={s} />
  if (status) {
    return (
      <span className="admin-v2-badge-muted inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium leading-none">
        {status}
      </span>
    )
  }
  return <span className="text-jl-fg-3">—</span>
}

function ItensCell({ row }: { row: VendaLinha }) {
  const extras = row.qtd_itens_distintos - 1
  return (
    <div className="min-w-0">
      <p className="max-w-[260px] truncate text-[12px] text-jl-fg-1">{row.primeiro_produto ?? '—'}</p>
      <p className="text-[10px] text-jl-fg-3">
        {row.qtd_itens_total} {row.qtd_itens_total === 1 ? 'unidade' : 'unidades'}
        {extras > 0 ? ` · +${extras} ${extras === 1 ? 'item' : 'itens'}` : ''}
      </p>
    </div>
  )
}

function ActionBtn({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-jl-fg-3 transition-colors hover:bg-[#161616] hover:text-jl-fg-1"
    >
      {children}
    </button>
  )
}

function VendasEmpty() {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <span className="text-4xl text-jl-fg-3" aria-hidden>
        🧾
      </span>
      <p className="text-[14px] font-medium text-jl-fg-2">Nenhuma venda encontrada</p>
      <p className="text-[12px] text-jl-fg-3">Ajuste o período, o status ou a forma de pagamento.</p>
    </div>
  )
}

export function VendasTable({ vendas }: { vendas: VendaLinha[] }) {
  const [alvo, setAlvo] = useState<VendaAlvo | null>(null)

  const columns: Column<VendaLinha>[] = [
    {
      key: 'data',
      header: 'Data',
      sortValue: (r) => r.data ?? '',
      cell: (r) => (
        <span className="whitespace-nowrap text-[12px] text-jl-fg-2">
          {formatDateTimeOrDash(r.data, 'pt-BR', 'short')}
        </span>
      ),
    },
    {
      key: 'itens',
      header: 'Itens',
      cell: (r) => <ItensCell row={r} />,
    },
    {
      key: 'pagamento',
      header: 'Pagamento',
      cell: (r) => <PaymentBadge payment={toPayment(r.forma_pagamento)} />,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      cell: (r) => <StatusCell status={r.status} />,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortValue: (r) => r.total_liquido ?? 0,
      cell: (r) =>
        r.total_liquido == null ? (
          <span className="text-jl-fg-3">—</span>
        ) : (
          <span className="text-[12px] font-medium text-jl-fg-1">{formatBRL(r.total_liquido)}</span>
        ),
    },
  ]

  return (
    <>
      <DataTable
        data={vendas}
        columns={columns}
        rowKey={(r) => r.id}
        emptyState={<VendasEmpty />}
        className="rounded-none border-x-0 border-b-0"
        onRowClick={(r) => setAlvo({ id: r.id })}
        rowActions={(row) => (
          <div className="flex items-center justify-end gap-1">
            <ActionBtn label={`Ver detalhe da venda ${row.id.slice(0, 8)}`} onClick={() => setAlvo({ id: row.id })}>
              <Eye size={13} aria-hidden />
            </ActionBtn>
          </div>
        )}
      />

      <VendaDetailSheet alvo={alvo} onClose={() => setAlvo(null)} />
    </>
  )
}
