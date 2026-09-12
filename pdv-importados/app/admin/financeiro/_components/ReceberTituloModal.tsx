'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HandCoins } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import { getMessages } from '@/i18n/getMessages'
import { listarFormasPagamento } from '../formasPagamentoReader'
import { isFormaPagamentoReceber, type FormaPagamentoCatalogo } from '@shared-core/src/financial'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { fmtGerenteBRL } from '@/lib/format/gerenteValues'
import { formatDecimalBRL, parseBRL } from '@/lib/format/money'
import { roundMoney2 } from '@/shared/cart/totals'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { cn } from '@/lib/utils'
import { liquidarTitulo } from '@/app/gerente/financeiro/actions'
import type { ContaLinha } from './ContasReceberTable'

/**
 * Registro de recebimento de um título — espelho do `PagamentoModal` do lado a
 * pagar, com as diferenças que o domínio impõe.
 *
 * O que substituiu: um formulário embutido na lista, limitado aos 8 primeiros
 * títulos (`abertas.slice(0, 8)`), sem resumo de saldo, sem valores sugeridos e
 * com as formas de pagamento exibidas como enum cru (`CARTAO_DEBITO`).
 *
 * Diferenças deliberadas em relação ao AP:
 * - **Sem autorização de gerente por valor.** No AP, pagar em dinheiro acima do
 *   limite é uma SANGRIA (dinheiro sai) e exige senha. Aqui o dinheiro ENTRA;
 *   `registrar_liquidacao_receber` não pede autorização e inventar uma seria
 *   criar regra de crédito nova.
 * - **Sem data retroativa.** A RPC carimba a liquidação com `now()` e não
 *   aceita data; oferecer o campo prometeria algo que o banco não cumpre.
 */

/**
 * As formas vêm de `formas_pagamento` (ver `formasPagamentoReader`), não de um
 * array literal. Antes esta tela e o Contas a Pagar declaravam conjuntos
 * diferentes e incompatíveis do mesmo conceito.
 */
type FormaReceber = import('@shared-core/src/financial').FormaPagamentoReceber

const GLYPH: Readonly<Record<string, string>> = {
  DINHEIRO: '¥',
  PIX: '⟁',
  CARTAO_DEBITO: '▭',
  CARTAO_CREDITO: '▤',
  BOLETO: '⫶',
  TRANSF: '↔',
  OUTROS: '⋯',
}

type Props = Readonly<{
  idioma: Idioma
  locale: string
  titulo: ContaLinha
  caixasAbertos: Array<{ id: string; loja_id: string; operador: string }>
  onClose: () => void
  onRecebido: () => void
}>

