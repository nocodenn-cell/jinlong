'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { ROUTES, pathWithQuery } from '@/lib/navigation/routes'
import { StatusBadge, PaymentBadge, FiscalBadge } from '@/components/ui/badges'
import { MargemCell } from '@/components/ui/MargemCell'
import { PriceTooltip } from '@/components/ui/PriceTooltip'
import { formatBRL } from '@/lib/format/money'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { cn } from '@/lib/utils'
import { obterDetalheVenda, type VendaDetalhe } from '../actions'
import { VendaReimpressaoModal } from './VendaReimpressaoModal'
import { toPayment, toVendaStatus, toFiscal } from './vendaMaps'
import { VendaCancelarModal } from '@/app/gerente/vendas/VendaCancelarModal'
import type { ComprovanteCancelamento } from '@/app/gerente/vendas/VendaCancelamentoReciboModal'
import { VendaDevolucaoModal } from '@/app/gerente/vendas/VendaDevolucaoModal'
import {
  VendaDevolucaoReciboModal,
  type ComprovanteDevolucao,
} from '@/app/gerente/vendas/VendaDevolucaoReciboModal'
import type { VendaListRow } from '@/app/gerente/vendas/actions'
import type { Mensagens } from '@/i18n/getMessages'
import { useRouter } from 'next/navigation'

export type VendaAlvo = Readonly<{ id: string }>

type DetalheLabels = {
  titulo: string
  erroTitulo: string
  erroSub: string
  data: string
  tipo: string
  operador: string
  nfe: string
  cliente: string
  saldoAberto: string
  verFinanceiro: string
  bruto: string
  desconto: string
  liquido: string
  itens: string
  nenhumItem: string
  cancelar?: string
  devolver?: string
}

function toVendaListRow(v: VendaDetalhe): VendaListRow {
  return {
    id: v.id,
    data: v.data,
    total_liquido: v.total_liquido,
    total_bruto: v.total_bruto,
    forma_pagamento: v.forma_pagamento,
    status: v.status,
    caixa_id: null,
    operador_id: null,
    qtd_itens_total: v.itens.reduce((s, i) => s + i.quantidade, 0),
    qtd_itens_distintos: v.itens.length,
    primeiro_produto: v.itens[0]?.nome ?? null,
  }
}

