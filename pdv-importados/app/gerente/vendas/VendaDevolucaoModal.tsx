'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { DragonModal } from '@/components/ui/DragonModal'
import { fmtGerenteBRL, fmtGerenteDateTime, fmtGerenteIdCurto } from '@/lib/format/gerenteValues'
import { labelFormaPagamentoVenda } from '@/lib/format/vendaLabels'
import type { Mensagens } from '@/i18n/getMessages'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { devolverOuTrocarVendaAction } from './actions'
import {
  FORMAS_ESTORNO_DEVOLUCAO,
  TIPOS_POS_VENDA,
  type DevolverVendaInput,
} from './parseDevolverVendaForm'
import type { VendaDetalhe } from '@/app/admin/vendas/actions'

type Props = Readonly<{
  venda: VendaDetalhe | null
  locale: string
  m: Mensagens
  onClose: () => void
  onConcluido: () => void
}>

type SelecaoItem = Readonly<{ itemVendaId: string; quantidade: number }>

function qtdDisponivel(item: VendaDetalhe['itens'][number]): number {
  return Math.max(0, item.quantidade - item.quantidade_devolvida)
}

function montarItensSelecionados(
  venda: VendaDetalhe,
  selecionados: Record<string, number>,
): SelecaoItem[] {
  return venda.itens
    .filter((i) => (selecionados[i.id] ?? 0) > 0)
    .map((i) => ({ itemVendaId: i.id, quantidade: selecionados[i.id] ?? 0 }))
}

function calcularValorEstorno(venda: VendaDetalhe, selecionados: Record<string, number>): number {
  return venda.itens.reduce((acc, item) => {
    const q = selecionados[item.id] ?? 0
    if (q <= 0) return acc
    return acc + item.preco_unitario * q
  }, 0)
}

function labelFormaEstorno(forma: string): string {
  const mapa: Record<string, string> = {
    DINHEIRO: 'Dinheiro',
    PIX: 'PIX',
    CARTAO_DEBITO: 'Cartão débito',
    CARTAO_CREDITO: 'Cartão crédito',
    CREDITO_CLIENTE: 'Abater do crédito do cliente',
  }
  return mapa[forma] ?? forma
}

