"use client"

import { memo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { ImperialSealIcon } from "@/components/icons/ImperialSealIcon"
import { cn } from "@/lib/utils"

export type CaixaFooterLayout = "full" | "classic_summary"

type Props = {
  m: Mensagens
  idioma: Idioma
  /** `classic_summary`: apenas resumo financeiro (PDV clássico — total e finalizar ficam na coluna do carrinho). */
  layout?: CaixaFooterLayout
  onValidarGerente: () => void
  onAbrirSuprimento: () => void
  onAbrirSangria: () => void
  onFinalizar: () => void
  validandoGerente: boolean
  finalizando: boolean
  movimentandoCaixa: boolean
  caixaAberto: boolean
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
  valorDescontoGerente: number
  totalLiquidoComGerente: number
  moedaPrefixo: string
  /** Layout padrão: seletor de forma de pagamento acima do botão finalizar. */
  metodoPagamentoPanel?: ReactNode
}

function moneyLocale(idioma: Idioma) {
  if (idioma === "pt") return "pt-BR"
  return "zh-CN"
}

function timeLocale(idioma: Idioma) {
  return moneyLocale(idioma)
}

export const CaixaFooter = memo(function CaixaFooter({
  m,
  idioma,
  layout = "full",
  onValidarGerente,
  onAbrirSuprimento,
  onAbrirSangria,
  onFinalizar,
  validandoGerente,
  finalizando,
  movimentandoCaixa,
  caixaAberto,
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
  valorDescontoGerente,
  totalLiquidoComGerente,
  moedaPrefixo,
  metodoPagamentoPanel,
}: Props) {
  const loc = moneyLocale(idioma)
  const fmt = (n: number) =>
    n.toLocaleString(loc, { minimumFractionDigits: 2 })

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
          "shrink-0 border-t transform-gpu px-4 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-10",
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
          {(totalDesconto > 0.005 || descontoGerentePercentual > 0) && (
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 tabular-nums text-sm">
              <span className="text-primary-foreground/80">
                {moedaPrefixo} {fmt(totalBruto)}
              </span>
              {totalDesconto > 0.005 && (
              <span className="font-semibold text-white">
                -{moedaPrefixo} {fmt(totalDesconto)}
              </span>
              )}
              {descontoGerentePercentual > 0 && (
                <span className="font-semibold text-white">
                  -{moedaPrefixo} {fmt(valorDescontoGerente)}
                  <span className="ml-1 text-[10px] opacity-70">
                    ({descontoGerentePercentual.toFixed(0)}%)
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      </footer>
    )
  }

  return (
    <footer className="shrink-0 border-t border-jl-border-1 transform-gpu px-4 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-10 bg-jl-surface-elev">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between text-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-jl-fg-3">{m.caixa.bloco_operacao_atual}</span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="border border-jl-border-1 bg-jl-surface-soft text-jl-fg-1 hover:bg-white/[0.06]"
                onClick={onAbrirSuprimento}
                disabled={!caixaAberto || movimentandoCaixa || finalizando}
                aria-busy={movimentandoCaixa}
                title="Ctrl+Shift+S"
              >
                {m.caixa.suprimento} (+)
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="border-destructive/45 bg-destructive/15 text-destructive hover:bg-destructive/25"
                onClick={onAbrirSangria}
                disabled={!caixaAberto || movimentandoCaixa || finalizando}
                aria-busy={movimentandoCaixa}
                title="Ctrl+Shift+R"
              >
                {m.caixa.sangria} (-)
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-jl-fg-3">{m.caixa.bloco_autorizacao}</span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="inline-flex items-center gap-2 border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                onClick={onValidarGerente}
                disabled={validandoGerente || movimentandoCaixa}
                aria-busy={validandoGerente}
              >
                {!gerenteValidadoAte ? (
                  <ImperialSealIcon
                    className="h-4 w-4 shrink-0 text-amber-400"
                    title={m.caixa.aria_selo_gerente}
                    pulse
                  />
                ) : null}
                {validandoGerente
                  ? m.caixa.validando_gerente
                  : m.caixa.validar_gerente}
              </Button>
            </div>
          </div>
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

        <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-4">
          {/* Resumo financeiro compacto — aparece quando há desconto de item ou de gerente */}
          {(totalDesconto > 0.005 || descontoGerentePercentual > 0) && (
            <div className="flex items-center gap-3 text-sm tabular-nums text-jl-fg-3">
              <span>{moedaPrefixo} {fmt(totalBruto)}</span>
              {totalDesconto > 0.005 && (
              <span className="text-amber-400/90 font-medium">
                -{moedaPrefixo} {fmt(totalDesconto)}
              </span>
              )}
              {descontoGerentePercentual > 0 && (
                <span className="text-amber-400/90 font-medium">
                  -{moedaPrefixo} {fmt(valorDescontoGerente)}
                  <span className="ml-1 text-[10px] opacity-70">
                    ({descontoGerentePercentual.toFixed(0)}%)
                  </span>
                </span>
              )}
            </div>
          )}
          {metodoPagamentoPanel ? (
            <div className="w-full min-w-[12rem] max-w-md">{metodoPagamentoPanel}</div>
          ) : null}
          <div
            data-testid="caixa-total-liquido"
            data-total-liquido={totalLiquidoComGerente.toFixed(2)}
            className="text-2xl sm:text-3xl font-extrabold tabular-nums text-amber-400 leading-none"
          >
            {moedaPrefixo} {fmt(totalLiquidoComGerente)}
          </div>
          <Button
            type="button"
            className="app-btn-accent h-11 min-w-[11rem] text-base font-bold"
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
    </footer>
  )
})
