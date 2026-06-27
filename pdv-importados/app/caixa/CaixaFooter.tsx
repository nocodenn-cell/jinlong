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
          "shrink-0 border-t backdrop-blur-sm px-4 sm:px-6 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-10",
          "border-gray-200 bg-white text-gray-900 shadow-sm",
        )}
      >
        <div className="flex flex-col gap-2 text-sm md:flex-row md:flex-wrap md:items-center md:justify-between">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <span className="text-sm font-medium text-gray-700">{resumoItens}</span>
            {gerenteLinha && (
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-600">
                <ImperialSealIcon
                  className="h-4 w-4 shrink-0 text-amber-600"
                  title={m.caixa.aria_selo_gerente}
                />
                {gerenteLinha}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-start gap-3 sm:gap-4 md:justify-end">
            <div className="text-right text-sm text-gray-600">
              <div className="text-xs uppercase tracking-wide font-medium">{m.caixa.bruto}</div>
              <div className="text-base font-semibold tabular-nums text-gray-900">
                {moedaPrefixo} {formatDecimalBRL(totalBruto)}
              </div>
            </div>
            <div className="text-right text-sm text-gray-600">
              <div className="text-xs uppercase tracking-wide font-medium">{m.caixa.descontos_regras}</div>
              <div className="text-base font-bold tabular-nums text-amber-600">
                - {moedaPrefixo} {formatDecimalBRL(totalDesconto)}
              </div>
            </div>
            {descontoGerentePercentual > 0 && (
              <div className="text-right text-sm text-gray-600">
                <div className="text-xs uppercase tracking-wide font-medium">
                  {caixaFmt(m.caixa.desconto_gerente_label, {
                    pct: descontoGerentePercentual.toFixed(2),
                  })}
                </div>
                <div className="text-base font-bold tabular-nums text-amber-600">
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
    <footer className="shrink-0 border-t border-gray-200 backdrop-blur-sm px-4 sm:px-6 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-10 bg-white">
      {showCollapsed && (
        <div className="flex items-center justify-between gap-2 mb-2">
          <button
            type="button"
            onClick={() => onToggleSummaryCollapse?.()}
            className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900 transition-colors"
            aria-expanded={!summaryCollapsed}
            aria-label={m.caixa.atalho_expandir_resumo || "Expandir resumo financeiro"}
          >
            <ChevronDown className="h-4 w-4 transform transition-transform" style={{ transform: "rotate(-90deg)" }} />
            <span className="font-medium text-gray-900">
              {m.caixa.total_pagar}: {moedaPrefixo} {formatDecimalBRL(totalLiquidoComGerente)}
            </span>
          </button>
        </div>
      )}

      <div className={cn(
        "flex flex-col gap-3 md:flex-row md:items-center md:justify-between text-sm transition-all duration-200",
        showCollapsed ? "hidden" : ""
      )}>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <span className="text-sm font-medium text-gray-700">{resumoItens}</span>
          {gerenteLinha && (
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-600">
              <ImperialSealIcon
                className="h-4 w-4 shrink-0 text-amber-600"
                title={m.caixa.aria_selo_gerente}
              />
              {gerenteLinha}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 md:gap-4">
          <button
            type="button"
            onClick={() => onToggleSummaryCollapse?.()}
            className="group inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-600 hover:text-gray-900 transition-colors"
            aria-expanded={!summaryCollapsed}
            aria-label={m.caixa.atalho_recolher_resumo || "Recolher resumo financeiro"}
          >
            {m.caixa.bloco_resumo_financeiro}
            <ChevronDown className="h-3 w-3 transform transition-transform group-hover:translate-y-0.5" />
          </button>
          <div className="text-right text-sm text-gray-600">
            <div className="text-xs uppercase font-medium">{m.caixa.bruto}</div>
            <div className="text-lg font-semibold tabular-nums text-gray-900">
              {moedaPrefixo} {formatDecimalBRL(totalBruto)}
            </div>
          </div>
          <div className="text-right text-sm text-gray-600">
            <div className="text-xs uppercase font-medium">{m.caixa.descontos_regras}</div>
            <div className="text-lg font-bold tabular-nums text-amber-600">
              - {moedaPrefixo} {formatDecimalBRL(totalDesconto)}
            </div>
          </div>
          {descontoGerentePercentual > 0 && (
            <div className="text-right text-sm text-gray-600">
              <div className="text-xs uppercase font-medium">
                {caixaFmt(m.caixa.desconto_gerente_label, {
                  pct: descontoGerentePercentual.toFixed(2),
                })}
              </div>
              <div className="text-lg font-bold tabular-nums text-amber-600">
                - {moedaPrefixo} {formatDecimalBRL(valorDescontoGerente)}
              </div>
            </div>
          )}
          {metodoPagamentoPanel ? (
            <div className="w-full min-w-[12rem] max-w-md">{metodoPagamentoPanel}</div>
          ) : null}
          <div className="text-right min-w-[6rem]">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              {m.caixa.total_pagar}
            </div>
            <div
              data-testid="caixa-total-liquido"
              data-total-liquido={totalLiquidoComGerente.toFixed(2)}
              className="text-2xl sm:text-3xl font-extrabold leading-none tabular-nums text-amber-600"
            >
              {moedaPrefixo} {formatDecimalBRL(totalLiquidoComGerente)}
            </div>
          </div>
          <div className="pl-1">
            <Button
              type="button"
              className="bg-amber-600 text-white hover:bg-amber-700 h-10 min-w-[9rem] text-sm font-bold rounded-md"
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
