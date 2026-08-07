'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { fmtGerenteBRL } from '@/lib/format/gerenteValues'
import { formatDecimalBRL, parseBRL } from '@/lib/format/money'
import { roundMoney2 } from '@/shared/cart/totals'
import { emitToast } from '@/lib/gerente/toast'
import { askConfirm } from '@/lib/ui/askConfirm'
import { cn } from '@/lib/utils'
import {
  registrarPagamentoAction,
  type ContaPagarRow,
  type FormaPagamento,
} from './actions'

type Props = Readonly<{
  idioma: Idioma
  locale: string
  conta: ContaPagarRow
  onClose: () => void
  onPagamentoRegistrado: (c: ContaPagarRow) => void
}>

const FORMAS: Array<{ id: FormaPagamento; glyph: string }> = [
  { id: 'DINHEIRO', glyph: '¥' },
  { id: 'PIX', glyph: '⟁' },
  { id: 'CARTAO', glyph: '▭' },
  { id: 'BOLETO', glyph: '⫶' },
  { id: 'TRANSF', glyph: '↔' },
]

export function PagamentoModal({ idioma, locale, conta, onClose, onPagamentoRegistrado }: Props) {
  const m = getMessages(idioma)
  const aberto = roundMoney2(conta.valor_total - conta.valor_pago)

  const [valor, setValor] = useState(formatDecimalBRL(aberto))
  const [forma, setForma] = useState<FormaPagamento>('PIX')
  const [dataPag, setDataPag] = useState(new Date().toISOString().slice(0, 10))
  const [observacao, setObservacao] = useState('')
  const [erros, setErros] = useState<Record<string, string | null>>({})
  const [salvando, setSalvando] = useState(false)

  const valorRef = useRef<HTMLInputElement>(null)

  // DragonModal cuida de Escape, scroll-lock e foco-trap; aqui só o foco inicial.
  useEffect(() => {
    const t = setTimeout(() => valorRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [])

  const valorNum = parseBRL(valor) ?? 0
  const novoAberto = Math.max(0, aberto - valorNum)
  const quita = valorNum >= aberto - 0.001

  function sujo(): boolean {
    return (parseBRL(valor) ?? 0) > 0
  }

  const fechar = useCallback(() => {
    void (async () => {
      if (sujo()) {
        const ok = await askConfirm({
          title: m.contas_pagar.confirmar_descartar,
          description: m.contas_pagar.confirmar_descartar,
          variant: 'neutral',
        })
        if (!ok) return
      }
      onClose()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, onClose, m])

  function handleValor(e: React.ChangeEvent<HTMLInputElement>) {
    let v = e.target.value.replace(/[^\d,]/g, '')
    const parts = v.split(',')
    if (parts.length > 2) v = parts[0] + ',' + parts.slice(1).join('')
    setValor(v)
    if (erros.valor) setErros((x) => ({ ...x, valor: null }))
  }

  function validar(): boolean {
    const e: Record<string, string> = {}
    if (!valorNum || valorNum <= 0) e.valor = m.contas_pagar.err_valor_positivo
    else if (valorNum > aberto + 0.001)
      e.valor = m.contas_pagar.err_valor_excede.replace('{aberto}', fmtGerenteBRL(aberto, locale))
    if (!dataPag) e.data = m.contas_pagar.err_data_obrigatoria
    else if (new Date(dataPag).getTime() > Date.now() + 86400000)
      e.data = m.contas_pagar.err_data_futura
    setErros(e)
    return Object.keys(e).length === 0
  }

  async function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!validar()) return
    setSalvando(true)
    try {
      const r = await registrarPagamentoAction({
        conta_id: conta.id,
        valor: valorNum,
        forma,
        data: new Date(dataPag).toISOString(),
        observacao: observacao.trim() || null,
      })
      if (!r.ok) {
        emitToast({ kind: 'error', message: r.error })
        return
      }
      emitToast({ kind: 'success', message: m.comum.sucesso })
      onPagamentoRegistrado(r.conta)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <DragonModal
      open
      onClose={fechar}
      sheet
      size="lg"
      icon={CreditCard}
      title={
        <>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-jl-fg-3">
            {m.contas_pagar.modal_eyebrow} · 付款登记
          </span>
          <span className="block truncate">{conta.descricao}</span>
        </>
      }
      subtitle={
        <>
          {conta.fornecedor_nome ?? '—'}
          {conta.nfe_numero && ` · NF-e #${conta.nfe_numero}`}
        </>
      }
      dismissable={!salvando}
      closeLabel={m.comum.fechar ?? 'Fechar'}
      footer={
        <>
          <Button type="button" variant="secondary" className="app-btn-neutral" onClick={fechar} disabled={salvando}>
            {m.comum.cancelar}
          </Button>
          <Button type="submit" form="pg-form" className="app-btn-accent" disabled={salvando || !valorNum}>
            {salvando
              ? m.comum.carregando ?? '…'
              : quita
                ? `${m.contas_pagar.btn_quitar} ${fmtGerenteBRL(valorNum, locale)}`
                : `${m.contas_pagar.btn_registrar} ${fmtGerenteBRL(valorNum, locale)}`}
          </Button>
        </>
      }
    >
        <form id="pg-form" onSubmit={submeter} className="space-y-4 pb-1">
            {/* Resumo */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-lg app-border border bg-jl-surface-soft px-3 py-2.5">
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">{m.contas_pagar.modal_total}</div>
                <div className="mt-1 text-sm font-bold tabular-nums text-jl-fg-1">{fmtGerenteBRL(conta.valor_total, locale)}</div>
              </div>
              <div className="rounded-lg app-border border bg-jl-surface-soft px-3 py-2.5">
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">{m.contas_pagar.modal_pago}</div>
                <div className={cn('mt-1 text-sm font-bold tabular-nums', conta.valor_pago > 0 ? 'text-[var(--color-success-strong)]' : 'text-jl-fg-3')}>
                  {fmtGerenteBRL(conta.valor_pago, locale)}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2.5">
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">{m.contas_pagar.modal_aberto}</div>
                <div className="mt-1 text-sm font-bold tabular-nums text-[var(--color-warning-strong)]">{fmtGerenteBRL(aberto, locale)}</div>
              </div>
            </div>

            {/* Valor (input grande) */}
            <div>
              <label htmlFor="pg-valor" className="mb-1 block text-xs font-medium text-jl-fg-3">
                {m.contas_pagar.modal_valor}<span className="ml-0.5 text-[color:var(--accent)]">*</span>
              </label>
              <div className="flex items-center rounded-xl border-2 border-[var(--color-warning-strong)] bg-jl-surface-soft px-4 py-3">
                <span className="mr-2 text-base text-jl-fg-3">R$</span>
                <input
                  ref={valorRef}
                  id="pg-valor"
                  inputMode="decimal"
                  value={valor}
                  onChange={handleValor}
                  aria-invalid={!!erros.valor}
                  aria-describedby={erros.valor ? 'err-valor' : 'hint-valor'}
                  className="w-full bg-transparent text-right text-2xl font-extrabold tabular-nums text-[var(--color-fg)] outline-none"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={m.contas_pagar.valores_sugeridos}>
                <button
                  type="button"
                  onClick={() => setValor(formatDecimalBRL(aberto))}
                  className="rounded-full app-border border bg-jl-surface-soft px-2.5 py-1 text-[11px] font-semibold text-jl-fg-3 hover:border-[var(--color-warning-strong)] hover:text-[var(--color-warning-strong)]"
                >
                  {m.contas_pagar.quitar} · {fmtGerenteBRL(aberto, locale)}
                </button>
                <button
                  type="button"
                  onClick={() => setValor(formatDecimalBRL(aberto / 2))}
                  className="rounded-full app-border border bg-jl-surface-soft px-2.5 py-1 text-[11px] font-semibold text-jl-fg-3 hover:border-[var(--color-warning-strong)] hover:text-[var(--color-warning-strong)]"
                >
                  {m.contas_pagar.metade}
                </button>
                {[100, 500, 1000].map(
                  (v) =>
                    v < aberto && (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setValor(formatDecimalBRL(v))}
                        className="rounded-full app-border border bg-jl-surface-soft px-2.5 py-1 text-[11px] font-semibold text-jl-fg-3 hover:border-[var(--color-warning-strong)] hover:text-[var(--color-warning-strong)]"
                      >
                        {fmtGerenteBRL(v, locale)}
                      </button>
                    ),
                )}
              </div>
              {erros.valor ? (
                <span id="err-valor" className="mt-2 block text-xs text-[var(--color-danger-strong)]">{erros.valor}</span>
              ) : (
                <span id="hint-valor" className="mt-2 block text-[11px] text-jl-fg-3">
                  {quita ? (
                    <strong className="text-[var(--color-success-strong)]">{m.contas_pagar.sera_quitada}</strong>
                  ) : valorNum > 0 ? (
                    <>
                      {m.contas_pagar.restara}{' '}
                      <strong className="text-[var(--color-warning-strong)]">{fmtGerenteBRL(novoAberto, locale)}</strong>{' '}
                      {m.contas_pagar.em_aberto}.
                    </>
                  ) : (
                    m.contas_pagar.pode_parcial
                  )}
                </span>
              )}
            </div>

            {/* Forma */}
            <div>
              <span className="mb-1.5 block text-xs font-medium text-jl-fg-3">
                {m.contas_pagar.modal_forma}<span className="ml-0.5 text-[color:var(--accent)]">*</span>
              </span>
              <div role="radiogroup" aria-label={m.contas_pagar.modal_forma} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {FORMAS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={forma === f.id}
                    onClick={() => setForma(f.id)}
                    disabled={salvando}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg app-border border bg-jl-surface-soft px-2 py-2.5 text-xs font-semibold transition-colors',
                      forma === f.id
                        ? 'border-[var(--color-warning-strong)] bg-[var(--color-warning-bg)] text-[var(--color-warning-strong)]'
                        : 'text-jl-fg-3 hover:text-jl-fg-1',
                    )}
                  >
                    <span className="text-base">{f.glyph}</span>
                    {m.contas_pagar[`forma_${f.id.toLowerCase()}` as keyof typeof m.contas_pagar] as string}
                  </button>
                ))}
              </div>
            </div>

            {/* Data + observação */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-jl-fg-3">
                {m.contas_pagar.modal_data}<span className="ml-0.5 text-[color:var(--accent)]">*</span>
                <input
                  type="date"
                  value={dataPag}
                  onChange={(e) => {
                    setDataPag(e.target.value)
                    if (erros.data) setErros((x) => ({ ...x, data: null }))
                  }}
                  disabled={salvando}
                  max={new Date().toISOString().slice(0, 10)}
                  className={cn('app-input mt-1 h-10 w-full rounded-md px-3 text-sm tabular-nums', erros.data && 'border-[var(--color-danger-strong)]')}
                  aria-invalid={!!erros.data}
                />
                {erros.data && <span className="mt-1 block text-xs text-[var(--color-danger-strong)]">{erros.data}</span>}
              </label>
              <label className="block text-xs font-medium text-jl-fg-3">
                {m.contas_pagar.modal_observacao}
                <input
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  disabled={salvando}
                  maxLength={200}
                  placeholder={m.contas_pagar.placeholder_observacao}
                  className="app-input mt-1 h-10 w-full rounded-md px-3 text-sm"
                />
              </label>
            </div>
        </form>
    </DragonModal>
  )
}
