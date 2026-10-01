'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Ban, Receipt } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatBRL } from '@/lib/format/money'
import type { Mensagens } from '@/i18n/getMessages'
import { VendaCancelarModal } from '@/app/gerente/vendas/VendaCancelarModal'
import {
  VendaCancelamentoReciboModal,
  type ComprovanteCancelamento,
} from '@/app/gerente/vendas/VendaCancelamentoReciboModal'
import type { VendaListRow } from '@/app/gerente/vendas/actions'
import { VendaDetailSheet, type VendaAlvo } from './VendaDetailSheet'
import { toPayment, toVendaStatus } from './vendaMaps'

export type VendaLinha = {
  id: string
  data: string | null
  total_liquido: number | null
  total_bruto: number | null
  forma_pagamento: string | null
  status: string | null
  caixa_id: string | null
  operador_id: string | null
  qtd_itens_total: number
  qtd_itens_distintos: number
  primeiro_produto: string | null
  vendedor_nome: string | null
}

export type VendasLabels = {
  colVenda: string
  colHora: string
  colItens: string
  colPagamento: string
  colTotal: string
  colStatus: string
  colVendedor: string
  concluida: string
  cancelada: string
  unidade: string
  unidades: string
  item: string
  itensPl: string
  pagDinheiro: string
  pagPix: string
  pagCredito: string
  pagDebito: string
  pagCartao: string
  pagOutro: string
  vazioTitulo: string
  vazioSub: string
  detalheTitulo: string
  detalheErroTitulo: string
  detalheErroSub: string
  detalheData: string
  detalheTipo: string
  detalheOperador: string
  detalheNfe: string
  detalheCliente: string
  detalheSaldoAberto: string
  detalheVerFinanceiro: string
  detalheBruto: string
  detalheDesconto: string
  detalheLiquido: string
  detalheItens: string
  detalheNenhumItem: string
  cancelarAcao: string
  devolverAcao: string
}

function toVendaListRow(linha: VendaLinha): VendaListRow {
  return {
    id: linha.id,
    data: linha.data,
    total_liquido: linha.total_liquido,
    total_bruto: linha.total_bruto,
    forma_pagamento: linha.forma_pagamento,
    status: linha.status,
    caixa_id: linha.caixa_id,
    operador_id: linha.operador_id,
    qtd_itens_total: linha.qtd_itens_total,
    qtd_itens_distintos: linha.qtd_itens_distintos,
    primeiro_produto: linha.primeiro_produto,
  }
}

function statusDotTone(status: string | null): 'success' | 'danger' | 'muted' {
  const up = String(status ?? '').trim().toUpperCase()
  if (up === 'CONCLUIDA') return 'success'
  if (up === 'CANCELADA') return 'danger'
  return 'muted'
}

function StatusCell({ status, labels }: { status: string | null; labels: VendasLabels }) {
  const s = toVendaStatus(status)
  const tone = statusDotTone(status)
  const dotClass =
    tone === 'success'
      ? 'bg-emerald-400'
      : tone === 'danger'
        ? 'bg-red-400'
        : 'bg-jl-fg-3'
  if (s) {
    const label = s === 'CONCLUIDA' ? labels.concluida : s === 'CANCELADA' ? labels.cancelada : s
    const pillClass =
      tone === 'success'
        ? 'admin-v2-badge-success'
        : tone === 'danger'
          ? 'admin-v2-badge-danger'
          : 'admin-v2-badge-muted'
    return (
      <span className={`${pillClass} inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-caption font-medium leading-none`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
        {label}
      </span>
    )
  }
  if (status) {
    return (
      <span className="admin-v2-badge-muted inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-caption font-medium leading-none">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
        {status}
      </span>
    )
  }
  return <span className="text-jl-fg-3">—</span>
}

function paymentLabel(formaPagamento: string | null, labels: VendasLabels): string {
  const payment = toPayment(formaPagamento)
  if (payment === 'DINHEIRO') return labels.pagDinheiro
  if (payment === 'PIX') return labels.pagPix
  if (payment === 'CREDITO') return labels.pagCredito
  if (payment === 'DEBITO') return labels.pagDebito
  if (payment === 'CARTAO') return labels.pagCartao
  return labels.pagOutro
}

function ItensCell({ row, labels }: { row: VendaLinha; labels: VendasLabels }) {
  const extras = row.qtd_itens_distintos - 1
  return (
    <div className="min-w-0">
      <p className="max-w-[260px] truncate text-small text-jl-fg-1">{row.primeiro_produto ?? '—'}</p>
      <p className="text-caption text-jl-fg-3">
        {row.qtd_itens_total} {row.qtd_itens_total === 1 ? labels.unidade : labels.unidades}
        {extras > 0 ? ` · +${extras} ${extras === 1 ? labels.item : labels.itensPl}` : ''}
      </p>
    </div>
  )
}

const TZ = 'America/Sao_Paulo'

function HoraCell({ data, mostrarData }: { data: string | null; mostrarData: boolean }) {
  if (!data) return <span className="text-jl-fg-3">—</span>
  const d = new Date(data)
  if (Number.isNaN(d.getTime())) return <span className="text-jl-fg-3">—</span>
  return (
    <span className="whitespace-nowrap text-small text-jl-fg-2">
      {mostrarData
        ? `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TZ })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })}`
        : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })}
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
      className="flex h-7 w-7 items-center justify-center rounded-lg text-jl-fg-3 transition-colors hover:bg-jl-surface-elev hover:text-jl-fg-1"
    >
      {children}
    </button>
  )
}

