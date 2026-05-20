"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"

type Props = {
  m: Mensagens
  idioma: Idioma
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
  moedaPrefixo: string
  metodoPagamentoPanel?: ReactNode
}

function moneyLocale(idioma: Idioma) {
  if (idioma === "pt") return "pt-BR"
  return "zh-CN"
}

export function CaixaPdvCartSaleBar({
  m,
  idioma,
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
  moedaPrefixo,
  metodoPagamentoPanel,
}: Props) {
  const loc = moneyLocale(idioma)
  const fmt = (n: number) =>
    n.toLocaleString(loc, { minimumFractionDigits: 2 })

  const excluirDisabled =
    !caixaAberto || movimentandoCaixa || finalizando || carregandoRegras

  const hasDesconto = totalDesconto > 0

  return (
    <div
      className="shrink-0 border-t border-jl-border-1 bg-jl-surface-elev px-3 py-3 shadow-[0_2px_3px_0px_rgba(0,0,0,0.2)] sm:px-4"
      data-caixa-cart-sale-bar
    >
      <div className="flex flex-col gap-3">
        {metodoPagamentoPanel ? <div className="w-full">{metodoPagamentoPanel}</div> : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 border-jl-border-1 bg-jl-surface-soft text-jl-fg-2 hover:bg-jl-surface-soft/80 hover:text-jl-fg-1"
              onClick={onExcluirVenda}
              disabled={excluirDisabled}
              title={m.caixa.cart_bar_excluir_title}
              aria-label={m.caixa.cart_bar_excluir_aria}
            >
              {m.caixa.cart_bar_excluir_venda}
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
                className="text-3xl font-black tabular-nums leading-tight text-jl-fg-1"
              >
                {moedaPrefixo} {fmt(totalLiquidoComGerente)}
              </div>
              {hasDesconto && (
                <div className="mt-0.5 flex justify-end gap-3 text-xs text-jl-fg-3">
                  <span>
                    {m.caixa.cart_bar_total_label === "Total" ? "Bruto" : "毛额"}{" "}
                    {moedaPrefixo} {fmt(totalBruto)}
                  </span>
                  <span className="text-amber-400/80">
                    -{moedaPrefixo} {fmt(totalDesconto)}
                  </span>
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
              {finalizando ? m.caixa.finalizando : m.caixa.finalizar_venda}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
