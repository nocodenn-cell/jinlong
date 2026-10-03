"use client"

import { Button } from "@/components/ui/button"
import type { Mensagens } from "@/i18n/getMessages"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { formatDecimalBRL } from "@/lib/format/money"

type Props = {
  m: Mensagens
  onExcluirVenda: () => void
  onFinalizar: () => void
  finalizando: boolean
  movimentandoCaixa: boolean
  caixaAberto: boolean
  /** Estado conhecido FECHADO (não vale para carregando/erro): exibe a faixa com "Abrir caixa". */
  caixaFechado?: boolean
  onAbrirCaixa?: () => void
  abrindoCaixa?: boolean
  itensLength: number
  buscando: boolean
  carregandoRegras: boolean
  totalLiquidoComGerente: number
  totalBruto?: number
  totalDesconto?: number
  valorDescontoGerente?: number
  /** Percentual efetivo do desconto de gerente — só rotula a linha do resumo. */
  descontoGerentePercentual?: number
  moedaPrefixo: string
}

export function CaixaPdvCartSaleBar({
  m,
  onExcluirVenda,
  onFinalizar,
  finalizando,
  movimentandoCaixa,
  caixaAberto,
  caixaFechado = false,
  onAbrirCaixa,
  abrindoCaixa = false,
  itensLength,
  buscando,
  carregandoRegras,
  totalLiquidoComGerente,
  totalBruto = 0,
  totalDesconto = 0,
  valorDescontoGerente = 0,
  descontoGerentePercentual = 0,
  moedaPrefixo,
}: Props) {
  const excluirDisabled =
    !caixaAberto || movimentandoCaixa || finalizando || carregandoRegras

  const hasDesconto = totalDesconto > 0
  const hasDescontoGerente = valorDescontoGerente > 0.005

  return (
    <div
      className="shrink-0 border-t border-jl-border-1 bg-jl-surface-elev px-3 py-3 shadow-[0_2px_3px_0px_rgba(0,0,0,0.2)] sm:px-4"
      data-caixa-cart-sale-bar
    >
      <div className="flex flex-col gap-3">
        {caixaFechado ? (
          <div
            role="alert"
            data-testid="caixa-fechado-faixa"
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-warning-strong)] bg-jl-surface-soft px-3 py-2"
          >
            <span className="text-sm font-semibold text-jl-fg-1">{m.caixa.caixa_fechado_faixa}</span>
            {onAbrirCaixa ? (
              <Button
                type="button"
                className="min-h-11 bg-jl-accent px-5 font-bold text-white hover:bg-jl-accent/90"
                onClick={onAbrirCaixa}
                disabled={abrindoCaixa}
              >
                {m.caixa.abrir}
              </Button>
            ) : null}
          </div>
        ) : null}
        {/* Linha 1: total sempre inteiro e legível, sem competir por espaço com os botões. */}
        <div className="text-right">
          <div className="text-xs font-semibold uppercase tracking-wide text-jl-fg-3">
            {m.caixa.cart_bar_total_label}
          </div>

          <div
            data-testid="caixa-total-liquido"
            data-total-liquido={totalLiquidoComGerente.toFixed(2)}
            className="whitespace-nowrap text-4xl font-black tabular-nums leading-tight text-jl-fg-1"
          >
            {moedaPrefixo} {formatDecimalBRL(totalLiquidoComGerente)}
          </div>

          {(hasDesconto || hasDescontoGerente) && (
            <div className="mt-0.5 flex flex-col items-end gap-0.5 text-xs text-jl-fg-3">
              <div className="flex justify-end gap-2">
                <span>{m.caixa.bruto}</span>
                <span className="tabular-nums">
                  {moedaPrefixo} {formatDecimalBRL(totalBruto)}
                </span>
              </div>
              {hasDesconto && (
                <div className="flex justify-end gap-2">
                  <span>{m.caixa.descontos_regras}</span>
                  <span className="tabular-nums text-[var(--color-warning-strong)]">
                    -{moedaPrefixo} {formatDecimalBRL(totalDesconto)}
                  </span>
                </div>
              )}
              {hasDescontoGerente && (
                <div className="flex justify-end gap-2">
                  <span>
                    {caixaFmt(m.caixa.desconto_gerente_label, {
                      pct: descontoGerentePercentual.toFixed(2),
                    })}
                  </span>
                  <span className="tabular-nums text-[var(--color-warning-strong)]">
                    -{moedaPrefixo} {formatDecimalBRL(valorDescontoGerente)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Linha 2: ação destrutiva (secundária, à esquerda) separada da principal (à direita). */}
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 shrink-0 border-jl-border-1 bg-jl-surface-soft text-jl-fg-2 hover:bg-jl-surface-soft/80 hover:text-jl-fg-1"
            onClick={onExcluirVenda}
            disabled={excluirDisabled}
          >
            {m.caixa.cart_bar_excluir_venda}
          </Button>

          <Button
            type="button"
            className="h-14 min-w-[11rem] shrink-0 bg-jl-accent px-8 text-base font-bold text-white shadow-sm hover:bg-jl-accent/90 disabled:opacity-60"
            onClick={onFinalizar}
            disabled={
              finalizando || itensLength === 0 || buscando || carregandoRegras
            }
            aria-busy={finalizando}
          >
            {m.caixa.finalizar_venda}
          </Button>
        </div>
      </div>
    </div>
  )
}