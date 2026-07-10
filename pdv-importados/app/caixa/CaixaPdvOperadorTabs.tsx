"use client"

import type { ReactNode } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { FinalizarVendaInput } from "@/app/caixa/finalizarVendaValidation"
import type { CaixaPdvLayoutVariant } from "@/app/caixa/CaixaPdvTopBar"
import { labelFormaPagamentoVenda } from "@/lib/format/vendaLabels"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import type { FormaPagamento } from "@/app/caixa/hooks/useCaixaPagamentos"
import { formatDecimalBRL } from "@/lib/format/money"

/** Mantido por compatibilidade com atalhos legados — fluxo linear sem abas. */
export type CaixaPdvOperadorTabId = "produto"

type PagamentoLinha = {
  formaPagamento: FinalizarVendaInput["formaPagamento"]
  valor: number
}

type Props = {
  m: Mensagens
  layoutVariant?: CaixaPdvLayoutVariant
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
  metodoPagamentoPanel?: ReactNode
}

function PagamentoPanel({
  m,
  classicChrome,
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
  metodoPagamentoPanel,
}: Omit<Props, "produtoPanel" | "layoutVariant"> & { classicChrome: boolean }) {
  const somaOk = Math.abs(diferenca) <= 0.01
  const temTroco = diferenca > 0.01

  return (
    <section
      aria-label={m.caixa.pdv_tab_aria_pgto}
      className={
        classicChrome
          ? "flex shrink-0 flex-col gap-3 rounded-lg border border-border/60 bg-card/60 p-3 shadow-sm"
          : "flex shrink-0 flex-col gap-3 rounded-lg border border-jl-border-1 bg-jl-surface-elev p-3"
      }
    >
      <div className="flex items-center justify-between">
        <h3 className={`text-sm font-semibold ${classicChrome ? "text-foreground" : "text-jl-fg-1"}`}>
          {m.caixa.pdv_pgto_parcelas_titulo}
        </h3>
        {pagamentos.length > 1 ? (
          <button
            type="button"
            onClick={onAutoCompletar}
            className={
              classicChrome
                ? "rounded-md border border-border bg-muted/60 px-2 py-1 text-[10px] font-semibold text-foreground/80 transition hover:bg-muted hover:text-foreground"
                : "rounded-md border border-jl-border-1 bg-white/[0.06] px-2 py-1 text-[10px] font-semibold text-jl-fg-2 transition hover:bg-white/[0.10] hover:text-jl-fg-1"
            }
          >
            {m.caixa.pdv_pgto_auto_completar}
          </button>
        ) : null}
      </div>
      {metodoPagamentoPanel ? <div className="mb-1">{metodoPagamentoPanel}</div> : null}
      <div className="space-y-3">
        {pagamentos.map((p, idx) => (
          <div
            key={`parcela-${idx}`}
            className={`flex flex-col gap-1.5 rounded-lg border p-2.5 ${classicChrome ? "border-border/60 bg-muted/20" : "border-jl-border-1 bg-white/[0.04]"}`}
          >
            <div className="flex items-center gap-2">
              <select
                value={p.formaPagamento}
                onChange={(e) => onAtualizarForma(idx, e.target.value as FormaPagamento)}
                aria-label={caixaFmt(m.caixa.aria_parcela_forma, { n: idx + 1 })}
                className={
                  classicChrome
                    ? "flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                    : "flex-1 rounded-md border border-jl-border-1 bg-jl-surface-base px-2 py-1.5 text-xs font-medium text-jl-fg-1 focus:border-amber-400/60 focus:outline-none focus:ring-1 focus:ring-amber-400/20"
                }
              >
                {formasDisponiveis.map((f) => (
                  <option key={f} value={f}>
                    {labelFormaPagamentoVenda(f, m)}
                  </option>
                ))}
              </select>
              {pagamentos.length > 1 ? (
                <button
                  type="button"
                  onClick={() => onRemoverParcela(idx)}
                  aria-label={caixaFmt(m.caixa.aria_remover_parcela, { n: idx + 1 })}
                  className="shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[10px] font-semibold text-destructive transition hover:bg-destructive/20"
                >
                  ✕
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <span className={`shrink-0 text-[10px] font-medium ${classicChrome ? "text-muted-foreground" : "text-jl-fg-3"}`}>
                {moedaPrefixo}
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={p.valor === 0 ? "" : p.valor.toFixed(2)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  onAtualizarValor(idx, Number.isFinite(v) ? v : 0)
                }}
                aria-label={caixaFmt(m.caixa.aria_parcela_valor, { n: idx + 1 })}
                data-caixa-atalho-bloqueado="true"
                className={
                  classicChrome
                    ? "w-full rounded-md border border-border bg-background px-2 py-1.5 text-right text-sm font-semibold tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                    : "w-full rounded-md border border-jl-border-1 bg-jl-surface-base px-2 py-1.5 text-right text-sm font-semibold tabular-nums text-jl-fg-1 focus:border-amber-400/60 focus:outline-none focus:ring-1 focus:ring-amber-400/20"
                }
              />
            </div>
          </div>
        ))}
      </div>
      {podeAdicionarParcela ? (
        <button
          type="button"
          onClick={() => onAdicionarParcela()}
          aria-label={m.caixa.aria_adicionar_parcela}
          className={
            classicChrome
              ? "flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
              : "flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-jl-border-1 py-2 text-xs font-semibold text-jl-fg-3 transition hover:border-amber-400/50 hover:text-jl-fg-1"
          }
        >
          + {m.caixa.pdv_pgto_adicionar_forma}
        </button>
      ) : (
        <p className={`text-center text-[10px] ${classicChrome ? "text-muted-foreground" : "text-jl-fg-3"}`}>
          {m.caixa.pdv_pgto_max_parcelas}
        </p>
      )}
      <dl className={`space-y-2 border-t pt-3 text-sm ${classicChrome ? "border-border" : "border-jl-border-1"}`}>
        <div className="flex justify-between gap-3">
          <dt className={classicChrome ? "text-muted-foreground" : "text-jl-fg-3"}>{m.caixa.total_pagar}</dt>
          <dd className={`font-semibold tabular-nums ${classicChrome ? "text-foreground" : "text-jl-fg-1"}`}>
            {moedaPrefixo} {formatDecimalBRL(totalLiquidoComGerente)}
          </dd>
        </div>
        <div className="flex justify-between gap-3 text-xs">
          <dt className={classicChrome ? "text-muted-foreground" : "text-jl-fg-3"}>{m.caixa.pdv_pgto_soma_parcelas}</dt>
          <dd className={`tabular-nums font-semibold ${somaOk ? "text-emerald-500" : "text-destructive"}`}>
            {moedaPrefixo} {formatDecimalBRL(somaParcelas)}
          </dd>
        </div>
        {temTroco ? (
          <div className="flex justify-between gap-3 text-xs">
            <dt className="font-medium text-emerald-600">{m.caixa.pdv_pgto_troco_cliente}</dt>
            <dd className="tabular-nums font-bold text-emerald-500">
              {moedaPrefixo} {formatDecimalBRL(diferenca)}
            </dd>
          </div>
        ) : null}
        {diferenca < -0.01 ? (
          <div className="flex justify-between gap-3 text-xs">
            <dt className="font-medium text-destructive">{m.caixa.pdv_pgto_diferenca}</dt>
            <dd className="tabular-nums font-bold text-destructive">
              {moedaPrefixo} {formatDecimalBRL(Math.abs(diferenca))}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  )
}

export function CaixaPdvOperadorTabs({
  m,
  layoutVariant = "default",
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
  const classicChrome = layoutVariant === "classic"

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">{produtoPanel}</div>
      <PagamentoPanel
        m={m}
        classicChrome={classicChrome}
        pagamentos={pagamentos}
        totalLiquidoComGerente={totalLiquidoComGerente}
        somaParcelas={somaParcelas}
        diferenca={diferenca}
        podeAdicionarParcela={podeAdicionarParcela}
        formasDisponiveis={formasDisponiveis}
        onAdicionarParcela={onAdicionarParcela}
        onRemoverParcela={onRemoverParcela}
        onAtualizarForma={onAtualizarForma}
        onAtualizarValor={onAtualizarValor}
        onAutoCompletar={onAutoCompletar}
        moedaPrefixo={moedaPrefixo}
        metodoPagamentoPanel={metodoPagamentoPanel}
      />
    </div>
  )
}
