'use client'

import { useEffect, useRef, useState } from 'react'
import { fmtGerenteBRL, fmtGerenteDateTime, fmtGerenteIdCurto } from '@/lib/format/gerenteValues'
import { labelFormaPagamentoVenda, labelStatusVenda } from '@/lib/format/vendaLabels'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import type { VendaListRow } from './actions'
import { buscarVendaDetalheAction, type VendaDetalheDTO } from './actions'

type Props = {
  venda: VendaListRow
  idioma: Idioma
  locale: string
  onClose: () => void
  onCancelarSucesso: (vendaId: string) => void
  cancelarAction: (formData: FormData) => Promise<void>
}

function statusBadgeClasses(status: string): string {
  const s = status.toUpperCase()
  if (s === 'CANCELADA')
    return 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold app-badge-danger'
  if (s === 'CONCLUIDA')
    return 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold app-badge-positive'
  return 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold app-badge-warn'
}

/**
 * Modal acessível de detalhe da venda.
 *
 * a11y:
 *   - role="dialog" + aria-modal + aria-labelledby
 *   - Esc fecha; backdrop click fecha (confirmação se houver motivo digitado)
 *   - Foco inicial vai para o botão "Fechar"; foco volta para a linha de origem
 *   - Focus trap (Tab/Shift+Tab dentro do diálogo)
 *   - body.overflow lockado enquanto aberto
 */
