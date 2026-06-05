'use client'

/**
 * FastProduct Admin — VendaDetailSheet (Fase 5)
 *
 * Painel lateral com o detalhe de uma venda (header + itens). Carrega sob demanda
 * ao abrir via a action read-only `obterDetalheVenda`. Visual zinc-950 do /admin.
 * Status/pagamento/fiscal pelos badges da Fase 2 (StatusBadge/PaymentBadge/
 * FiscalBadge). Sheet espelha o KardexSheet do /admin/estoque.
 */

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { StatusBadge, PaymentBadge, FiscalBadge } from '@/components/ui/badges'
import { formatBRL } from '@/lib/format/money'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { obterDetalheVenda, type VendaDetalhe } from '../actions'
import { toPayment, toVendaStatus, toFiscal } from './vendaMaps'

export type VendaAlvo = Readonly<{ id: string }>

export function VendaDetailSheet({
  alvo,
  onClose,
}: {
  alvo: VendaAlvo | null
  onClose: () => void
}) {
  const [venda, setVenda] = useState<VendaDetalhe | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(false)

  // Trava scroll + fecha no Escape enquanto aberto.
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

  // Carrega ao abrir; cancela escrita se fechar/trocar antes de resolver.
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
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} aria-hidden />
      <aside
        className="relative z-10 flex h-full w-full max-w-lg flex-col"
        style={{ background: 'var(--fp-bg-card)', borderLeft: '1px solid var(--fp-border)' }}
      >
        <div
          className="flex items-start justify-between gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid var(--fp-border)' }}
        >
          <div className="min-w-0">
            <h2 id="venda-detalhe-titulo" className="text-[15px] font-semibold" style={{ color: 'var(--fp-text-primary)' }}>
              Detalhe da venda
            </h2>
            <p className="mt-0.5 truncate font-mono text-[11px]" style={{ color: 'var(--fp-text-muted)' }}>
              {alvo.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-1 -mt-1 rounded-lg p-1.5 transition-colors hover:bg-white/[0.06]"
            style={{ color: 'var(--fp-text-muted)' }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {carregando ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg" style={{ background: 'var(--fp-bg-secondary)', opacity: 0.6 }} />
              ))}
            </div>
          ) : erro || !venda ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <span className="text-3xl" aria-hidden style={{ color: 'var(--fp-text-muted)' }}>
                ⚠️
              </span>
              <p className="text-[13px] font-medium" style={{ color: 'var(--fp-text-secondary)' }}>
                Não foi possível carregar esta venda
              </p>
              <p className="text-[11px]" style={{ color: 'var(--fp-text-muted)' }}>
                Ela pode ter sido removida ou você não tem acesso.
              </p>
            </div>
          ) : (
            <>
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2">
                {status ? (
                  <StatusBadge status={status} />
                ) : venda.status ? (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium leading-none"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--fp-border)',
                      color: 'var(--fp-text-secondary)',
                    }}
                  >
                    {venda.status}
                  </span>
                ) : null}
                <PaymentBadge payment={toPayment(venda.forma_pagamento)} />
                <FiscalBadge fiscal={toFiscal(venda.numero_nf)} />
              </div>

              {/* Resumo */}
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                <Info label="Data">{formatDateTimeOrDash(venda.data, 'pt-BR', 'medium')}</Info>
                <Info label="Tipo">{venda.tipo_venda ?? '—'}</Info>
                <Info label="Operador">{venda.operador_nome ?? '—'}</Info>
                <Info label="NF-e">{venda.numero_nf ?? '—'}</Info>
              </dl>

              {/* Totais */}
              <div
                className="mt-4 rounded-[10px] p-3"
                style={{ background: 'var(--fp-bg-secondary)', border: '1px solid var(--fp-border)' }}
              >
                <Linha label="Bruto" valor={formatBRL(venda.total_bruto)} />
                <Linha label="Desconto" valor={`- ${formatBRL(venda.total_desconto)}`} muted />
                <div className="my-1.5 h-px" style={{ background: 'var(--fp-border)' }} />
                <Linha label="Líquido" valor={formatBRL(venda.total_liquido)} strong />
              </div>

              {/* Itens */}
              <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--fp-text-muted)' }}>
                Itens ({venda.itens.length})
              </h3>
              {venda.itens.length === 0 ? (
                <p className="text-[12px]" style={{ color: 'var(--fp-text-muted)' }}>
                  Nenhum item registrado nesta venda.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {venda.itens.map((it) => (
                    <li
                      key={it.id}
                      className="flex items-start justify-between gap-3 py-2.5"
                      style={{ borderTop: '1px solid var(--fp-border-subtle)' }}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-medium" style={{ color: 'var(--fp-text-primary)' }}>
                          {it.nome}
                        </p>
                        <p className="font-mono text-[10px]" style={{ color: 'var(--fp-text-muted)' }}>
                          {it.codigo_barras ?? '—'} · {it.quantidade} × {formatBRL(it.preco_unitario)}
                          {it.desconto_unitario > 0 ? ` · desc. ${formatBRL(it.desconto_unitario)}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-[12px] font-medium tabular-nums" style={{ color: 'var(--fp-text-primary)' }}>
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
      <dt className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--fp-text-muted)' }}>
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[12px]" style={{ color: 'var(--fp-text-secondary)' }}>
        {children}
      </dd>
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
      <span className="text-[12px]" style={{ color: 'var(--fp-text-muted)' }}>
        {label}
      </span>
      <span
        className="text-[12px] tabular-nums"
        style={{
          color: muted ? 'var(--fp-text-muted)' : 'var(--fp-text-primary)',
          fontWeight: strong ? 600 : 400,
        }}
      >
        {valor}
      </span>
    </div>
  )
}
