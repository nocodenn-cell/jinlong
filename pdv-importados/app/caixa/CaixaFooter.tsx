"use client"

import { memo } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { ImperialSealIcon } from "@/components/icons/ImperialSealIcon"
import { cn } from "@/lib/utils"
import { formatDecimalBRL } from "@/lib/format/money"

type Props = {
  m: Mensagens
  idioma: Idioma
  totalItens: number
  totalUnidades: number
  gerenteValidadoAte: string | null
  descontoGerentePercentual: number
  maxDescontoGerentePercentual: number
  totalBruto: number
  totalDesconto: number
  /** Parcela do desconto total explicada por preço atacado automático (varejo − atacado). */
  economiaPrecoAtacadoAuto: number
  valorDescontoGerente: number
  totalLiquidoComGerente: number
  moedaPrefixo: string
}

function moneyLocale(idioma: Idioma) {
  if (idioma === "pt") return "pt-BR"
  return "zh-CN"
}

function timeLocale(idioma: Idioma) {
  return moneyLocale(idioma)
}

function CaixaFooterImpl({
  m,
  idioma,
  totalItens,
  totalUnidades,
  gerenteValidadoAte,
  descontoGerentePercentual,
  maxDescontoGerentePercentual,
  totalBruto,
  totalDesconto,
  economiaPrecoAtacadoAuto,
  valorDescontoGerente,
  totalLiquidoComGerente,
  moedaPrefixo,
}: Props) {
  const resumoItens = caixaFmt(m.caixa.resumo_itens, {
    itens: totalItens,
    unidades: totalUnidades,
  })

  const gerenteLinha =
    gerenteValidadoAte &&
    caixaFmt(m.caixa.gerente_valido_ate, {
      hora: new Date(gerenteValidadoAte).toLocaleTimeString(timeLocale(idioma)),
      pct: descontoGerentePercentual.toFixed(2),
      max: maxDescontoGerentePercentual.toFixed(2),
    })

  return (
    <footer
      className={cn(
        "shrink-0 border-t backdrop-blur-sm px-4 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-10",
        "border-border bg-jl-surface-elev text-jl-fg-1 shadow-sm",
      )}
    >
      <div className="flex flex-col gap-3 text-sm md:flex-row md:flex-wrap md:items-end md:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <span className="text-sm text-jl-fg-2">{resumoItens}</span>
          {gerenteLinha && (
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-jl-fg-1">
              <ImperialSealIcon
                className="h-5 w-5 shrink-0 text-jl-fg-2"
                title={m.caixa.aria_selo_gerente}
              />
              {gerenteLinha}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-end justify-start gap-4 sm:gap-6 md:justify-end">
          <div className="text-left text-xs font-semibold uppercase tracking-wide text-jl-fg-3 md:hidden w-full">
            {m.caixa.bloco_resumo_financeiro}
          </div>
          <div className="text-right text-sm text-jl-fg-2">
            <div>{m.caixa.bruto}</div>
            <div className="text-lg font-semibold tabular-nums text-jl-fg-1">
              {moedaPrefixo} {formatDecimalBRL(totalBruto)}
            </div>
          </div>
          <div className="text-right text-sm text-jl-fg-2">
            <div>{m.caixa.descontos_regras}</div>
            <div className="text-lg font-bold tabular-nums text-jl-fg-1">
              - {moedaPrefixo} {formatDecimalBRL(totalDesconto)}
            </div>
            {economiaPrecoAtacadoAuto > 0.005 && (
              <div className="text-xs font-normal text-jl-fg-3 mt-0.5 max-w-56 ml-auto">
                {caixaFmt(m.caixa.economia_atacado_por_quantidade, {
                  valor: formatDecimalBRL(economiaPrecoAtacadoAuto),
                })}
              </div>
            )}
          </div>
          {descontoGerentePercentual > 0 && (
            <div className="text-right text-sm text-jl-fg-2">
              <div>
                {caixaFmt(m.caixa.desconto_gerente_label, {
                  pct: descontoGerentePercentual.toFixed(2),
                })}
              </div>
              <div className="text-lg font-bold tabular-nums text-jl-fg-1">
                - {moedaPrefixo} {formatDecimalBRL(valorDescontoGerente)}
              </div>
            </div>
          )}
          <div className="text-right min-w-28">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-jl-fg-3">
              {m.caixa.total_pagar}
            </div>
            <div
              data-testid="caixa-total-liquido"
              data-total-liquido={totalLiquidoComGerente.toFixed(2)}
              className="text-2xl font-extrabold leading-none tabular-nums text-amber-400"
            >
              {moedaPrefixo} {formatDecimalBRL(totalLiquidoComGerente)}
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export const CaixaFooter = memo(CaixaFooterImpl)
