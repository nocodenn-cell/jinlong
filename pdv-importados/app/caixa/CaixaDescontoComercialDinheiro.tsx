'use client'

import { useState } from 'react'
import { BadgePercent, ChevronDown } from 'lucide-react'
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
      className="group rounded-lg border border-jl-border-1 bg-jl-surface-soft p-3"
      data-testid="caixa-desconto-comercial-dinheiro"
    >
      <summary className="flex h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-jl-fg-1 [&::-webkit-details-marker]:hidden">
        <BadgePercent className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="flex-1">{t.title}</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <p className="mt-1 text-xs leading-snug text-jl-fg-3">{t.help}</p>
      <fieldset disabled={disabled} className="mt-3 grid gap-2">
        <button
          type="button"
          className="h-10 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          onClick={aplicarRapido}
        >
          {t.quick}
        </button>
        <label className="text-xs font-medium text-jl-fg-2">
          {t.mode}
          <select
            className="mt-1 h-10 w-full rounded-md border border-jl-border-1 bg-jl-surface px-2 text-sm text-jl-fg-1"
            value={mode}
            onChange={(e) => { setMode(e.target.value as 'percentual' | 'valor'); setValue(0) }}
          >
            <option value="percentual">{t.percent}</option>
            <option value="valor">{t.amount}</option>
          </select>
        </label>
        <label className="text-xs font-medium text-jl-fg-2">
          {mode === 'percentual' ? t.percent : t.amount}
          <CaixaMoneyInput
            className="mt-1 h-10 w-full rounded-md border border-jl-border-1 bg-jl-surface px-2 text-sm font-semibold tabular-nums text-jl-fg-1"
            value={value}
            onValueChange={setValue}
            data-caixa-atalho-bloqueado="true"
          />
        </label>
        <dl className="grid gap-1 rounded-md border border-jl-border-1 bg-jl-surface p-2 text-sm">
          <div className="flex justify-between gap-2"><dt>{t.subtotal}</dt><dd>R$ {formatDecimalBRL(subtotal)}</dd></div>
          <div className="flex justify-between gap-2 font-semibold text-primary">
            <dt>{t.desconto}</dt>
            <dd>R$ {formatDecimalBRL(preview.descontoValor)} ({preview.percentual.toFixed(2)}%)</dd>
          </div>
          <div className="flex justify-between gap-2 text-base font-bold">
            <dt>{t.total}</dt>
            <dd>R$ {formatDecimalBRL(preview.totalFinal)}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="h-10 flex-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50" disabled={value <= 0} onClick={aplicar}>
            {t.apply}
          </button>
          {descontoPercentualAtual > 0 ? (
            <button type="button" className="h-10 rounded-md border border-jl-border-1 bg-jl-surface px-3 text-sm font-semibold text-jl-fg-1 hover:bg-jl-surface-soft" onClick={onLimpar}>
              {t.clear}
            </button>
          ) : null}
        </div>
        {feedback ? <p role="alert" className="text-xs font-semibold text-destructive">{feedback}</p> : null}
        {!feedback && descontoPercentualAtual > 0 ? (
          <p role="status" className="text-xs font-semibold text-primary">{t.applied}</p>
        ) : null}
      </fieldset>
    </details>
  )
}
