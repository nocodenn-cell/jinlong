"use client"

import { Button } from "@/components/ui/button"
import type { Mensagens } from "@/i18n/getMessages"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { CAIXA_ATALHOS } from "@/app/caixa/caixaAtalhos"
import { formatDecimalBRL } from "@/lib/format/money"

/**
 * Tecla exibida dentro do próprio botão.
 *
 * `aria-hidden` de propósito: o leitor de tela já anuncia a ação pelo rótulo, e
 * ler "F4 barra F9" junto atrapalharia mais do que ajuda. Quem navega por
 * teclado descobre os atalhos pela referência (F1), que é acessível.
 */
function KbdAtalho({ children, onBrand }: { children: string; onBrand?: boolean }) {
  return (
    <kbd
      aria-hidden
      className={`ml-2 hidden rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none sm:inline-block ${
        onBrand
          ? "border-white/30 bg-white/15 text-white/90"
          : "border-jl-border-1 bg-jl-surface-soft text-jl-fg-3"
      }`}
    >
      {children}
    </kbd>
  )
}

type Props = {
  m: Mensagens
  onExcluirVenda: () => void
  onFinalizar: () => void
  finalizando: boolean
  movimentandoCaixa: boolean
  caixaAberto: boolean
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 border-jl-border-1 bg-jl-surface-soft text-jl-fg-2 hover:bg-jl-surface-soft/80 hover:text-jl-fg-1"
              onClick={onExcluirVenda}
              disabled={excluirDisabled}
            >
              {m.caixa.cart_bar_excluir_venda}
              <KbdAtalho>{CAIXA_ATALHOS.excluirVenda}</KbdAtalho>
            </Button>
          </div>

          <div className="flex flex-1 flex-col gap-2 min-w-0 sm:flex-row sm:items-end sm:justify-end sm:gap-6">
            <div className="text-right sm:min-w-[9rem]">
              <div className="text-xs font-semibold uppercase tracking-wide text-jl-fg-3">
                {m.caixa.cart_bar_total_label}
              </div>

              <div
                data-testid="caixa-total-liquido"
                data-total-liquido={totalLiquidoComGerente.toFixed(2)}
                className="text-4xl font-black tabular-nums leading-tight text-jl-fg-1"
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
              <KbdAtalho onBrand>{CAIXA_ATALHOS.finalizarVenda}</KbdAtalho>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}