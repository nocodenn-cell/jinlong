'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CreditCard, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { fmtGerenteBRL } from '@/lib/format/gerenteValues'
import { emitGerenteToast } from '@/lib/gerente/toast'
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
  const aberto = Number((conta.valor_total - conta.valor_pago).toFixed(2))

  const [valor, setValor] = useState(aberto.toFixed(2).replace('.', ','))
  const [forma, setForma] = useState<FormaPagamento>('PIX')
  const [dataPag, setDataPag] = useState(new Date().toISOString().slice(0, 10))
  const [observacao, setObservacao] = useState('')
  const [erros, setErros] = useState<Record<string, string | null>>({})
  const [salvando, setSalvando] = useState(false)

  const dialogRef = useRef<HTMLDivElement>(null)
  const valorRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const triggerEl = document.activeElement as HTMLElement | null
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setTimeout(() => valorRef.current?.focus(), 30)

    const onKey = (e: KeyboardEvent) => {
      if (salvando) return
      if (e.key === 'Escape') {
        e.preventDefault()
        fechar()
        return
      }
      if (e.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      triggerEl?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salvando])

  const valorNum = Number(String(valor).replace(/\./g, '').replace(',', '.')) || 0
  const novoAberto = Math.max(0, aberto - valorNum)
  const quita = valorNum >= aberto - 0.001

  function sujo(): boolean {
    return valor !== '0,00' && valor !== '' && Number(valor.replace(',', '.')) !== 0
  }

  const fechar = useCallback(() => {
    if (sujo() && !confirm(m.contas_pagar.confirmar_descartar)) return
    onClose()
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
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      emitGerenteToast({ kind: 'success', message: m.comum.sucesso })
      onPagamentoRegistrado(r.conta)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 dragon-glass-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !salvando) fechar()
      }}
    >
      <Card
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pg-titulo"
        className="dragon-elev-2 flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="border-b border-jl-border-1 px-5 pb-3 pt-5 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--accent)]" aria-hidden />
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-jl-fg-3">
                  {m.contas_pagar.modal_eyebrow} · 付款登记
                </p>
                <CardTitle id="pg-titulo" className="truncate text-lg font-semibold text-jl-fg-1">
                  {conta.descricao}
                </CardTitle>
                <p className="mt-1 truncate text-xs text-jl-fg-3">
                  {conta.fornecedor_nome ?? '—'}
                  {conta.nfe_numero && ` · NF-e #${conta.nfe_numero}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={fechar}
              aria-label={m.comum.fechar ?? 'Fechar'}
              disabled={salvando}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md app-border border text-jl-fg-3 transition-colors hover:border-[color:var(--accent)] hover:text-jl-fg-1 disabled:opacity-50"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </CardHeader>

        <form onSubmit={submeter} className="flex flex-1 min-h-0 flex-col">
          <CardContent className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            {/* Resumo */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-lg app-border border bg-jl-surface-soft px-3 py-2.5">
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">{m.contas_pagar.modal_total}</div>
                <div className="mt-1 text-sm font-bold tabular-nums text-jl-fg-1">{fmtGerenteBRL(conta.valor_total, locale)}</div>
              </div>
              <div className="rounded-lg app-border border bg-jl-surface-soft px-3 py-2.5">
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">{m.contas_pagar.modal_pago}</div>
                <div className={cn('mt-1 text-sm font-bold tabular-nums', conta.valor_pago > 0 ? 'text-emerald-300' : 'text-jl-fg-3')}>
                  {fmtGerenteBRL(conta.valor_pago, locale)}
                </div>
              </div>
              <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2.5">
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">{m.contas_pagar.modal_aberto}</div>
                <div className="mt-1 text-sm font-bold tabular-nums text-amber-400">{fmtGerenteBRL(aberto, locale)}</div>
              </div>
            </div>

            {/* Valor (input grande) */}
            <div>
              <label htmlFor="pg-valor" className="mb-1 block text-xs font-medium text-jl-fg-3">
                {m.contas_pagar.modal_valor}<span className="ml-0.5 text-[color:var(--accent)]">*</span>
              </label>
              <div className="flex items-center rounded-xl border-2 border-amber-400 bg-jl-surface-soft px-4 py-3">
                <span className="mr-2 text-base text-jl-fg-3">R$</span>
                <input
                  ref={valorRef}
                  id="pg-valor"
                  inputMode="decimal"
                  value={valor}
                  onChange={handleValor}
                  aria-invalid={!!erros.valor}
                  aria-describedby={erros.valor ? 'err-valor' : 'hint-valor'}
                  className="w-full bg-transparent text-right text-2xl font-extrabold tabular-nums text-amber-400 outline-none"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={m.contas_pagar.valores_sugeridos}>
                <button
                  type="button"
                  onClick={() => setValor(aberto.toFixed(2).replace('.', ','))}
                  className="rounded-full app-border border bg-jl-surface-soft px-2.5 py-1 text-[11px] font-semibold text-jl-fg-3 hover:border-amber-400 hover:text-amber-400"
                >
                  {m.contas_pagar.quitar} · {fmtGerenteBRL(aberto, locale)}
                </button>
                <button
                  type="button"
                  onClick={() => setValor((aberto / 2).toFixed(2).replace('.', ','))}
                  className="rounded-full app-border border bg-jl-surface-soft px-2.5 py-1 text-[11px] font-semibold text-jl-fg-3 hover:border-amber-400 hover:text-amber-400"
                >
                  {m.contas_pagar.metade}
                </button>
                {[100, 500, 1000].map(
                  (v) =>
                    v < aberto && (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setValor(v.toFixed(2).replace('.', ','))}
                        className="rounded-full app-border border bg-jl-surface-soft px-2.5 py-1 text-[11px] font-semibold text-jl-fg-3 hover:border-amber-400 hover:text-amber-400"
                      >
                        {fmtGerenteBRL(v, locale)}
                      </button>
                    ),
                )}
              </div>
              {erros.valor ? (
                <span id="err-valor" className="mt-2 block text-xs text-red-300">{erros.valor}</span>
              ) : (
                <span id="hint-valor" className="mt-2 block text-[11px] text-jl-fg-3">
                  {quita ? (
                    <strong className="text-emerald-300">{m.contas_pagar.sera_quitada}</strong>
                  ) : valorNum > 0 ? (
                    <>
                      {m.contas_pagar.restara}{' '}
                      <strong className="text-amber-400">{fmtGerenteBRL(novoAberto, locale)}</strong>{' '}
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
                        ? 'border-amber-400 bg-amber-400/15 text-amber-400'
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
                  className={cn('app-input mt-1 h-10 w-full rounded-md px-3 text-sm tabular-nums', erros.data && 'border-red-400/60')}
                  aria-invalid={!!erros.data}
                />
                {erros.data && <span className="mt-1 block text-xs text-red-300">{erros.data}</span>}
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
          </CardContent>

          <CardFooter className="flex justify-end gap-2 border-t border-jl-border-1 px-5 py-3 sm:px-6">
            <Button type="button" variant="secondary" className="app-btn-neutral" onClick={fechar} disabled={salvando}>
              {m.comum.cancelar}
            </Button>
            <Button type="submit" className="app-btn-accent" disabled={salvando || !valorNum}>
              {salvando
                ? m.comum.carregando ?? '…'
                : quita
                  ? `${m.contas_pagar.btn_quitar} ${fmtGerenteBRL(valorNum, locale)}`
                  : `${m.contas_pagar.btn_registrar} ${fmtGerenteBRL(valorNum, locale)}`}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
