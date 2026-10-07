'use client'

import type { ReactNode } from 'react'
import type { Mensagens } from '@/i18n/getMessages'
import { formatDecimalBRL } from '@/lib/format/money'
import { Button } from '@/components/ui/button'

type Props = {
  m: Mensagens
  moedaPrefixo: string
  subtotal: number
  descontoTotal: number
  totalFinal: number
  valorRecebido?: number | null
  troco?: number | null
  descontoPercentual?: number
  onAbrirDesconto: () => void
  onFinalizar: () => void
  finalizando: boolean
  finalizarDisabled: boolean
  metodoPagamentoPanel: ReactNode
  pagamentoExtra?: ReactNode
}

/**
 * Coluna direita — totais em destaque + formas de pagamento + finalizar.
 */
export function CaixaCheckoutTotaisPanel({
  m,
  moedaPrefixo,
  subtotal,
  descontoTotal,
  totalFinal,
  valorRecebido = null,
  troco = null,
  descontoPercentual = 0,
  onAbrirDesconto,
  onFinalizar,
  finalizando,
  finalizarDisabled,
  metodoPagamentoPanel,
  pagamentoExtra,
}: Props) {
  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-3"
      data-testid="caixa-checkout-totais"
      id="caixa-pdv-panel-pgto"
      tabIndex={-1}
      aria-label={m.caixa.pdv_tab_aria_pgto}
    >
      <div className="space-y-1.5 rounded-lg border border-border/70 bg-muted/20 p-3">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="text-muted-foreground">{m.caixa.bruto}</span>
          <span className="tabular-nums font-semibold">
            {moedaPrefixo} {formatDecimalBRL(subtotal)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {m.caixa.desconto}
            {descontoPercentual > 0 ? ` (${descontoPercentual.toFixed(1)}%)` : ''}
          </span>
          <span className="tabular-nums font-semibold text-primary">
            − {moedaPrefixo} {formatDecimalBRL(descontoTotal)}
          </span>
        </div>
        <div className="border-t border-border pt-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {m.caixa.cart_bar_total_label}
          </div>
          <div
            data-testid="caixa-total-liquido"
            data-total-liquido={totalFinal.toFixed(2)}
            className="text-right text-4xl font-black tabular-nums leading-none text-foreground"
          >
            {moedaPrefixo} {formatDecimalBRL(totalFinal)}
          </div>
        </div>
        {valorRecebido != null && valorRecebido > 0 ? (
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{m.caixa.pdv_pgto_valor_recebido}</span>
            <span className="tabular-nums font-semibold">
              {moedaPrefixo} {formatDecimalBRL(valorRecebido)}
            </span>
          </div>
        ) : null}
        {troco != null && troco > 0 ? (
          <div
            data-testid="caixa-troco-destaque"
            className="flex items-baseline justify-between gap-2 rounded-md bg-success/10 px-2 py-1.5"
          >
            <span className="text-sm font-medium text-success">{m.caixa.pdv_pgto_troco_cliente}</span>
            <span className="text-xl font-black tabular-nums text-success">
              {moedaPrefixo} {formatDecimalBRL(troco)}
            </span>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onAbrirDesconto}
        data-testid="caixa-abrir-desconto"
        className="w-full rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary/10"
      >
        F3 — Aplicar desconto
      </button>

      <div className="shrink-0">{metodoPagamentoPanel}</div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">{pagamentoExtra}</div>

      <Button
        type="button"
        data-testid="caixa-finalizar-primario"
        className="mt-auto min-h-14 w-full text-base font-black tracking-wide"
        onClick={onFinalizar}
        disabled={finalizarDisabled || finalizando}
      >
        {finalizando ? m.caixa.finalizando : `${m.caixa.finalizar} (Enter / F9)`}
      </Button>
    </section>
  )
}
