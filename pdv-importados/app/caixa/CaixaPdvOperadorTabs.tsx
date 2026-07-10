"use client"

import type { ReactNode } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import type { FinalizarVendaInput } from "@/app/caixa/finalizarVendaValidation"
import type { CaixaPdvLayoutVariant } from "@/app/caixa/CaixaPdvTopBar"
import { labelFormaPagamentoVenda } from "@/lib/format/vendaLabels"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import type { FormaPagamento } from "@/app/caixa/hooks/useCaixaPagamentos"
import { formatDecimalBRL } from "@/lib/format/money"
import { CurrencyInput } from "@/components/ui/CurrencyInput"

export type CaixaPdvOperadorTabId = "produto" | "cliente" | "pgto"

type PagamentoLinha = {
  formaPagamento: FinalizarVendaInput["formaPagamento"]
  valor: number
}

type Props = {
  m: Mensagens
  idioma: Idioma
  tab: CaixaPdvOperadorTabId
  onTabChange: (id: CaixaPdvOperadorTabId) => void
  layoutVariant?: CaixaPdvLayoutVariant
  mostrarAtalhos: boolean
  operadorLabel: string
  pagamentos: PagamentoLinha[]
  totalLiquidoComGerente: number
  somaParcelas: number
  diferenca: number
  podeAdicionarParcela: boolean
  formasDisponiveis: readonly FormaPagamento[]
  onAdicionarParcela: (forma?: FormaPagamento) => void
  onRemoverParcela: (index: number) => void
  onAtualizarForma: (index: number, forma: FormaPagamento) => void
  onAtualizarValor: (index: number, valor: number) => void
  onAutoCompletar: () => void
  moedaPrefixo: string
  produtoPanel: ReactNode
  /** Seletor de forma de pagamento (aba Pgto). */
  metodoPagamentoPanel?: ReactNode
}

