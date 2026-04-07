"use client"

import { Button } from "@/components/ui/button"
import type { Mensagens } from "@/src/lib/i18n/getMessages"
import type { Idioma } from "@/src/lib/idioma/normalizeIdioma"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import type { FinalizarVendaInput } from "@/app/caixa/finalizarVendaValidation"

const FORMAS: FinalizarVendaInput["formaPagamento"][] = [
  "DINHEIRO",
  "PIX",
  "CARTAO_DEBITO",
  "CARTAO_CREDITO",
]

type Props = {
  m: Mensagens
  idioma: Idioma
  formaPagamento: FinalizarVendaInput["formaPagamento"]
  onFormaPagamentoChange: (v: FinalizarVendaInput["formaPagamento"]) => void
  onValidarGerente: () => void
  onFinalizar: () => void
  validandoGerente: boolean
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
  valorDescontoGerente: number
  totalLiquidoComGerente: number
  moedaPrefixo: string
}

function moneyLocale(idioma: Idioma) {
  if (idioma === "pt") return "pt-BR"
  if (idioma === "zh-HK") return "zh-HK"
  return "zh-CN"
}

function timeLocale(idioma: Idioma) {
  return moneyLocale(idioma)
}

function formaLabel(
  m: Mensagens,
  value: FinalizarVendaInput["formaPagamento"],
): string {
  switch (value) {
    case "DINHEIRO":
      return m.pdv.dinheiro
    case "PIX":
      return m.pdv.pix
    case "CARTAO_DEBITO":
      return m.pdv.cartao_debito
    case "CARTAO_CREDITO":
      return m.pdv.cartao_credito
    default:
      return value
  }
}

export function CaixaFooter({
  m,
  idioma,
  formaPagamento,
  onFormaPagamentoChange,
  onValidarGerente,
  onFinalizar,
  validandoGerente,
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
  valorDescontoGerente,
  totalLiquidoComGerente,
  moedaPrefixo,
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

  return (
    <footer className="shrink-0 border-t border-slate-800 bg-slate-950/85 backdrop-blur-sm px-4 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between text-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <label className="text-xs text-slate-400 flex items-center gap-2 min-w-0">
            <span className="shrink-0">{m.pdv.pagamento}</span>
            <select
              value={formaPagamento}
              onChange={(e) =>
                onFormaPagamentoChange(
                  e.target.value as FinalizarVendaInput["formaPagamento"],
                )
              }
              disabled={finalizando || itensLength === 0}
              className="min-w-0 flex-1 h-9 rounded-md bg-slate-800 border border-slate-600 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            >
              {FORMAS.map((f) => (
                <option key={f} value={f}>
                  {formaLabel(m, f)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="bg-amber-700/90 text-amber-50 hover:bg-amber-600 border-0"
              onClick={onValidarGerente}
              disabled={validandoGerente}
            >
              {validandoGerente
                ? m.caixa.validando_gerente
                : m.caixa.validar_gerente}
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 text-white hover:bg-emerald-500"
              onClick={onFinalizar}
              disabled={
                finalizando || itensLength === 0 || buscando || carregandoRegras
              }
            >
              {finalizando ? m.caixa.finalizando : m.caixa.finalizar_venda}
            </Button>
          </div>
          <span className="text-xs text-slate-400">{resumoItens}</span>
          {gerenteLinha && (
            <span className="text-xs text-amber-300">{gerenteLinha}</span>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-4 sm:gap-6 md:gap-8">
          <div className="text-right text-xs text-slate-300">
            <div>{m.caixa.bruto}</div>
            <div className="text-base font-semibold tabular-nums">
              {moedaPrefixo} {fmt(totalBruto)}
            </div>
          </div>
          <div className="text-right text-xs text-emerald-300">
            <div>{m.caixa.descontos_regras}</div>
            <div className="text-base font-semibold tabular-nums">
              - {moedaPrefixo} {fmt(totalDesconto)}
            </div>
          </div>
          {descontoGerentePercentual > 0 && (
            <div className="text-right text-xs text-amber-300">
              <div>
                {caixaFmt(m.caixa.desconto_gerente_label, {
                  pct: descontoGerentePercentual.toFixed(2),
                })}
              </div>
              <div className="text-base font-semibold tabular-nums">
                - {moedaPrefixo} {fmt(valorDescontoGerente)}
              </div>
            </div>
          )}
          <div className="text-right min-w-[7rem]">
            <div className="text-xs text-slate-400">{m.caixa.total_pagar}</div>
            <div className="text-xl sm:text-2xl font-bold tabular-nums text-emerald-400">
              {moedaPrefixo} {fmt(totalLiquidoComGerente)}
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
