'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { fmtGerenteBRL } from '@/lib/format/gerenteValues'
import { formatDecimalBRL, parseBRL } from '@/lib/format/money'
import { roundMoney2 } from '@/shared/cart/totals'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { cn } from '@/lib/utils'
import { listarFormasPagamento } from '@/app/admin/financeiro/formasPagamentoReader'
import { isFormaPagamentoPagar, type FormaPagamentoCatalogo } from '@shared-core/src/financial'
import {
  buscarCaixasAbertosPagamentoAction,
  registrarPagamentoAction,
  type ContaPagarRow,
  type FormaPagamento,
} from './actions'
import { obterLimiteSangriaSemGerente, validarGerenteDesconto } from '@/app/caixa/actions'

type Props = Readonly<{
  idioma: Idioma
  locale: string
  conta: ContaPagarRow
  onClose: () => void
  onPagamentoRegistrado: (c: ContaPagarRow) => void
}>

/**
 * Glifos das formas que o Contas a Pagar aceita.
 *
 * O conjunto é o da RPC `registrar_pagamento_contas_pagar` — ela recusa
 * qualquer outro valor com `PAGAMENTO_FORMA_INVALIDA`. A lista em si vem do
 * catálogo `formas_pagamento` (escopo PAGAR), não daqui; aqui fica só a
 * representação visual.
 *
 * `CARTAO` é genérico de propósito: débito x crédito é distinção de quem
 * RECEBE (taxa de adquirente, prazo de compensação). Pagando fornecedor o
 * dinheiro sai, e essa distinção não tem consumidor.
 */
const GLYPH: Readonly<Record<string, string>> = {
  DINHEIRO: '¥',
  PIX: '⟁',
  CARTAO: '▭',
  BOLETO: '⫶',
  TRANSF: '↔',
}