export function ReceberTituloModal({
  idioma,
  locale,
  titulo,
  caixasAbertos,
  onClose,
  onRecebido,
}: Props) {
  const m = getMessages(idioma)
  const t = m.contas_receber
  const aberto = roundMoney2(titulo.valor_aberto)

  const [formas, setFormas] = useState<FormaPagamentoCatalogo[]>([])

  /**
   * Só chega à tela o que a RPC aceita.
   *
   * Antes da Onda 2 isto era um array literal fechado, que não tinha como
   * divergir do contrato. Ao passar a ler o catálogo — que é mutável — a lista
   * ficou dependendo de um `as`, e foi exatamente esse buraco que, no Contas a
   * Pagar, fez a tela oferecer formas que a RPC recusa. `isFormaPagamentoReceber`
   * estreita de verdade: nenhum cast mascarando incompatibilidade.
   */
  const formasValidas = useMemo(
    () =>
      // `flatMap` e não `filter().map()`: dentro do ternário o TypeScript
      // estreita `f.codigo` pelo type guard, sem precisar de `as`.
      formas.flatMap((f) => (isFormaPagamentoReceber(f.codigo) ? [f.codigo] : [])),
    [formas],
  )

  useEffect(() => {
    let vivo = true
    listarFormasPagamento('RECEBER').then((f) => {
      if (vivo) setFormas(f)
    })
    return () => {
      vivo = false
    }
  }, [])

  const [valor, setValor] = useState(formatDecimalBRL(aberto))
  const [forma, setForma] = useState<FormaReceber>('PIX')
  const [caixaId, setCaixaId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [erros, setErros] = useState<Record<string, string | null>>({})
  const [salvando, setSalvando] = useState(false)

  const valorRef = useRef<HTMLInputElement>(null)
  const idempotencyKeyRef = useRef(crypto.randomUUID())

  // Só os caixas da loja DO TÍTULO — `registrar_liquidacao_receber` valida
  // `caixas.loja_id = contas_receber.loja_id` e recusaria qualquer outro.
  const caixasDaLoja = caixasAbertos.filter((c) => c.loja_id === titulo.loja_id)

  useEffect(() => {
    const timer = setTimeout(() => valorRef.current?.focus(), 30)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (caixasDaLoja.length === 1) setCaixaId(caixasDaLoja[0].id)
  }, [caixasDaLoja.length, caixasDaLoja])

  const valorNum = parseBRL(valor) ?? 0
  const restara = Math.max(0, roundMoney2(aberto - valorNum))
  const quita = valorNum >= aberto - 0.001

  const fechar = useCallback(() => {
    if (salvando) return
    onClose()
  }, [salvando, onClose])

  function handleValor(e: React.ChangeEvent<HTMLInputElement>) {
    let v = e.target.value.replace(/[^\d,]/g, '')
    const partes = v.split(',')
    if (partes.length > 2) v = partes[0] + ',' + partes.slice(1).join('')
    setValor(v)
    // Mudar o valor muda a intenção: a chave antiga pertencia ao valor antigo,
    // e a RPC recusa replay com payload divergente.
    idempotencyKeyRef.current = crypto.randomUUID()
    if (erros.valor) setErros((x) => ({ ...x, valor: null }))
  }

  function validar(): boolean {
    const e: Record<string, string> = {}
    if (!valorNum || valorNum <= 0) e.valor = t.err_valor_positivo
    else if (valorNum > aberto + 0.001) {
      e.valor = t.err_valor_excede.replace('{aberto}', fmtGerenteBRL(aberto, locale))
    }
    if (forma === 'DINHEIRO') {
      if (caixasDaLoja.length === 0) e.caixa = t.err_caixa_nenhum
      else if (caixasDaLoja.length > 1 && !caixaId) e.caixa = t.err_caixa_obrigatorio
    }
    setErros(e)
    return Object.keys(e).length === 0
  }

  async function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!validar()) return
    setSalvando(true)
    try {
      const r = await liquidarTitulo({
        titulo_id: titulo.id,
        valor: valorNum,
        forma_pagamento: forma,
        // Caixa só existe para dinheiro — a RPC recusa `caixa_id` nas demais.
        caixa_id: forma === 'DINHEIRO' ? caixaId || null : null,
        idempotency_key: idempotencyKeyRef.current,
        observacao: observacao.trim() || null,
      })
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      emitGerenteToast({ kind: 'success', message: t.toast_recebido })
      onRecebido()
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
      icon={HandCoins}
      title={titulo.cliente_nome}
      subtitle={titulo.descricao ?? t.receber_titulo}
      dismissable={!salvando}
      closeLabel={m.comum.fechar}
      data-testid="receber-titulo-modal"
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={fechar} disabled={salvando}>
            {m.comum.cancelar}
          </Button>
          <Button type="submit" form="ar-receber-form" size="sm" disabled={salvando || !valorNum}>
            {salvando
              ? t.enviando
              : `${t.receber_confirmar} ${fmtGerenteBRL(valorNum, locale)}`}
          </Button>
        </>
      }
    >
      <form id="ar-receber-form" onSubmit={submeter} className="space-y-4 pb-1">
        <div className="grid grid-cols-3 gap-2.5">
          <Tile label={t.receber_total} valor={fmtGerenteBRL(titulo.valor_total, locale)} />
          <Tile
            label={t.receber_recebido}
            valor={fmtGerenteBRL(titulo.valor_pago, locale)}
            tom={titulo.valor_pago > 0 ? 'positivo' : 'neutro'}
          />
          <Tile label={t.receber_aberto} valor={fmtGerenteBRL(aberto, locale)} tom="aberto" />
        </div>

        <div>
          <label htmlFor="ar-valor" className="mb-1 block text-caption font-medium text-fg-muted">
            {t.receber_valor}
          </label>
          <div className="flex items-center rounded-xl border-2 border-[var(--color-warning-strong)] bg-[var(--color-surface-soft)] px-4 py-3">
            <span className="mr-2 text-body text-fg-muted">R$</span>
            <input
              ref={valorRef}
              id="ar-valor"
              inputMode="decimal"
              value={valor}
              onChange={handleValor}
              aria-invalid={Boolean(erros.valor) || undefined}
              aria-describedby={erros.valor ? 'ar-err-valor' : undefined}
              className="w-full bg-transparent text-right text-2xl font-extrabold tabular-nums text-fg outline-none"
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <AtalhoValor
              onClick={() => setValor(formatDecimalBRL(aberto))}
              texto={`${t.receber_quitar} · ${fmtGerenteBRL(aberto, locale)}`}
            />
            {aberto > 0.02 ? (
              <AtalhoValor
                onClick={() => setValor(formatDecimalBRL(roundMoney2(aberto / 2)))}
                texto={`${t.receber_metade} · ${fmtGerenteBRL(roundMoney2(aberto / 2), locale)}`}
              />
            ) : null}
          </div>

          {erros.valor ? (
            <p id="ar-err-valor" role="alert" className="mt-1 text-caption text-[var(--color-danger-strong)]">
              {erros.valor}
            </p>
          ) : (
            <p className="mt-1 text-caption text-fg-subtle">
              {quita
                ? t.receber_sera_quitado
                : `${t.receber_restara} ${fmtGerenteBRL(restara, locale)} ${t.receber_aberto.toLowerCase()}`}
            </p>
          )}
        </div>

        <fieldset>
          <legend className="mb-1 block text-caption font-medium text-fg-muted">
            {t.receber_forma}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {formasValidas.map((f) => {
              return (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setForma(f)
                  if (f !== 'DINHEIRO') setCaixaId('')
                  setErros((x) => ({ ...x, caixa: null }))
                }}
                aria-pressed={forma === f}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-caption font-semibold transition-colors',
                  forma === f
                    ? 'border-transparent bg-[var(--color-brand)] text-[var(--color-brand-fg)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface-soft)] text-fg-muted hover:bg-[var(--color-surface)]',
                )}
              >
                <span aria-hidden>{GLYPH[f] ?? '•'}</span>
                {formaLabel(f, t)}
              </button>
              )
            })}
          </div>
        </fieldset>

        {forma === 'DINHEIRO' ? (
          <div>
            <label htmlFor="ar-caixa" className="mb-1 block text-caption font-medium text-fg-muted">
              {t.receber_caixa}
            </label>
            <select
              id="ar-caixa"
              value={caixaId}
              onChange={(e) => {
                setCaixaId(e.target.value)
                setErros((x) => ({ ...x, caixa: null }))
              }}
              disabled={caixasDaLoja.length === 0}
              aria-invalid={Boolean(erros.caixa) || undefined}
              className="fp-control w-full text-small"
            >
              <option value="">{t.receber_caixa_placeholder}</option>
              {caixasDaLoja.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.operador}
                </option>
              ))}
            </select>
            {erros.caixa ? (
              <p role="alert" className="mt-1 text-caption text-[var(--color-danger-strong)]">
                {erros.caixa}
              </p>
            ) : null}
          </div>
        ) : null}

        <div>
          <label htmlFor="ar-obs" className="mb-1 block text-caption font-medium text-fg-muted">
            {t.receber_observacao}
          </label>
          <input
            id="ar-obs"
            type="text"
            maxLength={200}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder={t.receber_observacao_placeholder}
            className="fp-control w-full text-small"
          />
        </div>
      </form>
    </DragonModal>
  )
}

