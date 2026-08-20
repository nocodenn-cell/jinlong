'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { AlertTriangle } from 'lucide-react'
import { DragonModal } from '@/components/ui/DragonModal'
import { fmtGerenteBRL, fmtGerenteDateTime, fmtGerenteIdCurto } from '@/lib/format/gerenteValues'
import { labelFormaPagamentoVenda } from '@/lib/format/vendaLabels'
import type { Mensagens } from '@/i18n/getMessages'
import { emitGerenteToast } from '@/lib/gerente/toast'
import {
  cancelarVendaGerenteAction,
  obterDadosComprovanteCancelamento,
  type VendaListRow,
} from './actions'
import type { ComprovanteCancelamento } from './VendaCancelamentoReciboModal'

type Props = Readonly<{
  venda: VendaListRow | null
  locale: string
  m: Mensagens
  onClose: () => void
  onCancelado: () => void
  /** Chamado com os dados do comprovante assim que o cancelamento é confirmado
   * com sucesso — o dono da tela decide onde/como exibir o modal de impressão. */
  onComprovante?: (comprovante: ComprovanteCancelamento) => void
}>

export function VendaCancelarModal({
  venda,
  locale,
  m,
  onClose,
  onCancelado,
  onComprovante,
}: Props) {
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
        const res = await cancelarVendaGerenteAction(fd)
        if (!res.ok) {
          emitGerenteToast({ kind: 'error', message: res.error })
          return
        }
        emitGerenteToast({ kind: 'success', message: m.comum.sucesso })

        if (onComprovante) {
          const dados = await obterDadosComprovanteCancelamento(vendaAtiva.id)
          onComprovante({
            vendaId: vendaAtiva.id,
            dataOriginal: vendaAtiva.data,
            dataCancelamento: new Date(),
            itens: dados.itens,
            totalLiquido: Number(vendaAtiva.total_liquido ?? 0),
            formaPagamentoLabel: labelFormaPagamentoVenda(vendaAtiva.forma_pagamento, m),
            motivo: motivoTrim,
            operadorNome: dados.operadorNome,
          })
        }

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
    <DragonModal
      open
      onClose={onClose}
      variant="danger"
      size="lg"
      icon={AlertTriangle}
      title="Cancelar venda"
      dismissable={!isPending}
      footer={
        <>
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
            form="cancelar-venda-form"
            disabled={!motivoValido || isPending}
            className="inline-flex min-w-[180px] items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Cancelando…' : 'Confirmar cancelamento'}
          </button>
        </>
      }
    >
        <form id="cancelar-venda-form" onSubmit={handleSubmit} className="space-y-4 pb-1">
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
        </form>
    </DragonModal>
  )
}