export function VendaDetalheModal({
  venda,
  idioma,
  locale,
  onClose,
  onCancelarSucesso,
  cancelarAction,
}: Props) {
  const m = getMessages(idioma)
  const [detalhe, setDetalhe] = useState<VendaDetalheDTO | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [enviandoCancelamento, setEnviandoCancelamento] = useState(false)

  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // ESC + lock scroll + foco
  useEffect(() => {
    const triggerEl = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeBtnRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (!focusables || focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      triggerEl?.focus?.()
    }
  }, [onClose])

  // Busca detalhe ao abrir
  useEffect(() => {
    let cancelado = false
    setCarregando(true)
    setErro(null)
    setDetalhe(null)
    buscarVendaDetalheAction(venda.id).then((r) => {
      if (cancelado) return
      if (!r.ok) {
        setErro(r.error)
      } else {
        setDetalhe(r.detalhe)
      }
      setCarregando(false)
    })
    return () => {
      cancelado = true
    }
  }, [venda.id])

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    if (motivo.trim() && !confirm('Descartar o motivo digitado e fechar?')) return
    onClose()
  }

  function copiarId() {
    if (typeof navigator !== 'undefined' && 'clipboard' in navigator) {
      void navigator.clipboard.writeText(venda.id)
    }
  }

  async function submeterCancelamento(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (motivo.trim().length < 2) return
    if (!confirm(`Confirma o cancelamento da venda ${fmtGerenteIdCurto(venda.id)}? Esta ação não pode ser desfeita.`)) {
      return
    }
    const fd = new FormData()
    fd.set('venda_id', venda.id)
    fd.set('motivo', motivo.trim())
    setEnviandoCancelamento(true)
    try {
      await cancelarAction(fd)
      onCancelarSucesso(venda.id)
      setMotivo('')
    } finally {
      setEnviandoCancelamento(false)
    }
  }

  const isCancelada = (venda.status ?? '').toUpperCase() === 'CANCELADA'
  const totalLiquido = Number(venda.total_liquido)
  const totalBruto = Number(detalhe?.venda.total_bruto ?? totalLiquido)
  const totalDesconto = Number(detalhe?.venda.total_desconto ?? 0)

  return (
    <div
      className="venda-modal-backdrop fixed inset-0 z-[1040] flex items-center justify-center p-4 backdrop-blur-md"
      style={{ background: 'rgba(2, 6, 23, 0.62)' }}
      onMouseDown={handleBackdrop}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="venda-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="dragon-glass-card venda-modal flex max-h-[calc(100vh-2rem)] w-full max-w-[780px] flex-col overflow-hidden rounded-2xl"
      >
        {/* Head */}
        <header className="flex items-start justify-between gap-4 border-b border-slate-700/40 px-6 py-5">
          <div className="min-w-0 flex-1">
            <p className="gerente-fin-muted mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
              {m.gerente.venda_detalhe_titulo} · 销售
            </p>
            <h2
              id="venda-modal-title"
              className="m-0 flex flex-wrap items-center gap-3 text-xl font-semibold tracking-tight text-slate-50"
            >
              {fmtGerenteBRL(totalLiquido, locale)}
              <span className={statusBadgeClasses(venda.status ?? '')}>{labelStatusVenda(venda.status, m)}</span>
            </h2>
            <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
              <span className="vm-id-chip inline-flex items-center gap-1.5 rounded-md border border-slate-700/40 bg-slate-950/50 px-2.5 py-1 font-mono text-[11px] text-slate-400" title={venda.id}>
                ID {venda.id.slice(0, 8)}…{venda.id.slice(-4)}
                <button
                  type="button"
                  onClick={copiarId}
                  className="ml-1 text-[10px] opacity-70 hover:text-amber-400 hover:opacity-100"
                >
                  copiar
                </button>
              </span>
              {detalhe?.venda.numero_nf && (
                <span className="vm-id-chip inline-flex items-center gap-1.5 rounded-md border border-slate-700/40 bg-slate-950/50 px-2.5 py-1 font-mono text-[11px] text-slate-400">
                  NF nº {detalhe.venda.numero_nf}
                </span>
              )}
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhe da venda"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700/40 text-base text-slate-400 transition-colors hover:border-amber-400 hover:text-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
          >
            ✕
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Resumo */}
          <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-3.5 sm:grid-cols-3">
            <div>
              <dt className="gerente-fin-muted mb-1 text-[10px] font-bold uppercase tracking-[0.12em]">{m.gerente.col_data}</dt>
              <dd className="text-sm font-medium tabular-nums text-slate-100">{fmtGerenteDateTime(venda.data, locale)}</dd>
            </div>
            <div>
              <dt className="gerente-fin-muted mb-1 text-[10px] font-bold uppercase tracking-[0.12em]">{m.gerente.col_forma}</dt>
              <dd className="text-sm font-medium text-slate-100">{labelFormaPagamentoVenda(venda.forma_pagamento, m)}</dd>
            </div>
            {detalhe?.venda.tipo_venda && (
              <div>
                <dt className="gerente-fin-muted mb-1 text-[10px] font-bold uppercase tracking-[0.12em]">{m.gerente.col_tipo_venda}</dt>
                <dd className="text-sm font-medium text-slate-100">{detalhe.venda.tipo_venda}</dd>
              </div>
            )}
            {detalhe?.venda.operador_nome && (
              <div>
                <dt className="gerente-fin-muted mb-1 text-[10px] font-bold uppercase tracking-[0.12em]">{m.gerente.col_op}</dt>
                <dd className="text-sm font-medium text-slate-100">{detalhe.venda.operador_nome}</dd>
              </div>
            )}
            <div>
              <dt className="gerente-fin-muted mb-1 text-[10px] font-bold uppercase tracking-[0.12em]">{m.gerente.col_caixa}</dt>
              <dd className="font-mono text-sm tabular-nums text-slate-100">{fmtGerenteIdCurto(venda.caixa_id ?? undefined)}…</dd>
            </div>
          </dl>

          {/* Total destacado */}
          <div className="mb-5 flex items-end justify-between gap-4 rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-400/10 to-slate-950/40 px-5 py-4">
            <div>
              <div className="gerente-fin-muted mb-1 text-[11px] font-bold uppercase tracking-[0.14em]">{m.gerente.col_total}</div>
              <div className="text-3xl font-extrabold leading-none tracking-tight text-amber-400 tabular-nums">
                {fmtGerenteBRL(totalLiquido, locale)}
              </div>
            </div>
            <div className="text-right font-mono text-[11px] leading-[1.5] tabular-nums text-slate-400">
              {m.gerente.venda_bruto} · <b className="text-slate-200">{fmtGerenteBRL(totalBruto, locale)}</b>
              <br />
              {m.gerente.venda_desconto} ·{' '}
              <b className={totalDesconto > 0 ? 'text-red-300' : 'text-slate-500'}>
                {totalDesconto > 0 ? '−' : ''}
                {fmtGerenteBRL(totalDesconto, locale)}
              </b>
            </div>
          </div>

          {/* Itens */}
          <h3 className="mb-2.5 flex items-center justify-between gap-2.5 text-[13px] font-semibold text-slate-100">
            <span>{m.gerente.sec_itens_venda}</span>
            <span className="text-[12px] font-medium tracking-[0.08em] text-amber-400" style={{ fontFamily: 'var(--font-serif-han)' }}>
              商品明细
            </span>
          </h3>

          {carregando ? (
            <div className="flex items-center justify-center gap-2.5 rounded-lg border border-slate-700/40 bg-slate-950/45 px-3 py-6 text-xs text-slate-400">
              <span className="vendas-loader-orbit inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-400/20 border-t-amber-400" />
              {m.comum.carregando ?? 'Carregando…'}
            </div>
          ) : erro ? (
            <div className="rounded-lg border border-red-400/30 bg-red-950/30 px-3 py-4 text-sm text-red-300">{erro}</div>
          ) : !detalhe || detalhe.itens.length === 0 ? (
            <div className="rounded-lg border border-slate-700/40 bg-slate-950/45 px-3 py-6 text-center text-xs text-slate-400">
              {m.gerente.venda_sem_itens}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-700/40 bg-slate-950/45">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-950/65">
                    <th className="gerente-fin-muted px-3.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.10em]">
                      {m.estoque.col_produto}
                    </th>
                    <th className="gerente-fin-muted px-3.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.10em]">
                      {m.estoque.col_codigo}
                    </th>
                    <th className="gerente-fin-muted px-3.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.10em]">
                      {m.gerente.col_qtde}
                    </th>
                    <th className="gerente-fin-muted px-3.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.10em]">
                      {m.gerente.col_preco_unit}
                    </th>
                    <th className="gerente-fin-muted px-3.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.10em]">
                      {m.gerente.col_subtotal}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {detalhe.itens.map((it) => {
                    const q = Number(it.quantidade)
                    const pu = Number(it.preco_unitario)
                    const puOrig = Number(it.preco_unitario_original ?? it.preco_unitario)
                    const subtotal = q * pu
                    const temDesconto = Number(it.desconto_unitario) > 0
                    return (
                      <tr key={it.id} className="gerente-fin-row-hover">
                        <td className="px-3.5 py-3 align-top">
                          <div className="font-semibold text-slate-100">{it.produto_nome ?? '—'}</div>
                        </td>
                        <td className="px-3.5 py-3 align-top font-mono text-xs text-slate-400">
                          {it.produto_codigo ?? '—'}
                        </td>
                        <td className="px-3.5 py-3 text-right align-top tabular-nums text-slate-100">{q}</td>
                        <td className="px-3.5 py-3 text-right align-top tabular-nums text-slate-100">
                          {fmtGerenteBRL(pu, locale)}
                          {temDesconto && (
                            <div className="text-[10px] text-amber-200 line-through">{fmtGerenteBRL(puOrig, locale)}</div>
                          )}
                        </td>
                        <td className="px-3.5 py-3 text-right align-top font-semibold tabular-nums text-slate-100">
                          {fmtGerenteBRL(subtotal, locale)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Foot */}
        <footer className="flex flex-wrap items-center justify-between gap-3.5 border-t border-slate-700/40 px-6 py-4">
          {isCancelada ? (
            <div className="flex flex-1 items-center gap-2.5 text-xs text-slate-400">
              <span className="text-lg text-red-300" style={{ fontFamily: 'var(--font-serif-han)' }}>
                印
              </span>
              <span>
                {m.gerente.venda_ja_cancelada} <b className="text-red-300">·</b>{' '}
                <span className="text-slate-400">não é possível reverter</span>
              </span>
            </div>
          ) : (
            <form onSubmit={submeterCancelamento} className="flex min-w-0 flex-1 flex-wrap items-stretch gap-2.5">
              <input
                name="motivo"
                type="text"
                placeholder={m.gerente.venda_motivo_cancel_placeholder}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                minLength={2}
                maxLength={500}
                required
                aria-label={m.gerente.venda_motivo_cancel_placeholder}
                className="min-w-[200px] flex-1 rounded-lg border border-slate-700/40 bg-slate-950/55 px-3 py-2 text-sm text-slate-100 shadow-inner outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 app-input"
              />
              <button
                type="submit"
                disabled={motivo.trim().length < 2 || enviandoCancelamento}
                className="gerente-btn-cancel app-btn-danger shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                {enviandoCancelamento ? m.comum.carregando ?? 'Cancelando…' : m.comum.cancelar}
              </button>
            </form>
          )}
          <button
            type="button"
            onClick={onClose}
            className="app-btn-neutral rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
          >
            {m.comum.fechar ?? 'Fechar'} · Esc
          </button>
        </footer>
      </div>
    </div>
  )
}