function Tile({
  label,
  valor,
  tom = 'neutro',
}: {
  label: string
  valor: string
  tom?: 'neutro' | 'positivo' | 'aberto'
}) {
  const caixa =
    tom === 'aberto'
      ? 'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)]'
      : 'border-[var(--color-border-secondary)] bg-[var(--color-surface-soft)]'
  const numero =
    tom === 'aberto'
      ? 'text-[var(--color-warning-strong)]'
      : tom === 'positivo'
        ? 'text-[var(--color-success-strong)]'
        : 'text-fg'
  return (
    <div className={cn('rounded-lg border px-3 py-2.5', caixa)}>
      <div className="text-caption font-semibold uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className={cn('mt-1 text-small font-bold tabular-nums', numero)}>{valor}</div>
    </div>
  )
}

function AtalhoValor({ onClick, texto }: { onClick: () => void; texto: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-1 text-caption font-semibold text-fg-muted hover:border-[var(--color-warning-strong)] hover:text-[var(--color-warning-strong)]"
    >
      {texto}
    </button>
  )
}

export function formaLabel(
  forma: string,
  t: ReturnType<typeof getMessages>['contas_receber'],
): string {
  const chave = `forma_${forma.toLowerCase()}` as keyof typeof t
  const rotulo = t[chave]
  return typeof rotulo === 'string' ? rotulo : forma
}