export function VendaDevolucaoModal({ venda, locale, m, onClose, onConcluido }: Props) {
  const [motivo, setMotivo] = useState('')
  const [tipo, setTipo] = useState<(typeof TIPOS_POS_VENDA)[number]>('DEVOLUCAO')
  const [formaEstorno, setFormaEstorno] = useState<(typeof FORMAS_ESTORNO_DEVOLUCAO)[number]>('PIX')
  const [selecionados, setSelecionados] = useState<Record<string, number>>({})
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!venda) return
    setMotivo('')
    setTipo('DEVOLUCAO')
    setFormaEstorno(venda.tem_conta_receber ? 'CREDITO_CLIENTE' : 'PIX')
    setSelecionados({})
    queueMicrotask(() => textareaRef.current?.focus())
  }, [venda])

  const valorEstorno = useMemo(
    () => (venda ? Math.round(calcularValorEstorno(venda, selecionados) * 100) / 100 : 0),
    [venda, selecionados],
  )

  if (!venda) return null
  const vendaAtiva = venda

  const motivoTrim = motivo.trim()
  const itensPayload = montarItensSelecionados(venda, selecionados)
  const podeEnviar =
    motivoTrim.length >= 2 &&
    motivoTrim.length <= 500 &&
    itensPayload.length > 0 &&
    valorEstorno > 0

  function alterarQtd(itemId: string, max: number, delta: number) {
    setSelecionados((prev) => {
      const atual = prev[itemId] ?? 0
      const prox = Math.min(max, Math.max(0, atual + delta))
      return { ...prev, [itemId]: prox }
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!podeEnviar || isPending) return

    const fd = new FormData()
    fd.set('venda_id', vendaAtiva.id)
    fd.set('idempotency_key', idempotencyKey)
    fd.set('motivo', motivoTrim)
    fd.set('tipo', tipo)
    fd.set('forma_estorno', formaEstorno)
    fd.set('valor_estorno', String(valorEstorno))
    fd.set('itens_json', JSON.stringify(itensPayload))

    startTransition(async () => {
      try {
        await devolverOuTrocarVendaAction(fd)
        emitGerenteToast({ kind: 'success', message: m.comum.sucesso })
        onConcluido()
        onClose()
      } catch (err) {
        emitGerenteToast({
          kind: 'error',
          message: err instanceof Error ? err.message : m.comum.erro,
        })
      }
    })
  }

  const formasDisponiveis = FORMAS_ESTORNO_DEVOLUCAO.filter((f) =>
    f === 'CREDITO_CLIENTE' ? venda.tem_conta_receber : true,
  )

  return (
    <DragonModal
      open
      onClose={onClose}
      variant="default"
      size="lg"
      icon={RefreshCw}
      title={tipo === 'TROCA' ? 'Troca de itens' : 'Devolução parcial'}
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
            form="devolver-venda-form"
            disabled={!podeEnviar || isPending}
            className="inline-flex min-w-[180px] items-center justify-center rounded-lg bg-jl-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Processando…' : 'Confirmar devolução'}
          </button>
        </>
      }
    >
      <form id="devolver-venda-form" onSubmit={handleSubmit} className="space-y-4 pb-1">
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
              {fmtGerenteBRL(venda.total_liquido, locale)}
            </dd>
            <dt className="text-xs text-jl-fg-3">Pagamento</dt>
            <dd className="text-right text-sm text-jl-fg-1">
              {labelFormaPagamentoVenda(venda.forma_pagamento, m)}
            </dd>
          </dl>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-jl-fg-3">Tipo de operação</legend>
          <div className="flex gap-3">
            {TIPOS_POS_VENDA.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm text-jl-fg-1">
                <input
                  type="radio"
                  name="tipo-pos-venda"
                  value={t}
                  checked={tipo === t}
                  onChange={() => setTipo(t)}
                  disabled={isPending}
                />
                {t === 'TROCA' ? 'Troca' : 'Devolução'}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <p className="text-xs font-medium text-jl-fg-3">Itens a devolver</p>
          <ul className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-jl-border-1 p-2">
            {venda.itens.map((item) => {
              const max = qtdDisponivel(item)
              const q = selecionados[item.id] ?? 0
              if (max <= 0) {
                return (
                  <li key={item.id} className="flex justify-between text-xs text-jl-fg-3 line-through">
                    <span>{item.nome}</span>
                    <span>Já devolvido</span>
                  </li>
                )
              }
              return (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-jl-fg-1">{item.nome}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="h-7 w-7 rounded border border-jl-border-1 text-jl-fg-2"
                      onClick={() => alterarQtd(item.id, max, -1)}
                      disabled={q <= 0 || isPending}
                    >
                      −
                    </button>
                    <span className="w-8 text-center tabular-nums">{q}</span>
                    <button
                      type="button"
                      className="h-7 w-7 rounded border border-jl-border-1 text-jl-fg-2"
                      onClick={() => alterarQtd(item.id, max, 1)}
                      disabled={q >= max || isPending}
                    >
                      +
                    </button>
                    <span className="w-10 text-right text-xs text-jl-fg-3">/{max}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="forma-estorno" className="mb-1.5 block text-xs font-medium text-jl-fg-3">
              Forma de estorno
            </label>
            <select
              id="forma-estorno"
              value={formaEstorno}
              onChange={(e) =>
                setFormaEstorno(e.target.value as DevolverVendaInput['formaEstorno'])
              }
              disabled={isPending}
              className="w-full rounded-lg border border-jl-border-1 bg-jl-surface-base px-3 py-2 text-sm"
            >
              {formasDisponiveis.map((f) => (
                <option key={f} value={f}>
                  {labelFormaEstorno(f)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col justify-end">
            <span className="text-xs text-jl-fg-3">Valor a estornar</span>
            <span className="text-lg font-semibold tabular-nums text-jl-fg-1">
              {fmtGerenteBRL(valorEstorno, locale)}
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="motivo-devolucao" className="mb-1.5 block text-xs font-medium text-jl-fg-3">
            Motivo <span className="text-red-400">*</span>
          </label>
          <textarea
            id="motivo-devolucao"
            ref={textareaRef}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: defeito, desistência, troca por outro tamanho…"
            required
            minLength={2}
            maxLength={500}
            rows={3}
            disabled={isPending}
            className="w-full resize-y rounded-lg border border-jl-border-1 bg-jl-surface-base px-3 py-2 text-sm text-jl-fg-1 outline-none focus-visible:ring-2 focus-visible:ring-jl-accent/50 disabled:opacity-60"
          />
        </div>
      </form>
    </DragonModal>
  )
}
