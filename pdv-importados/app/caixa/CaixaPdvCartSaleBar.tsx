"use client"

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
  moedaPrefixo: string
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
  moedaPrefixo,
}: Props) {
  const loc = moneyLocale(idioma)
  const fmt = (n: number) =>
    n.toLocaleString(loc, { minimumFractionDigits: 2 })

  const excluirDisabled =
    !caixaAberto || movimentandoCaixa || finalizando || carregandoRegras

  return (
    <div
      className="shrink-0 border-t border-border bg-primary px-3 py-3 text-primary-foreground shadow-[0_2px_3px_0px_rgba(0,0,0,0.2)] sm:px-4"
      data-caixa-cart-sale-bar
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 border-primary-foreground/35 bg-white/10 text-primary-foreground hover:bg-white/20 hover:text-primary-foreground"
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
            <div className="text-xs font-semibold uppercase tracking-wide text-primary-foreground/85">
              {m.caixa.cart_bar_total_label}
            </div>
            <div
              data-testid="caixa-total-liquido"
              data-total-liquido={totalLiquidoComGerente.toFixed(2)}
              className="text-2xl font-extrabold tabular-nums leading-tight text-primary-foreground sm:text-3xl"
            >
              {moedaPrefixo} {fmt(totalLiquidoComGerente)}
            </div>
          </div>
          <Button
            type="button"
            className="h-11 min-w-[11rem] shrink-0 bg-secondary text-secondary-foreground text-base font-bold shadow-sm hover:bg-secondary/80"
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
  )
}
