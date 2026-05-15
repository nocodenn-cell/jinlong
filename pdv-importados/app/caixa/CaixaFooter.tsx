"use client"

import type { ReactNode } from "react"
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
  /** Parcela do desconto total explicada por preço atacado automático (varejo − atacado). */
  economiaPrecoAtacadoAuto: number
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

export function CaixaFooter({
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
  economiaPrecoAtacadoAuto,
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
          "shrink-0 border-t backdrop-blur-sm px-4 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-10",
          "border-blue-800/80 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 text-white shadow-sm",
        )}
      >
        <div className="flex flex-col gap-3 text-sm md:flex-row md:flex-wrap md:items-end md:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <span className="text-sm text-blue-100/90">{resumoItens}</span>
            {gerenteLinha && (
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-100">
                <ImperialSealIcon
                  className="h-5 w-5 shrink-0 text-amber-200 drop-shadow-[0_0_1px_rgba(0,0,0,0.5)]"
                  title={m.caixa.aria_selo_gerente}
                />
                {gerenteLinha}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-end justify-start gap-4 sm:gap-6 md:justify-end">
            <div className="text-left text-xs font-semibold uppercase tracking-wide text-blue-200/85 md:hidden w-full">
              {m.caixa.bloco_resumo_financeiro}
            </div>
            <div className="text-right text-sm text-blue-100/90">
              <div>{m.caixa.bruto}</div>
              <div className="text-lg font-semibold tabular-nums text-white">
                {moedaPrefixo} {fmt(totalBruto)}
              </div>
            </div>
            <div className="text-right text-sm text-sky-100">
              <div>{m.caixa.descontos_regras}</div>
              <div className="text-lg font-bold tabular-nums text-white">
                - {moedaPrefixo} {fmt(totalDesconto)}
              </div>
              {economiaPrecoAtacadoAuto > 0.005 && (
                <div className="text-xs font-normal text-blue-100/75 mt-0.5 max-w-[14rem] ml-auto">
                  {caixaFmt(m.caixa.economia_atacado_por_quantidade, {
                    valor: fmt(economiaPrecoAtacadoAuto),
                  })}
                </div>
              )}
            </div>
            {descontoGerentePercentual > 0 && (
              <div className="text-right text-sm text-sky-100">
                <div>
                  {caixaFmt(m.caixa.desconto_gerente_label, {
                    pct: descontoGerentePercentual.toFixed(2),
                  })}
                </div>
                <div className="text-lg font-bold tabular-nums text-white">
                  - {moedaPrefixo} {fmt(valorDescontoGerente)}
                </div>
              </div>
            )}
          </div>
        </div>
      </footer>
    )
  }

  return (
    <footer className="shrink-0 border-t border-border backdrop-blur-sm px-4 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-10 bg-card">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between text-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-foreground/80">{m.caixa.bloco_operacao_atual}</span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="bg-secondary text-secondary-foreground border border-border"
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
            <span className="text-xs font-semibold text-foreground/80">{m.caixa.bloco_autorizacao}</span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="inline-flex items-center gap-2 bg-yellow-900/30 text-yellow-400 border border-yellow-700"
                onClick={onValidarGerente}
                disabled={validandoGerente || movimentandoCaixa}
                aria-busy={validandoGerente}
              >
                {!gerenteValidadoAte ? (
                  <ImperialSealIcon
                    className="h-4 w-4 shrink-0 app-accent-text"
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
          <span className="text-sm text-foreground/85">{resumoItens}</span>
          {gerenteLinha && (
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
              <ImperialSealIcon
                className="h-5 w-5 shrink-0 text-[color:var(--caixa-imperial-red,#b91c1c)]"
                title={m.caixa.aria_selo_gerente}
              />
              {gerenteLinha}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-end gap-4 sm:gap-6 md:gap-8">
          <div className="w-full text-right text-xs font-semibold uppercase tracking-wide text-foreground/70">
            {m.caixa.bloco_resumo_financeiro}
          </div>
          <div className="text-right text-sm text-foreground/85">
            <div>{m.caixa.bruto}</div>
            <div className="text-lg font-semibold tabular-nums text-foreground">
              {moedaPrefixo} {fmt(totalBruto)}
            </div>
          </div>
          <div className="text-right text-sm text-primary">
            <div>{m.caixa.descontos_regras}</div>
            <div className="text-lg font-bold tabular-nums">
              - {moedaPrefixo} {fmt(totalDesconto)}
            </div>
            {economiaPrecoAtacadoAuto > 0.005 && (
              <div className="text-xs font-normal text-foreground/80 mt-0.5 max-w-[14rem] ml-auto">
                {caixaFmt(m.caixa.economia_atacado_por_quantidade, {
                  valor: fmt(economiaPrecoAtacadoAuto),
                })}
              </div>
            )}
          </div>
          {descontoGerentePercentual > 0 && (
            <div className="text-right text-sm text-primary">
              <div>
                {caixaFmt(m.caixa.desconto_gerente_label, {
                  pct: descontoGerentePercentual.toFixed(2),
                })}
              </div>
              <div className="text-lg font-bold tabular-nums">
                - {moedaPrefixo} {fmt(valorDescontoGerente)}
              </div>
            </div>
          )}
          {metodoPagamentoPanel ? (
            <div className="w-full min-w-[12rem] max-w-md">{metodoPagamentoPanel}</div>
          ) : null}
          <div className="text-right min-w-[7rem]">
            <div className="text-sm font-medium text-foreground/90">{m.caixa.total_pagar}</div>
            <div
              data-testid="caixa-total-liquido"
              data-total-liquido={totalLiquidoComGerente.toFixed(2)}
              className="text-2xl sm:text-3xl font-extrabold tabular-nums text-primary"
            >
              {moedaPrefixo} {fmt(totalLiquidoComGerente)}
            </div>
          </div>
          <div className="pl-1">
            <Button
              type="button"
              className="h-11 min-w-[11rem] bg-primary text-primary-foreground text-base font-bold hover:bg-primary/90"
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
    </footer>
  )
}