export function VendasTable({
  vendas,
  labels,
  m,
  locale,
  vendaInicial = null,
  mostrarData = false,
  emptyActions = null,
}: {
  vendas: VendaLinha[]
  labels: VendasLabels
  m: Mensagens
  locale: string
  /** Deep-link (ex.: Relatórios) — abre o detalhe desta venda ao montar, mesmo fora da página/filtro atual. */
  vendaInicial?: string | null
  /** Períodos multi-dia: exibe dd/mm na coluna Hora. */
  mostrarData?: boolean
  /** Ações no estado vazio (limpar filtros, ampliar período). */
  emptyActions?: React.ReactNode
}) {
  const router = useRouter()
  const [alvo, setAlvo] = useState<VendaAlvo | null>(() => (vendaInicial ? { id: vendaInicial } : null))
  const [cancelarAlvo, setCancelarAlvo] = useState<VendaLinha | null>(null)
  const [comprovanteCancelamento, setComprovanteCancelamento] =
    useState<ComprovanteCancelamento | null>(null)

  const columns: Column<VendaLinha>[] = [
    {
      key: 'venda',
      header: labels.colVenda,
      sortValue: (r) => r.id,
      cell: (r) => (
        <span className="font-mono font-medium text-jl-fg-1" title={r.id}>
          #{r.id.replace(/-/g, '').slice(0, 6).toUpperCase()}
        </span>
      ),
    },
    {
      key: 'hora',
      header: labels.colHora,
      sortValue: (r) => r.data ?? '',
      cell: (r) => <HoraCell data={r.data} mostrarData={mostrarData} />,
    },
    {
      key: 'itens',
      header: labels.colItens,
      cell: (r) => <ItensCell row={r} labels={labels} />,
    },
    {
      key: 'pagamento',
      header: labels.colPagamento,
      cell: (r) => <span className="text-small text-jl-fg-2">{paymentLabel(r.forma_pagamento, labels)}</span>,
    },
    {
      key: 'total',
      header: labels.colTotal,
      align: 'right',
      sortValue: (r) => r.total_liquido ?? 0,
      cell: (r) =>
        r.total_liquido == null ? (
          <span className="text-jl-fg-3">—</span>
        ) : (
          <span className="text-small font-medium text-jl-fg-1">{formatBRL(r.total_liquido)}</span>
        ),
    },
    {
      key: 'status',
      header: labels.colStatus,
      align: 'center',
      cell: (r) => <StatusCell status={r.status} labels={labels} />,
    },
    {
      key: 'vendedor',
      header: labels.colVendedor,
      cell: (r) => <span className="text-small text-jl-fg-2">{r.vendedor_nome ?? '—'}</span>,
    },
  ]

  return (
    <>
      <DataTable
        data={vendas}
        columns={columns}
        // A listagem vem de `listar_vendas_gerente`: uma linha por VENDA (`vendas.id`) com o
        // status ATUAL. O ledger de eventos nao e mais a identidade da linha.
        rowKey={(r) => r.id}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Receipt size={36} className="text-jl-fg-3" aria-hidden />
            <p className="text-body font-medium text-jl-fg-2">{labels.vazioTitulo}</p>
            <p className="text-small text-jl-fg-3">{labels.vazioSub}</p>
            {emptyActions}
          </div>
        }
        className="rounded-none border-x-0 border-b-0"
        onRowClick={(r) => setAlvo({ id: r.id })}
        rowActions={(row) => (
          <div className="flex items-center justify-end gap-1">
            <ActionBtn label={`${labels.detalheTitulo} ${row.id.slice(0, 8)}`} onClick={() => setAlvo({ id: row.id })}>
              <Eye size={13} aria-hidden />
            </ActionBtn>
            {row.status === 'CONCLUIDA' ? (
              <ActionBtn label={`${labels.cancelarAcao} ${row.id.slice(0, 8)}`} onClick={() => setCancelarAlvo(row)}>
                <Ban size={13} aria-hidden />
              </ActionBtn>
            ) : null}
          </div>
        )}
      />

      <VendaCancelarModal
        venda={cancelarAlvo ? toVendaListRow(cancelarAlvo) : null}
        locale={locale}
        m={m}
        onClose={() => setCancelarAlvo(null)}
        onComprovante={setComprovanteCancelamento}
        onCancelado={() => router.refresh()}
      />

      {comprovanteCancelamento && (
        <VendaCancelamentoReciboModal
          comprovante={comprovanteCancelamento}
          locale={locale}
          m={m}
          onClose={() => setComprovanteCancelamento(null)}
        />
      )}

      <VendaDetailSheet
        alvo={alvo}
        onClose={() => setAlvo(null)}
        m={m}
        locale={locale}
        onComprovanteCancelamento={setComprovanteCancelamento}
        labels={{
          titulo: labels.detalheTitulo,
          erroTitulo: labels.detalheErroTitulo,
          erroSub: labels.detalheErroSub,
          data: labels.detalheData,
          tipo: labels.detalheTipo,
          operador: labels.detalheOperador,
          nfe: labels.detalheNfe,
          cliente: labels.detalheCliente,
          saldoAberto: labels.detalheSaldoAberto,
          verFinanceiro: labels.detalheVerFinanceiro,
          bruto: labels.detalheBruto,
          desconto: labels.detalheDesconto,
          liquido: labels.detalheLiquido,
          itens: labels.detalheItens,
          nenhumItem: labels.detalheNenhumItem,
          cancelar: labels.cancelarAcao,
          devolver: labels.devolverAcao,
        }}
      />
    </>
  )
}