export function CaixaPdvOperadorTabs({
  m,
  tab,
  onTabChange,
  mostrarAtalhos,
  operadorLabel,
  pagamentos,
  totalLiquidoComGerente,
  somaParcelas,
  diferenca,
  podeAdicionarParcela,
  formasDisponiveis,
  onAdicionarParcela,
  onRemoverParcela,
  onAtualizarForma,
  onAtualizarValor,
  onAutoCompletar,
  moedaPrefixo,
  produtoPanel,
  metodoPagamentoPanel,
}: Props) {
  const tabs: { id: CaixaPdvOperadorTabId; label: string; aria: string; atalho?: string }[] = [
    { id: "produto", label: m.caixa.pdv_tab_produto, aria: m.caixa.pdv_tab_aria_produto, atalho: "Alt+Z" },
    { id: "cliente", label: m.caixa.pdv_tab_cliente, aria: m.caixa.pdv_tab_aria_cliente, atalho: "Alt+C" },
    { id: "pgto", label: m.caixa.pdv_tab_pgto, aria: m.caixa.pdv_tab_aria_pgto, atalho: "Alt+B" },
  ]

  const somaOk = Math.abs(diferenca) <= 0.01
  const temTroco = diferenca > 0.01

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div
        role="tablist"
        aria-label={m.caixa.pdv_tabs_lista_aria}
        className="flex shrink-0 gap-1 border-b border-border/80 bg-muted/25 px-0.5 pt-1"
      >
        {tabs.map((t) => {
          const selected = tab === t.id
          const title = mostrarAtalhos && t.atalho ? `${t.aria} (${t.atalho})` : t.aria
          const tabButtonClass = selected
            ? "relative z-[1] -mb-px flex-1 rounded-t-md border-x-0 border-b-2 border-b-background border-t-2 border-t-primary bg-background px-2 py-2 text-center text-sm font-semibold text-foreground shadow-[0_-1px_6px_rgba(0,0,0,0.05)]"
            : "flex-1 rounded-t-md border border-transparent bg-muted/60 px-2 py-2 text-center text-sm font-medium text-foreground/80 ring-1 ring-border/70 hover:bg-muted/90 hover:text-foreground"
          const atalhoClass = selected
            ? "mt-0.5 block text-[10px] font-normal uppercase tracking-wide text-foreground/70"
            : "mt-0.5 block text-[10px] font-normal uppercase tracking-wide text-foreground/55"
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`caixa-pdv-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`caixa-pdv-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              title={title}
              className={tabButtonClass}
              onClick={() => onTabChange(t.id)}
            >
              <span className="block leading-tight">{t.label}</span>
              {mostrarAtalhos && t.atalho ? <span className={atalhoClass}>{t.atalho}</span> : null}
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex flex-1 flex-col gap-2 overflow-hidden">
        <div
          role="tabpanel"
          id="caixa-pdv-panel-produto"
          aria-labelledby="caixa-pdv-tab-produto"
          hidden={tab !== "produto"}
          className={tab === "produto" ? "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto" : "hidden"}
        >
          {produtoPanel}
        </div>

        <div
          role="tabpanel"
          id="caixa-pdv-panel-cliente"
          aria-labelledby="caixa-pdv-tab-cliente"
          hidden={tab !== "cliente"}
          className={
            tab === "cliente"
              ? "flex flex-1 flex-col gap-3 rounded-lg border-x border-b border-border/60 border-t-2 border-t-primary bg-card/60 p-4 shadow-sm"
              : "hidden"
          }
        >
          <div>
            <h3 className="text-sm font-semibold text-foreground">{m.caixa.pdv_cliente_cupom_titulo}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.caixa.pdv_cliente_sem_cadastro_desc}</p>
          </div>
          <dl className="space-y-2 border-t pt-3 text-sm border-border">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{m.caixa.pdv_cliente_operador_label}</dt>
              <dd className="max-w-[65%] text-right font-medium break-words text-foreground">{operadorLabel}</dd>
            </div>
          </dl>
        </div>

        <div
          role="tabpanel"
          id="caixa-pdv-panel-pgto"
          aria-labelledby="caixa-pdv-tab-pgto"
          hidden={tab !== "pgto"}
          className={
            tab === "pgto"
              ? "flex flex-1 flex-col gap-3 rounded-lg border-x border-b border-border/60 border-t-2 border-t-primary bg-card/60 p-4 shadow-sm overflow-y-auto"
              : "hidden"
          }
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">{m.caixa.pdv_pgto_parcelas_titulo}</h3>
            {pagamentos.length > 1 && (
              <button
                type="button"
                onClick={onAutoCompletar}
                className="rounded-md border border-border bg-muted/60 px-2 py-1 text-[10px] font-semibold text-foreground/80 transition hover:bg-muted hover:text-foreground"
              >
                {m.caixa.pdv_pgto_auto_completar}
              </button>
            )}
          </div>
          {metodoPagamentoPanel ? <div className="mb-1">{metodoPagamentoPanel}</div> : null}

          {/* Lista de parcelas */}
          <div className="space-y-3">
            {pagamentos.map((p, idx) => (
              <div
                key={`parcela-${idx}`}
                className="flex flex-col gap-1.5 rounded-lg border p-2.5 border-border/60 bg-muted/20"
              >
                <div className="flex items-center gap-2">
                  <select
                    value={p.formaPagamento}
                    onChange={(e) => onAtualizarForma(idx, e.target.value as FormaPagamento)}
                    aria-label={caixaFmt(m.caixa.aria_parcela_forma, { n: idx + 1 })}
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                  >
                    {formasDisponiveis.map((f) => (
                      <option key={f} value={f}>
                        {labelFormaPagamentoVenda(f, m)}
                      </option>
                    ))}
                  </select>
                  {pagamentos.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRemoverParcela(idx)}
                      aria-label={caixaFmt(m.caixa.aria_remover_parcela, { n: idx + 1 })}
                      className="shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[10px] font-semibold text-destructive transition hover:bg-destructive/20"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{moedaPrefixo}</span>
                  <CurrencyInput
                    value={p.valor}
                    onValueChange={(v) => onAtualizarValor(idx, v ?? 0)}
                    aria-label={caixaFmt(m.caixa.aria_parcela_valor, { n: idx + 1 })}
                    data-caixa-atalho-bloqueado="true"
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-right text-sm font-semibold tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Botão adicionar parcela */}
          {podeAdicionarParcela ? (
            <button
              type="button"
              onClick={() => onAdicionarParcela()}
              aria-label={m.caixa.aria_adicionar_parcela}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
            >
              + {m.caixa.pdv_pgto_adicionar_forma}
            </button>
          ) : (
            <p className="text-center text-[10px] text-muted-foreground">
              {m.caixa.pdv_pgto_max_parcelas}
            </p>
          )}

          {/* Resumo financeiro */}
          <dl className="space-y-2 border-t pt-3 text-sm border-border">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{m.caixa.total_pagar}</dt>
              <dd className="font-semibold tabular-nums text-foreground">
                {moedaPrefixo} {formatDecimalBRL(totalLiquidoComGerente)}
              </dd>
            </div>
            <div className="flex justify-between gap-3 text-xs">
              <dt className="text-muted-foreground">{m.caixa.pdv_pgto_soma_parcelas}</dt>
              <dd className={`tabular-nums font-semibold ${somaOk ? "text-success" : "text-destructive"}`}>
                {moedaPrefixo} {formatDecimalBRL(somaParcelas)}
              </dd>
            </div>
            {temTroco && (
              <div className="flex justify-between gap-3 text-xs">
                <dt className="font-medium text-success">{m.caixa.pdv_pgto_troco_cliente}</dt>
                <dd className="tabular-nums font-bold text-success">
                  {moedaPrefixo} {formatDecimalBRL(diferenca)}
                </dd>
              </div>
            )}
            {diferenca < -0.01 && (
              <div className="flex justify-between gap-3 text-xs">
                <dt className="font-medium text-destructive">{m.caixa.pdv_pgto_diferenca}</dt>
                <dd className="tabular-nums font-bold text-destructive">
                  {moedaPrefixo} {formatDecimalBRL(Math.abs(diferenca))}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </div>
  )
}
