"use client"

import { memo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { ImperialSealIcon } from "@/components/icons/ImperialSealIcon"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDecimalBRL } from "@/lib/format/money"

export type CaixaFooterLayout = "full" | "classic_summary"

type Props = {
  m: Mensagens
  idioma: Idioma
  /** `classic_summary`: apenas resumo financeiro (PDV clássico — total e finalizar ficam na coluna do carrinho). */
  layout?: CaixaFooterLayout
  onFinalizar: () => void
  finalizando: boolean
  itensLength: number
  buscando: boolean
  carregandoRegras: boolean
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
  /** Layout padrão: seletor de forma de pagamento acima do botão finalizar. */
  metodoPagamentoPanel?: ReactNode
  /** Collapse state for financial summary (only in default layout) */
  summaryCollapsed?: boolean
  onToggleSummaryCollapse?: () => void
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
  layout = "full",
  onFinalizar,
  finalizando,
  itensLength,
  buscando,
  carregandoRegras,
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
  metodoPagamentoPanel,
  summaryCollapsed = false,
  onToggleSummaryCollapse,
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

  if (layout === "classic_summary") {
    return (
      <footer
        className={cn(
          "shrink-0 border-t backdrop-blur-sm px-4 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-10",
          "border-border bg-primary text-primary-foreground shadow-[0_2px_3px_0px_rgba(0,0,0,0.2)]",
        )}
      >
        <div className="flex flex-col gap-3 text-sm md:flex-row md:flex-wrap md:items-end md:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <span className="text-sm text-primary-foreground/90">{resumoItens}</span>
            {gerenteLinha && (
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary-foreground">
                <ImperialSealIcon
                  className="h-5 w-5 shrink-0 text-primary-foreground/80 drop-shadow-[0_0_1px_rgba(0,0,0,0.5)]"
                  title={m.caixa.aria_selo_gerente}
                />
                {gerenteLinha}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-end justify-start gap-4 sm:gap-6 md:justify-end">
            <div className="text-left text-xs font-semibold uppercase tracking-wide text-primary-foreground/85 md:hidden w-full">
              {m.caixa.bloco_resumo_financeiro}
            </div>
            <div className="text-right text-sm text-primary-foreground/90">
              <div>{m.caixa.bruto}</div>
              <div className="text-lg font-semibold tabular-nums text-white">
                {moedaPrefixo} {formatDecimalBRL(totalBruto)}
              </div>
            </div>
            <div className="text-right text-sm text-primary-foreground/90">
              <div>{m.caixa.descontos_regras}</div>
              <div className="text-lg font-bold tabular-nums text-white">
                - {moedaPrefixo} {formatDecimalBRL(totalDesconto)}
              </div>
              {economiaPrecoAtacadoAuto > 0.005 && (
                <div className="text-xs font-normal text-primary-foreground/75 mt-0.5 max-w-[14rem] ml-auto">
                  {caixaFmt(m.caixa.economia_atacado_por_quantidade, {
                    valor: formatDecimalBRL(economiaPrecoAtacadoAuto),
                  })}
                </div>
              )}
            </div>
            {descontoGerentePercentual > 0 && (
              <div className="text-right text-sm text-primary-foreground/90">
                <div>
                  {caixaFmt(m.caixa.desconto_gerente_label, {
                    pct: descontoGerentePercentual.toFixed(2),
                  })}
                </div>
                <div className="text-lg font-bold tabular-nums text-white">
                  - {moedaPrefixo} {formatDecimalBRL(valorDescontoGerente)}
                </div>
              </div>
            )}
          </div>
        </div>
      </footer>
    )
  }

  const shouldShowSummary = itensLength > 0
  const showCollapsed = summaryCollapsed && shouldShowSummary

  return (
    <footer className="shrink-0 border-t border-jl-border-1 backdrop-blur-sm px-4 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-10 bg-jl-surface-elev">
      {showCollapsed && (
        <div className="flex items-center justify-between gap-2 mb-2">
          <button
            type="button"
            onClick={onToggleSummaryCollapse}
            className="flex items-center gap-2 text-xs text-jl-fg-3 hover:text-jl-fg-2 transition-colors"
            aria-expanded={!summaryCollapsed}
            aria-label={m.caixa.atalho_expandir_resumo || "Expandir resumo financeiro"}
          >
            <ChevronDown className="h-4 w-4 transform transition-transform" style={{ transform: "rotate(-90deg)" }} />
            <span className="font-medium">
              {m.caixa.total_pagar}: {moedaPrefixo} {formatDecimalBRL(totalLiquidoComGerente)}
            </span>
          </button>
        </div>
      )}

      <div className={cn(
        "flex flex-col gap-4 md:flex-row md:items-end md:justify-between text-sm transition-all duration-200",
        showCollapsed ? "hidden" : ""
      )}>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <span className="text-sm text-jl-fg-2">{resumoItens}</span>
          {gerenteLinha && (
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-400">
              <ImperialSealIcon
                className="h-5 w-5 shrink-0 text-amber-400"
                title={m.caixa.aria_selo_gerente}
              />
              {gerenteLinha}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-end gap-4 sm:gap-6 md:gap-8">
          <button
            type="button"
            onClick={onToggleSummaryCollapse}
            className="group inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-jl-fg-3 hover:text-jl-fg-2 transition-colors"
            aria-expanded={!summaryCollapsed}
            aria-label={m.caixa.atalho_recolher_resumo || "Recolher resumo financeiro"}
          >
            {m.caixa.bloco_resumo_financeiro}
            <ChevronDown className="h-3 w-3 transform transition-transform group-hover:translate-y-0.5" />
          </button>
          <div className="text-right text-sm text-jl-fg-2">
            <div>{m.caixa.bruto}</div>
            <div className="text-lg font-semibold tabular-nums text-jl-fg-1">
              {moedaPrefixo} {formatDecimalBRL(totalBruto)}
            </div>
          </div>
          <div className="text-right text-sm text-amber-400">
            <div>{m.caixa.descontos_regras}</div>
            <div className="text-lg font-bold tabular-nums">
              - {moedaPrefixo} {formatDecimalBRL(totalDesconto)}
            </div>
            {economiaPrecoAtacadoAuto > 0.005 && (
              <div className="text-xs font-normal text-jl-fg-3 mt-0.5 max-w-[14rem] ml-auto">
                {caixaFmt(m.caixa.economia_atacado_por_quantidade, {
                  valor: formatDecimalBRL(economiaPrecoAtacadoAuto),
                })}
              </div>
            )}
          </div>
          {descontoGerentePercentual > 0 && (
            <div className="text-right text-sm text-amber-400">
              <div>
                {caixaFmt(m.caixa.desconto_gerente_label, {
                  pct: descontoGerentePercentual.toFixed(2),
                })}
              </div>
              <div className="text-lg font-bold tabular-nums">
                - {moedaPrefixo} {formatDecimalBRL(valorDescontoGerente)}
              </div>
            </div>
          )}
          {metodoPagamentoPanel ? (
            <div className="w-full min-w-[12rem] max-w-md">{metodoPagamentoPanel}</div>
          ) : null}
          {/* #12: total dominante — eyebrow uppercase tracked-out + número maior
              p/ não competir com bruto/descontos (que já estão adjacentes). */}
          <div className="text-right min-w-[7rem]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-jl-fg-3">
              {m.caixa.total_pagar}
            </div>
            <div
              data-testid="caixa-total-liquido"
              data-total-liquido={totalLiquidoComGerente.toFixed(2)}
              className="text-3xl sm:text-4xl font-extrabold leading-none tabular-nums text-amber-400"
            >
              {moedaPrefixo} {formatDecimalBRL(totalLiquidoComGerente)}
            </div>
          </div>
          <div className="pl-1">
            <Button
              type="button"
              className="app-btn-accent h-11 min-w-[11rem] text-base font-bold"
              onClick={onFinalizar}
              disabled={
                finalizando || itensLength === 0 || buscando || carregandoRegras
              }
              aria-busy={finalizando}
              aria-keyshortcuts="F9 F4"
            >
              {finalizando ? m.caixa.finalizando : m.caixa.finalizar_venda}
            </Button>
          </div>
        </div>
      </div>
    </footer>
  )
}

export const CaixaFooter = memo(CaixaFooterImpl)
