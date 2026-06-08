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
import { formatBRL } from '@/lib/format/money'
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

function statusDotTone(status: string | null): 'success' | 'danger' | 'muted' {
  const up = String(status ?? '').trim().toUpperCase()
  if (up === 'CONCLUIDA') return 'success'
  if (up === 'CANCELADA') return 'danger'
  return 'muted'
}

function paymentLabel(formaPagamento: string | null): string {
  const payment = toPayment(formaPagamento)
  if (payment === 'DINHEIRO') return 'DINHEIRO'
  if (payment === 'PIX') return 'PIX'
  if (payment === 'CREDITO') return 'CRÉDITO'
  if (payment === 'DEBITO') return 'DÉBITO'
  if (payment === 'CARTAO') return 'CARTÃO'
  return 'OUTRO'
}

function StatusCell({ status }: { status: string | null }) {
  const s = toVendaStatus(status)
  const tone = statusDotTone(status)
  const dotClass =
    tone === 'success'
      ? 'bg-emerald-400'
      : tone === 'danger'
        ? 'bg-red-400'
        : 'bg-jl-fg-3'
  if (s) {
    const label = s === 'CONCLUIDA' ? 'Concluída' : s === 'CANCELADA' ? 'Cancelada' : s
    const pillClass =
      tone === 'success'
        ? 'admin-v2-badge-success'
        : tone === 'danger'
          ? 'admin-v2-badge-danger'
          : 'admin-v2-badge-muted'
    return (
      <span className={`${pillClass} inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[11px] font-medium leading-none`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
        {label}
      </span>
    )
  }
  if (status) {
    return (
      <span className="admin-v2-badge-muted inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[11px] font-medium leading-none">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
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

function HoraCell({ data }: { data: string | null }) {
  if (!data) return <span className="text-jl-fg-3">—</span>
  const d = new Date(data)
  if (Number.isNaN(d.getTime())) return <span className="text-jl-fg-3">—</span>
  return (
    <span className="whitespace-nowrap text-[12px] text-jl-fg-2">
      {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
    </span>
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
      key: 'venda',
      header: 'Venda',
      sortValue: (r) => r.id,
      cell: (r) => (
        <span className="max-w-[120px] truncate font-medium text-jl-fg-1" title={r.id}>
          {r.id}
        </span>
      ),
    },
    {
      key: 'hora',
      header: 'Hora',
      sortValue: (r) => r.data ?? '',
      cell: (r) => <HoraCell data={r.data} />,
    },
    {
      key: 'itens',
      header: 'Itens',
      cell: (r) => <ItensCell row={r} />,
    },
    {
      key: 'pagamento',
      header: 'Pagamento',
      cell: (r) => <span className="text-[12px] text-jl-fg-2">{paymentLabel(r.forma_pagamento)}</span>,
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
    {
      key: 'caixa',
      header: 'Caixa (01)',
      align: 'center',
      cell: () => <span className="text-[12px] text-jl-fg-2">01</span>,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      cell: (r) => <StatusCell status={r.status} />,
    },
    {
      key: 'vendedor',
      header: 'Vendedor (—)',
      cell: () => <span className="text-[12px] text-jl-fg-3">—</span>,
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
