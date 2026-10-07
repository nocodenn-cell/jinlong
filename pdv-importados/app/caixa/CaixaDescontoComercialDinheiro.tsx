'use client'

import { useState } from 'react'
import { BadgePercent } from 'lucide-react'
import { CaixaMoneyInput } from './CaixaMoneyInput'
import {
  DESCONTO_COMERCIAL_DINHEIRO_MAX_PCT,
  calcularDescontoComercialDinheiro,
} from './descontoComercialDinheiro'
import { formatDecimalBRL } from '@/lib/format/money'

const textos = {
  pt: {
    title: 'Desconto comercial no dinheiro',
    help: `Até ${DESCONTO_COMERCIAL_DINHEIRO_MAX_PCT}% sobre o subtotal dos produtos. Só vale se o pagamento for 100% em dinheiro. O operador aplica direto, sem gerente.`,
    quick: `${DESCONTO_COMERCIAL_DINHEIRO_MAX_PCT}% de desconto no dinheiro`,
    mode: 'Tipo',
    percent: 'Percentual (%)',
    amount: 'Valor (R$)',
    apply: 'Aplicar desconto',
    clear: 'Remover desconto',
    subtotal: 'Subtotal',
    desconto: 'Desconto aplicado',
    total: 'Total final a pagar',
    error: 'Desconto inválido ou acima de 10%.',
    applied: 'Desconto comercial aplicado. Sem necessidade de gerente até 10%.',
    badgeApplied: 'aplicado',
  },
  zh: {
    title: '现金商业折扣',
    help: `商品小计最多 ${DESCONTO_COMERCIAL_DINHEIRO_MAX_PCT}%。仅当全部现金支付时有效；操作员可直接应用，无需经理。`,
    quick: `现金折扣 ${DESCONTO_COMERCIAL_DINHEIRO_MAX_PCT}%`,
    mode: '类型',
    percent: '百分比 (%)',
    amount: '金额 (R$)',
    apply: '应用折扣',
    clear: '移除折扣',
    subtotal: '小计',
    desconto: '已应用折扣',
    total: '应付合计',
    error: '折扣无效或超过 10%。',
    applied: '已应用现金商业折扣（≤10% 无需经理）。',
    badgeApplied: '已应用',
  },
} as const

type Props = {
  idioma: 'pt' | 'zh'
  subtotal: number
  disabled?: boolean
  descontoPercentualAtual: number
  onSolicitar: (percentual: number) => void
  onLimpar: () => void
}

export function CaixaDescontoComercialDinheiro({
  idioma,
  subtotal,
  disabled = false,
  descontoPercentualAtual,
  onSolicitar,
  onLimpar,
}: Props) {
  const t = textos[idioma]
  const [mode, setMode] = useState<'percentual' | 'valor'>('percentual')
  const [value, setValue] = useState(0)
  const [feedback, setFeedback] = useState('')
  const preview = calcularDescontoComercialDinheiro({ subtotal, modo: mode, valor: value })
  const temDesconto = descontoPercentualAtual > 0

  function aplicarRapido() {
    setMode('percentual')
    setValue(DESCONTO_COMERCIAL_DINHEIRO_MAX_PCT)
    onSolicitar(DESCONTO_COMERCIAL_DINHEIRO_MAX_PCT)
  }

  function aplicar() {
    const result = calcularDescontoComercialDinheiro({ subtotal, modo: mode, valor: value })
    if (!result.ok || result.percentual <= 0) {
      setFeedback(t.error)
      return
    }
    setFeedback('')
    onSolicitar(result.percentual)
  }

  return (
    <details
      className="rounded-lg border border-slate-400 bg-white p-3"
      data-testid="caixa-desconto-comercial-dinheiro"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-blue-800 [&::-webkit-details-marker]:hidden">
        <BadgePercent className="h-5 w-5 shrink-0" aria-hidden />
        <span className="flex-1">{t.title}</span>
        {temDesconto ? (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-900">
            {descontoPercentualAtual.toFixed(0)}% {t.badgeApplied}
          </span>
        ) : null}
      </summary>
      <fieldset disabled={disabled} className="mt-3 grid gap-2">
        <p className="text-sm text-slate-700">{t.help}</p>
        <button
          type="button"
          className="min-h-[48px] rounded-lg bg-blue-800 px-3 text-[16px] font-semibold text-white disabled:opacity-50"
          onClick={aplicarRapido}
        >
          {t.quick}
        </button>
        <label className="text-sm font-semibold text-slate-800">
          {t.mode}
          <select
            className="mt-1 min-h-[42px] w-full rounded border border-slate-400 p-2 text-[16px]"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as 'percentual' | 'valor')
              setValue(0)
            }}
          >
            <option value="percentual">{t.percent}</option>
            <option value="valor">{t.amount}</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-800">
          {mode === 'percentual' ? t.percent : t.amount}
          <CaixaMoneyInput
            className="mt-1 w-full rounded border border-slate-400 p-2 text-[16px] font-semibold"
            value={value}
            onValueChange={setValue}
            data-caixa-atalho-bloqueado="true"
          />
        </label>
        <dl className="grid gap-1 rounded border border-slate-300 bg-slate-50 p-2 text-[15px]">
          <div className="flex justify-between gap-2">
            <dt>{t.subtotal}</dt>
            <dd>R$ {formatDecimalBRL(subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-2 font-semibold text-blue-900">
            <dt>{t.desconto}</dt>
            <dd>
              R$ {formatDecimalBRL(preview.descontoValor)} ({preview.percentual.toFixed(2)}%)
            </dd>
          </div>
          <div className="flex justify-between gap-2 text-[16px] font-bold">
            <dt>{t.total}</dt>
            <dd>R$ {formatDecimalBRL(preview.totalFinal)}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-[42px] flex-1 rounded bg-[var(--color-brand)] px-3 text-[15px] font-semibold text-white disabled:opacity-50"
            disabled={value <= 0}
            onClick={aplicar}
          >
            {t.apply}
          </button>
          {temDesconto ? (
            <button
              type="button"
              className="min-h-[42px] rounded border border-slate-500 px-3 text-[15px] font-semibold"
              onClick={onLimpar}
            >
              {t.clear}
            </button>
          ) : null}
        </div>
        {feedback ? (
          <p role="alert" className="text-sm font-semibold text-red-700">
            {feedback}
          </p>
        ) : null}
        {!feedback && temDesconto ? (
          <p role="status" className="text-sm font-semibold text-blue-900">
            {t.applied}
          </p>
        ) : null}
      </fieldset>
    </details>
  )
}
