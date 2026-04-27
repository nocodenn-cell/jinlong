"use client"

import { Button } from "@/components/ui/button"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import {
  FORMAS_PAGAMENTO_CAIXA,
  type FinalizarVendaInput,
} from "@/app/caixa/finalizarVendaValidation"
import { ImperialSealIcon } from "@/components/icons/ImperialSealIcon"

type Props = {
  m: Mensagens
  idioma: Idioma
  pagamentos: Array<{ formaPagamento: FinalizarVendaInput["formaPagamento"]; valor: number }>
  onPagamentoFormaChange: (index: number, v: FinalizarVendaInput["formaPagamento"]) => void
  onPagamentoValorChange: (index: number, valor: number) => void
  onAdicionarPagamento: () => void
  onRemoverPagamento: (index: number) => void
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
  pagamentos,
  onPagamentoFormaChange,
  onPagamentoValorChange,
  onAdicionarPagamento,
  onRemoverPagamento,
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
    <footer className="shrink-0 border-t backdrop-blur-sm px-4 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-10 app-divider app-surface">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between text-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <div className="text-xs app-muted min-w-[22rem]">
            <div className="mb-1">{m.pdv.pagamento} (split)</div>
            <div className="flex flex-col gap-1">
              {pagamentos.map((p, idx) => (
                <div key={`pg-${idx}`} className="flex items-center gap-1">
                  <select
                    value={p.formaPagamento}
                    onChange={(e) =>
                      onPagamentoFormaChange(
                        idx,
                        e.target.value as FinalizarVendaInput["formaPagamento"],
                      )
                    }
                    disabled={finalizando || itensLength === 0}
                    aria-label={caixaFmt(m.caixa.aria_parcela_forma, { n: String(idx + 1) })}
                    className="h-8 rounded-md px-2 text-xs disabled:opacity-50 app-select"
                  >
                    {FORMAS_PAGAMENTO_CAIXA.map((f) => (
                      <option key={f} value={f}>
                        {formaLabel(m, f)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={p.valor}
                    onChange={(e) => onPagamentoValorChange(idx, Number(e.target.value))}
                    disabled={finalizando || itensLength === 0}
                    aria-label={caixaFmt(m.caixa.aria_parcela_valor, { n: String(idx + 1) })}
                    className="h-8 w-24 rounded-md px-2 text-xs disabled:opacity-50 app-input"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoverPagamento(idx)}
                    disabled={finalizando || itensLength === 0 || pagamentos.length <= 1}
                    aria-label={caixaFmt(m.caixa.aria_remover_parcela, { n: String(idx + 1) })}
                    className="h-8 px-2 rounded-md text-xs disabled:opacity-50 app-btn-danger"
                  >
                    -
                  </button>
                  {idx === pagamentos.length - 1 && (
                    <button
                      type="button"
                      onClick={onAdicionarPagamento}
                      disabled={finalizando || itensLength === 0 || pagamentos.length >= 4}
                      aria-label={m.caixa.aria_adicionar_parcela}
                      className="h-8 px-2 rounded-md text-xs disabled:opacity-50 app-btn-neutral"
                    >
                      +
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="app-btn-neutral"
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
              className="app-btn-danger"
              onClick={onAbrirSangria}
              disabled={!caixaAberto || movimentandoCaixa || finalizando}
              aria-busy={movimentandoCaixa}
              title="Ctrl+Shift+R"
            >
              {m.caixa.sangria} (-)
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="inline-flex items-center gap-2 app-badge-warn"
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
            <Button
              type="button"
              className="app-btn-accent"
              onClick={onFinalizar}
              disabled={
                finalizando || itensLength === 0 || buscando || carregandoRegras
              }
              aria-busy={finalizando}
            >
              {finalizando ? m.caixa.finalizando : m.caixa.finalizar_venda}
            </Button>
          </div>
          <span className="text-xs app-muted">{resumoItens}</span>
          {gerenteLinha && (
            <span className="inline-flex items-center gap-2 text-xs app-accent-text">
              <ImperialSealIcon
                className="h-5 w-5 shrink-0 text-[color:var(--caixa-imperial-red,#b91c1c)]"
                title={m.caixa.aria_selo_gerente}
              />
              {gerenteLinha}
            </span>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-4 sm:gap-6 md:gap-8">
          <div className="text-right text-xs app-muted">
            <div>{m.caixa.bruto}</div>
            <div className="text-base font-semibold tabular-nums">
              {moedaPrefixo} {fmt(totalBruto)}
            </div>
          </div>
          <div className="text-right text-xs app-accent-text">
            <div>{m.caixa.descontos_regras}</div>
            <div className="text-base font-semibold tabular-nums">
              - {moedaPrefixo} {fmt(totalDesconto)}
            </div>
          </div>
          {descontoGerentePercentual > 0 && (
            <div className="text-right text-xs app-accent-text">
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
            <div className="text-xs app-muted">{m.caixa.total_pagar}</div>
            <div
              data-testid="caixa-total-liquido"
              data-total-liquido={totalLiquidoComGerente.toFixed(2)}
              className="text-xl sm:text-2xl font-bold tabular-nums app-accent-text"
            >
              {moedaPrefixo} {fmt(totalLiquidoComGerente)}
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