export function VendaDetailSheet({
  alvo,
  onClose,
  labels,
  m,
  locale,
  onComprovanteCancelamento,
}: {
  alvo: VendaAlvo | null
  onClose: () => void
  labels: DetalheLabels
  m?: Mensagens
  locale?: string
  /**
   * Repassa o comprovante de cancelamento para o dono da tela exibir — este
   * componente fecha (`onClose`) assim que a venda é cancelada, então não pode
   * guardar esse estado localmente (seria destruído junto com o unmount).
   */
  onComprovanteCancelamento?: (comprovante: ComprovanteCancelamento) => void
}) {
  const router = useRouter()
  const [venda, setVenda] = useState<VendaDetalhe | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(false)
  const [cancelarAberto, setCancelarAberto] = useState(false)
  const [devolverAberto, setDevolverAberto] = useState(false)
  const [reimprimirAberto, setReimprimirAberto] = useState(false)
  const [comprovanteDevolucao, setComprovanteDevolucao] =
    useState<ComprovanteDevolucao | null>(null)

  // Comprovante aberto por cima do painel trata o próprio ESC; o painel só fecha quando nenhum está aberto.
  const comprovanteAberto = reimprimirAberto || comprovanteDevolucao !== null

  useEffect(() => {
    if (!alvo) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !comprovanteAberto) onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [alvo, onClose, comprovanteAberto])

  useEffect(() => {
    if (!alvo) return
    let vivo = true
    setCarregando(true)
    setErro(false)
    setVenda(null)
    obterDetalheVenda(alvo.id)
      .then((d) => {
        if (!vivo) return
        if (d) setVenda(d)
        else setErro(true)
      })
      .catch(() => {
        if (vivo) setErro(true)
      })
      .finally(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [alvo])

  if (!alvo) return null

  const status = venda ? toVendaStatus(venda.status) : null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="venda-detalhe-titulo"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <aside className="admin-v2-sheet relative z-10 flex h-full w-full max-w-lg flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-secondary)] px-5 py-4">
          <div className="min-w-0">
            <h2 id="venda-detalhe-titulo" className="text-body font-semibold text-jl-fg-1">
              {labels.titulo}
            </h2>
            <p className="mt-0.5 truncate font-mono text-caption text-jl-fg-3">{alvo.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-jl-fg-3 transition-colors hover:bg-white/[0.06]"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {carregando ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-jl-surface-soft opacity-60" />
              ))}
            </div>
          ) : erro || !venda ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <span className="text-3xl text-jl-fg-3" aria-hidden>⚠️</span>
              <p className="text-small font-medium text-jl-fg-2">{labels.erroTitulo}</p>
              <p className="text-caption text-jl-fg-3">{labels.erroSub}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {status ? (
                  <StatusBadge status={status} />
                ) : venda.status ? (
                  <span className="admin-v2-badge-muted inline-flex items-center rounded-full px-2 py-[2px] text-caption font-medium leading-none">
                    {venda.status}
                  </span>
                ) : null}
                <PaymentBadge payment={toPayment(venda.forma_pagamento)} />
                <FiscalBadge fiscal={toFiscal(venda.numero_nf)} />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                <Info label={labels.data}>{formatDateTimeOrDash(venda.data, 'pt-BR', 'medium')}</Info>
                <Info label={labels.tipo}>{venda.tipo_venda ?? '—'}</Info>
                <Info label={labels.operador}>{venda.operador_nome ?? '—'}</Info>
                <Info label={labels.nfe}>{venda.numero_nf ?? '—'}</Info>
                {venda.cliente_nome ? <Info label={labels.cliente}>{venda.cliente_nome}</Info> : null}
              </dl>

              <div className="admin-v2-panel mt-4 rounded-[10px] p-3">
                <Linha label={labels.bruto} valor={formatBRL(venda.total_bruto)} />
                <Linha label={labels.desconto} valor={`- ${formatBRL(venda.total_desconto)}`} muted />
                <div className="my-1.5 h-px bg-jl-surface-soft" />
                <Linha label={labels.liquido} valor={formatBRL(venda.total_liquido)} strong />
              </div>

              {venda.tem_conta_receber ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-[10px] border border-destructive/30 bg-destructive/10 p-3">
                  <div className="min-w-0">
                    <p className="text-caption font-medium text-destructive">{labels.saldoAberto}</p>
                    <p className="text-small font-semibold text-destructive">
                      {formatBRL(venda.valor_aberto_cr)}
                    </p>
                  </div>
                  <Link
                    href={pathWithQuery(ROUTES.admin.financeiro, new URLSearchParams({ tab: 'receber' }))}
                    className="shrink-0 text-caption font-medium text-destructive underline-offset-2 hover:underline"
                  >
                    {labels.verFinanceiro}
                  </Link>
                </div>
              ) : null}

              <h3 className="mb-2 mt-5 text-caption font-semibold uppercase tracking-[0.06em] text-jl-fg-3">
                {labels.itens} ({venda.itens.length})
              </h3>
              {venda.itens.length === 0 ? (
                <p className="text-small text-jl-fg-3">{labels.nenhumItem}</p>
              ) : (
                <ul className="flex flex-col">
                  {venda.itens.map((it) => (
                    <li
                      key={it.id}
                      className="flex items-start justify-between gap-3 border-t border-[var(--color-border-secondary)] py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-small font-medium text-jl-fg-1">
                          {it.nome}
                          {venda.showPrecoFonte ? (
                            <PriceTooltip
                              precoFinal={it.preco_unitario}
                              precoBase={it.preco_unitario_original}
                              tipoPreco={it.tipo_preco}
                              tipoPrecoFonte={it.tipo_preco_fonte}
                              regraAplicadaId={it.regra_aplicada_id}
                            />
                          ) : null}
                        </p>
                        <p className="font-mono text-caption text-jl-fg-3">
                          {it.codigo_barras ?? '—'} · {it.quantidade} × {formatBRL(it.preco_unitario)}
                          {it.quantidade_devolvida > 0
                            ? ` · devolvido ${it.quantidade_devolvida}`
                            : ''}
                          {it.desconto_unitario > 0 ? ` · desc. ${formatBRL(it.desconto_unitario)}` : ''}
                        </p>
                        {venda.showMargemVisual ? (
                          <p className="mt-0.5 text-caption">
                            <MargemCell
                              precoUnitario={it.preco_unitario}
                              custoUnitarioSnap={it.custo_unitario_snap}
                            />
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-small font-medium tabular-nums text-jl-fg-1">
                        {formatBRL(it.subtotal)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {venda && status === 'CONCLUIDA' && m && locale ? (
          <div className="flex flex-col gap-2 border-t border-[var(--color-border-secondary)] px-5 py-3">
            <button
              type="button"
              onClick={() => setReimprimirAberto(true)}
              data-testid="venda-detalhe-imprimir-cupom"
              className="w-full rounded-lg border border-jl-border-1 bg-jl-surface-base px-3 py-2 text-sm font-semibold text-jl-fg-1 transition hover:bg-jl-surface-raised"
            >
              {m.caixa.historico_tool_imprimir_cupom}
            </button>
            <button
              type="button"
              onClick={() => setDevolverAberto(true)}
              className="w-full rounded-lg border border-jl-border-1 bg-jl-surface-base px-3 py-2 text-sm font-semibold text-jl-fg-1 transition hover:bg-jl-surface-raised"
            >
              {labels.devolver ?? 'Devolver / trocar itens'}
            </button>
            <button
              type="button"
              onClick={() => setCancelarAberto(true)}
              className="w-full rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/20"
            >
              {labels.cancelar ?? 'Cancelar venda'}
            </button>
          </div>
        ) : null}
      </aside>

      {m && venda && reimprimirAberto ? (
        <VendaReimpressaoModal venda={venda} m={m} onClose={() => setReimprimirAberto(false)} />
      ) : null}

      {m && locale && venda && devolverAberto ? (
        <VendaDevolucaoModal
          venda={venda}
          locale={locale}
          m={m}
          onClose={() => setDevolverAberto(false)}
          onComprovante={setComprovanteDevolucao}
          onConcluido={() => {
            setDevolverAberto(false)
            obterDetalheVenda(venda.id).then((d) => {
              if (d) setVenda(d)
            })
            router.refresh()
          }}
        />
      ) : null}

      {m && locale && comprovanteDevolucao ? (
        <VendaDevolucaoReciboModal
          comprovante={comprovanteDevolucao}
          locale={locale}
          m={m}
          onClose={() => setComprovanteDevolucao(null)}
        />
      ) : null}

      {m && locale && venda && cancelarAberto ? (
        <VendaCancelarModal
          venda={toVendaListRow(venda)}
          locale={locale}
          m={m}
          onClose={() => setCancelarAberto(false)}
          onComprovante={onComprovanteCancelamento}
          onCancelado={() => {
            setCancelarAberto(false)
            onClose()
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption font-semibold uppercase tracking-[0.06em] text-jl-fg-3">{label}</dt>
      <dd className="mt-0.5 truncate text-small text-jl-fg-2">{children}</dd>
    </div>
  )
}

function Linha({
  label,
  valor,
  strong,
  muted,
}: {
  label: string
  valor: string
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-small text-jl-fg-3">{label}</span>
      <span
        className={cn(
          'text-small tabular-nums',
          muted ? 'text-jl-fg-3' : 'text-jl-fg-1',
          strong && 'font-semibold',
        )}
      >
        {valor}
      </span>
    </div>
  )
}
