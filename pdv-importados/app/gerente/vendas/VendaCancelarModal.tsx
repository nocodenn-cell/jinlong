'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { fmtGerenteBRL, fmtGerenteDateTime, fmtGerenteIdCurto } from '@/lib/format/gerenteValues'
import { labelFormaPagamentoVenda } from '@/lib/format/vendaLabels'
import type { Mensagens } from '@/i18n/getMessages'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { cancelarVendaGerenteAction, type VendaListRow } from './actions'

type Props = Readonly<{
  venda: VendaListRow | null
  locale: string
  m: Mensagens
  onClose: () => void
  onCancelado: () => void
}>

export function VendaCancelarModal({ venda, locale, m, onClose, onCancelado }: Props) {
  const [motivo, setMotivo] = useState('')
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (venda) {
      setMotivo('')
      // Foco na próxima micro-task para garantir que o textarea já está montado
      queueMicrotask(() => textareaRef.current?.focus())
    }
  }, [venda])

  useEffect(() => {
    if (!venda) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [venda, isPending, onClose])

  if (!venda) return null
  const vendaAtiva = venda

  const motivoTrim = motivo.trim()
  const motivoValido = motivoTrim.length >= 2 && motivoTrim.length <= 500

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!motivoValido || isPending) return
    const fd = new FormData()
    fd.set('venda_id', vendaAtiva.id)
    fd.set('motivo', motivoTrim)
    startTransition(async () => {
      try {
        await cancelarVendaGerenteAction(fd)
        emitGerenteToast({ kind: 'success', message: m.comum.sucesso })
        onCancelado()
        onClose()
      } catch (err) {
        emitGerenteToast({
          kind: 'error',
          message: err instanceof Error ? err.message : m.comum.erro,
        })
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancelar-venda-titulo"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={isPending ? undefined : onClose}
        aria-hidden
      />
      <div className="dragon-glass-card relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl app-border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-jl-border-1 px-5 py-3.5">
          <h2 id="cancelar-venda-titulo" className="text-base font-semibold app-surface-text">
            Cancelar venda
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="Fechar"
            className="rounded-md p-1 text-jl-fg-3 transition hover:bg-white/[0.06] hover:text-jl-fg-1 disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {/* Resumo da venda */}
          <div className="rounded-xl border border-jl-border-1 bg-jl-surface-base/60 px-4 py-3 text-sm">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-wide text-jl-fg-3">Venda</span>
              <span className="font-mono text-xs text-jl-fg-3">{fmtGerenteIdCurto(venda.id)}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <dt className="text-xs text-jl-fg-3">Data</dt>
              <dd className="text-right text-sm tabular-nums text-jl-fg-1">
                {fmtGerenteDateTime(venda.data, locale)}
              </dd>
              <dt className="text-xs text-jl-fg-3">Total</dt>
              <dd className="text-right text-sm font-semibold tabular-nums text-jl-fg-1">
                {fmtGerenteBRL(Number(venda.total_liquido), locale)}
              </dd>
              <dt className="text-xs text-jl-fg-3">Pagamento</dt>
              <dd className="text-right text-sm text-jl-fg-1">
                {labelFormaPagamentoVenda(venda.forma_pagamento, m)}
              </dd>
              <dt className="text-xs text-jl-fg-3">Caixa</dt>
              <dd className="text-right font-mono text-xs text-jl-fg-3">
                {fmtGerenteIdCurto(venda.caixa_id ?? undefined)}
              </dd>
            </dl>
          </div>

          {/* Aviso de impacto */}
          <div className="flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
            <div className="space-y-1 text-xs text-amber-100/90">
              <p className="font-semibold text-amber-200">Esta ação não pode ser desfeita.</p>
              <p className="opacity-90">
                O estoque dos itens vendidos será revertido. Se houver NF-e emitida, o cancelamento
                fiscal deve ser feito separadamente dentro do prazo legal.
              </p>
            </div>
          </div>

          {/* Motivo */}
          <div>
            <label htmlFor="motivo-cancelamento" className="mb-1.5 block text-xs font-medium text-jl-fg-3">
              Motivo do cancelamento <span className="text-red-400">*</span>
            </label>
            <textarea
              id="motivo-cancelamento"
              ref={textareaRef}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: cliente desistiu, erro de digitação, troca por outro produto…"
              required
              minLength={2}
              maxLength={500}
              rows={3}
              disabled={isPending}
              className="w-full resize-y rounded-lg border border-jl-border-1 bg-jl-surface-base px-3 py-2 text-sm text-jl-fg-1 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 disabled:opacity-60"
            />
            <div className="mt-1 flex items-center justify-between text-[10px] text-jl-fg-3">
              <span>Mínimo 2, máximo 500 caracteres. Fica registrado para auditoria.</span>
              <span className={motivoTrim.length > 500 ? 'text-red-400' : ''}>
                {motivoTrim.length}/500
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-lg px-4 py-2 text-sm font-medium app-muted transition hover:text-jl-fg-1 disabled:opacity-40"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={!motivoValido || isPending}
              className="inline-flex min-w-[180px] items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? 'Cancelando…' : 'Confirmar cancelamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
