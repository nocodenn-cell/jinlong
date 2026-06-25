'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { StatusBadge, PaymentBadge, FiscalBadge } from '@/components/ui/badges'
import { MargemCell } from '@/components/ui/MargemCell'
import { PriceTooltip } from '@/components/ui/PriceTooltip'
import { formatBRL } from '@/lib/format/money'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { cn } from '@/lib/utils'
import { obterDetalheVenda, type VendaDetalhe } from '../actions'
import { toPayment, toVendaStatus, toFiscal } from './vendaMaps'

export type VendaAlvo = Readonly<{ id: string }>

type DetalheLabels = {
  titulo: string
  erroTitulo: string
  erroSub: string
  data: string
  tipo: string
  operador: string
  nfe: string
  bruto: string
  desconto: string
  liquido: string
  itens: string
  nenhumItem: string
}

export function VendaDetailSheet({
  alvo,
  onClose,
  labels,
}: {
  alvo: VendaAlvo | null
  onClose: () => void
  labels: DetalheLabels
}) {
  const [venda, setVenda] = useState<VendaDetalhe | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    if (!alvo) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [alvo, onClose])

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
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="venda-detalhe-titulo" className="text-[15px] font-semibold text-jl-fg-1">
              {labels.titulo}
            </h2>
            <p className="mt-0.5 truncate font-mono text-[11px] text-jl-fg-3">{alvo.id}</p>
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
                <div key={i} className="h-12 rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : erro || !venda ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <span className="text-3xl text-jl-fg-3" aria-hidden>⚠️</span>
              <p className="text-[13px] font-medium text-jl-fg-2">{labels.erroTitulo}</p>
              <p className="text-[11px] text-jl-fg-3">{labels.erroSub}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {status ? (
                  <StatusBadge status={status} />
                ) : venda.status ? (
                  <span className="admin-v2-badge-muted inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium leading-none">
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
              </dl>

              <div className="admin-v2-panel mt-4 rounded-[10px] p-3">
                <Linha label={labels.bruto} valor={formatBRL(venda.total_bruto)} />
                <Linha label={labels.desconto} valor={`- ${formatBRL(venda.total_desconto)}`} muted />
                <div className="my-1.5 h-px bg-slate-100" />
                <Linha label={labels.liquido} valor={formatBRL(venda.total_liquido)} strong />
              </div>

              <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.06em] text-jl-fg-3">
                {labels.itens} ({venda.itens.length})
              </h3>
              {venda.itens.length === 0 ? (
                <p className="text-[12px] text-jl-fg-3">{labels.nenhumItem}</p>
              ) : (
                <ul className="flex flex-col">
                  {venda.itens.map((it) => (
                    <li
                      key={it.id}
                      className="flex items-start justify-between gap-3 border-t border-slate-100 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-[12px] font-medium text-jl-fg-1">
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
                        <p className="font-mono text-[10px] text-jl-fg-3">
                          {it.codigo_barras ?? '—'} · {it.quantidade} × {formatBRL(it.preco_unitario)}
                          {it.desconto_unitario > 0 ? ` · desc. ${formatBRL(it.desconto_unitario)}` : ''}
                        </p>
                        {venda.showMargemVisual ? (
                          <p className="mt-0.5 text-[10px]">
                            <MargemCell
                              precoUnitario={it.preco_unitario}
                              custoUnitarioSnap={it.custo_unitario_snap}
                            />
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-[12px] font-medium tabular-nums text-jl-fg-1">
                        {formatBRL(it.subtotal)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-jl-fg-3">{label}</dt>
      <dd className="mt-0.5 truncate text-[12px] text-jl-fg-2">{children}</dd>
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
      <span className="text-[12px] text-jl-fg-3">{label}</span>
      <span
        className={cn(
          'text-[12px] tabular-nums',
          muted ? 'text-jl-fg-3' : 'text-jl-fg-1',
          strong && 'font-semibold',
        )}
      >
        {valor}
      </span>
    </div>
  )
}