export function PagamentoModal({ idioma, locale, conta, onClose, onPagamentoRegistrado }: Props) {
  const m = getMessages(idioma)
  const aberto = roundMoney2(conta.valor_total - conta.valor_pago)

  const [valor, setValor] = useState(formatDecimalBRL(aberto))
  const [forma, setForma] = useState<FormaPagamento>('PIX')
  const [formas, setFormas] = useState<FormaPagamentoCatalogo[]>([])

  /**
   * Só chega à tela o que a RPC aceita.
   *
   * Sem esta guarda, uma forma cadastrada fora do contrato do AP apareceria
   * como opção e o operador só descobriria o problema ao submeter, com
   * `PAGAMENTO_FORMA_INVALIDA` — foi exatamente o que a Onda 2 provocou ao
   * oferecer cartão de débito/crédito aqui. `isFormaPagamentoPagar` estreita
   * de verdade: nenhum `as` mascarando incompatibilidade.
   */
  const formasValidas = useMemo(
    () =>
      // `flatMap` e não `filter().map()`: dentro do ternário o TypeScript
      // estreita `f.codigo` de verdade pelo type guard, sem precisar de `as`.
      formas.flatMap((f) =>
        isFormaPagamentoPagar(f.codigo) ? [{ id: f.codigo, nome: f.nome }] : [],
      ),
    [formas],
  )
  const [dataPag, setDataPag] = useState(new Date().toISOString().slice(0, 10))
  const [observacao, setObservacao] = useState('')
  const [erros, setErros] = useState<Record<string, string | null>>({})
  const [salvando, setSalvando] = useState(false)
  const [caixas, setCaixas] = useState<Array<{ id: string; operador: string }>>([])
  const [caixaId, setCaixaId] = useState('')
  const [limiteSangria, setLimiteSangria] = useState(200)
  const [senhaGerente, setSenhaGerente] = useState('')

  const valorRef = useRef<HTMLInputElement>(null)
  const idempotencyKeyRef = useRef(crypto.randomUUID())
  const autorizacaoTokenRef = useRef<string | null>(null)

  // DragonModal cuida de Escape, scroll-lock e foco-trap; aqui só o foco inicial.
  useEffect(() => {
    let vivo = true
    listarFormasPagamento('PAGAR').then((f) => {
      if (vivo) setFormas(f)
    })
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => valorRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    void Promise.all([
      buscarCaixasAbertosPagamentoAction(conta.loja_id),
      obterLimiteSangriaSemGerente(),
    ]).then(([cx, limite]) => {
      if (cx.ok) {
        setCaixas(cx.caixas)
        if (cx.caixas.length === 1) setCaixaId(cx.caixas[0].id)
      }
      if (limite.ok) setLimiteSangria(limite.limite)
    })
  }, [conta.loja_id])

  function renovarIntencao() {
    idempotencyKeyRef.current = crypto.randomUUID()
    autorizacaoTokenRef.current = null
  }

  const valorNum = parseBRL(valor) ?? 0
  const novoAberto = Math.max(0, aberto - valorNum)
  const quita = valorNum >= aberto - 0.001

  function sujo(): boolean {
    return (parseBRL(valor) ?? 0) > 0
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
    renovarIntencao()
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
    if (forma === 'DINHEIRO' && caixas.length === 0) e.caixa = 'Não existe caixa aberto elegível nesta loja.'
    if (forma === 'DINHEIRO' && caixas.length > 1 && !caixaId) e.caixa = 'Selecione o caixa da sangria.'
    if (forma === 'DINHEIRO' && valorNum > limiteSangria && !senhaGerente.trim()) {
      e.autorizacao = 'Informe a senha de autorização da sangria.'
    }
    setErros(e)
    return Object.keys(e).length === 0
  }

  async function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!validar()) return
    setSalvando(true)
    try {
      if (forma === 'DINHEIRO' && valorNum > limiteSangria && !autorizacaoTokenRef.current) {
        // Alvo = identidade estável da operação de pagamento, a mesma que o
        // banco deriva (`ap:<conta_id>:<idempotency_key>`) e grava como chave
        // de idempotência da movimentação. Autorizar este pagamento não
        // autoriza outro, nem uma sangria avulsa.
        const autorizacao = await validarGerenteDesconto({
          senha: senhaGerente,
          lojaId: conta.loja_id,
          finalidade: 'PAGAMENTO_AP',
          // O valor faz parte da identidade: a autorização do gerente vale para
          // ESTE valor. Trocar a quantia depois invalida o token.
          alvoId: `ap:${conta.id}:${idempotencyKeyRef.current}:${valorNum.toFixed(2)}`,
        })
        if (!autorizacao.ok || !autorizacao.token) {
          emitGerenteToast({ kind: 'error', message: autorizacao.ok ? 'Token de autorização não retornado.' : autorizacao.error })
          return
        }
        autorizacaoTokenRef.current = autorizacao.token
      }
      const r = await registrarPagamentoAction({
        conta_id: conta.id,
        valor: valorNum,
        forma,
        data: new Date(dataPag).toISOString(),
        observacao: observacao.trim() || null,
        idempotency_key: idempotencyKeyRef.current,
        caixa_id: forma === 'DINHEIRO' ? caixaId || null : null,
        autorizacao_token: autorizacaoTokenRef.current,
      })
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      emitGerenteToast({ kind: 'success', message: m.comum.sucesso })
      renovarIntencao()
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
                {formasValidas.map((fp) => {
                  const f = { id: fp.id, glyph: GLYPH[fp.id] ?? '•' }
                  return (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={forma === f.id}
                    onClick={() => { setForma(f.id); renovarIntencao() }}
                    disabled={salvando}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg app-border border bg-jl-surface-soft px-2 py-2.5 text-xs font-semibold transition-colors',
                      forma === f.id
                        ? 'border-[var(--color-warning-strong)] bg-[var(--color-warning-bg)] text-[var(--color-warning-strong)]'
                        : 'text-jl-fg-3 hover:text-jl-fg-1',
                    )}
                  >
                    <span className="text-base">{f.glyph}</span>
                    {(m.contas_pagar[`forma_${f.id.toLowerCase()}` as keyof typeof m.contas_pagar] as string) ?? fp.nome}
                  </button>
                  )
                })}
              </div>
            </div>

            {forma === 'DINHEIRO' ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {caixas.length > 1 ? (
                  <label className="block text-xs font-medium text-jl-fg-3">
                    Caixa da sangria
                    <select value={caixaId} onChange={(e) => { setCaixaId(e.target.value); renovarIntencao() }} className="app-input mt-1 h-10 w-full rounded-md px-3 text-sm">
                      <option value="">Selecione</option>
                      {caixas.map((caixa) => <option key={caixa.id} value={caixa.id}>{caixa.operador}</option>)}
                    </select>
                    {erros.caixa && <span className="mt-1 block text-xs text-[var(--color-danger-strong)]">{erros.caixa}</span>}
                  </label>
                ) : null}
                {valorNum > limiteSangria ? (
                  <label className="block text-xs font-medium text-jl-fg-3">
                    Senha para autorizar sangria
                    <input type="password" value={senhaGerente} onChange={(e) => { setSenhaGerente(e.target.value); renovarIntencao() }} className="app-input mt-1 h-10 w-full rounded-md px-3 text-sm" autoComplete="current-password" />
                    {erros.autorizacao && <span className="mt-1 block text-xs text-[var(--color-danger-strong)]">{erros.autorizacao}</span>}
                  </label>
                ) : null}
              </div>
            ) : null}

            {/* Data + observação */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-jl-fg-3">
                {m.contas_pagar.modal_data}<span className="ml-0.5 text-[color:var(--accent)]">*</span>
                <input
                  type="date"
                  value={dataPag}
                  onChange={(e) => {
                    setDataPag(e.target.value)
                    renovarIntencao()
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
                  onChange={(e) => { setObservacao(e.target.value); renovarIntencao() }}
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
