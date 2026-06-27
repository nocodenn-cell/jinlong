"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import type { Mensagens } from "@/i18n/getMessages"
import { formatDecimalBRL } from "@/lib/format/money"

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
  moedaPrefixo: string
  metodoPagamentoPanel?: ReactNode
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
  moedaPrefixo,
  metodoPagamentoPanel,
}: Props) {
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
            >
              {m.caixa.cart_bar_excluir_venda}
            </Button>
          </div>

          <div className="flex flex-1 flex-col gap-2 min-w-0 sm:flex-row sm:items-end sm:justify-end sm:gap-6">
            <Accordion type="single" collapsible defaultValue={itensLength > 0 ? "resumo" : undefined} className="flex-1">
              <AccordionItem value="resumo" className="border-0">
                <AccordionTrigger className="text-right hover:no-underline sm:min-w-[9rem] py-0 px-0 [&[data-state=open]>svg]:rotate-180">
                  <div className="flex flex-col items-end gap-1 w-full">
                    <div className="text-xs font-semibold uppercase tracking-wide text-jl-fg-3">
                      {m.caixa.cart_bar_total_label}
                    </div>
                    <div className="text-3xl font-black tabular-nums leading-tight text-jl-fg-1">
                      {moedaPrefixo} {formatDecimalBRL(totalLiquidoComGerente)}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2">
                  {hasDesconto && (
                    <div className="flex flex-col gap-2 text-xs text-jl-fg-3">
                      <div className="flex justify-end gap-4">
                        <span>Total Bruto:</span>
                        <span className="font-semibold min-w-[5rem] text-right">
                          {moedaPrefixo} {formatDecimalBRL(totalBruto)}
                        </span>
                      </div>
                      <div className="flex justify-end gap-4">
                        <span>Desconto:</span>
                        <span className="font-semibold min-w-[5rem] text-right text-amber-400/80">
                          -{moedaPrefixo} {formatDecimalBRL(totalDesconto)}
                        </span>
                      </div>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

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
    </div>
  )
}