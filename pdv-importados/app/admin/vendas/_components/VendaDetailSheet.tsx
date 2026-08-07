'use client'

import { useEffect, useState } from 'react'
import { StatusBadge, PaymentBadge, FiscalBadge } from '@/components/ui/badges'
import { MargemCell } from '@/components/ui/MargemCell'
import { PriceTooltip } from '@/components/ui/PriceTooltip'
import { DetailSheet } from '@/components/ui/DetailSheet'
import { formatBRL } from '@/lib/format/money'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { cn } from '@/lib/utils'
import { obterDetalheVenda, type VendaDetalhe } from '../actions'
import { toPayment, toVendaStatus, toFiscal } from './vendaMaps'
import { VendaCancelarModal } from '@/app/gerente/vendas/VendaCancelarModal'
import { VendaDevolucaoModal } from '@/app/gerente/vendas/VendaDevolucaoModal'
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
}: {
  alvo: VendaAlvo | null
  onClose: () => void
  labels: DetalheLabels
  m?: Mensagens
  locale?: string
}) {
  const router = useRouter()
  const [venda, setVenda] = useState<VendaDetalhe | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(false)
  const [cancelarAberto, setCancelarAberto] = useState(false)
  const [devolverAberto, setDevolverAberto] = useState(false)

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

  const status = venda ? toVendaStatus(venda.status) : null
  const footer =
    venda && status === 'CONCLUIDA' && m && locale ? (
      <>
        <button
          type="button"
          onClick={() => setDevolverAberto(true)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-semibold text-fg transition hover:bg-[var(--color-surface-soft)]"
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
      </>
    ) : undefined

  return (
    <>
      <DetailSheet
        open={alvo != null}
        onClose={onClose}
        title={labels.titulo}
        subtitle={alvo?.id}
        footer={footer}
      >
        {carregando ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-[var(--color-surface-soft)] opacity-60" />
            ))}
          </div>
        ) : erro || !venda ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-[13px] font-medium text-fg-muted">{labels.erroTitulo}</p>
            <p className="text-[11px] text-fg-subtle">{labels.erroSub}</p>
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
              <div className="my-1.5 h-px bg-[var(--color-surface-soft)]" />
              <Linha label={labels.liquido} valor={formatBRL(venda.total_liquido)} strong />
            </div>

            <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
              {labels.itens} ({venda.itens.length})
            </h3>
            {venda.itens.length === 0 ? (
              <p className="text-[12px] text-fg-subtle">{labels.nenhumItem}</p>
            ) : (
              <ul className="flex flex-col">
                {venda.itens.map((it) => (
                  <li
                    key={it.id}
                    className="flex items-start justify-between gap-3 border-t border-[var(--color-border)] py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-[12px] font-medium text-fg">
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
                      <p className="font-mono text-[10px] text-fg-subtle">
                        {it.codigo_barras ?? '—'} · {it.quantidade} × {formatBRL(it.preco_unitario)}
                        {it.quantidade_devolvida > 0 ? ` · devolvido ${it.quantidade_devolvida}` : ''}
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
                    <span className="shrink-0 text-[12px] font-medium tabular-nums text-fg">
                      {formatBRL(it.subtotal)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </DetailSheet>

      {m && locale && venda && devolverAberto ? (
        <VendaDevolucaoModal
          venda={venda}
          locale={locale}
          m={m}
          onClose={() => setDevolverAberto(false)}
          onConcluido={() => {
            setDevolverAberto(false)
            obterDetalheVenda(venda.id).then((d) => {
              if (d) setVenda(d)
            })
            router.refresh()
          }}
        />
      ) : null}

      {m && locale && venda && cancelarAberto ? (
        <VendaCancelarModal
          venda={toVendaListRow(venda)}
          locale={locale}
          m={m}
          onClose={() => setCancelarAberto(false)}
          onCancelado={() => {
            setCancelarAberto(false)
            onClose()
            router.refresh()
          }}
        />
      ) : null}
    </>
  )
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-[12px] text-fg-muted">{children}</dd>
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
      <span className="text-[12px] text-fg-subtle">{label}</span>
      <span
        className={cn(
          'text-[12px] tabular-nums',
          muted ? 'text-fg-subtle' : 'text-fg',
          strong && 'font-semibold',
        )}
      >
        {valor}
      </span>
    </div>
  )
}
