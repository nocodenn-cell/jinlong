"use client"

import type { ReactNode } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { FinalizarVendaInput } from "@/app/caixa/finalizarVendaValidation"
import { labelFormaPagamentoVenda } from "@/lib/format/vendaLabels"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import type { FormaPagamento } from "@/app/caixa/hooks/useCaixaPagamentos"
import { formatDecimalBRL } from "@/lib/format/money"
import { Select } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  EXCESSO_PAGAMENTO_EPS,
  SALDO_PENDENTE_EPS,
  calcularTroco,
} from "@/app/caixa/caixaPagamentoSaldo"
import { CaixaClienteTab } from "@/app/caixa/CaixaClienteTab"

export type CaixaPdvOperadorTabId = "produto" | "cliente" | "pgto"

type PagamentoLinha = {
  formaPagamento: FinalizarVendaInput["formaPagamento"]
  valor: number
}

type Props = {
  m: Mensagens
  activeTab: CaixaPdvOperadorTabId
  onActiveTabChange: (tab: CaixaPdvOperadorTabId) => void
  /** Nome do cliente vinculado à venda atual; `null` = Consumidor Final (padrão). */
  clienteNome: string | null
  onClienteCriado: (payload: { id: string; nome: string }) => void
  pagamentos: PagamentoLinha[]
  totalLiquidoComGerente: number
  totalBruto: number
  totalDesconto: number
  valorDescontoGerente: number
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

type PagamentoPanelProps = {
  m: Mensagens
  pagamentos: PagamentoLinha[]
  totalLiquidoComGerente: number
  totalBruto: number
  totalDesconto: number
  valorDescontoGerente: number
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
  metodoPagamentoPanel?: ReactNode
}

function PagamentoPanel({
  m,
  pagamentos,
  totalLiquidoComGerente,
  totalBruto,
  totalDesconto,
  valorDescontoGerente,
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
}: PagamentoPanelProps) {
  const somaOk = Math.abs(diferenca) <= SALDO_PENDENTE_EPS
  const temTroco = diferenca > EXCESSO_PAGAMENTO_EPS
  // Espelha o total já líquido (totalLiquidoComGerente = bruto - descontos), só
  // soma as duas fontes de desconto já calculadas em outro lugar para exibição —
  // nenhum cálculo novo, mesmos valores que CaixaFooter/CaixaPdvCartSaleBar usam.
  const descontoTotalExibido = totalDesconto + valorDescontoGerente

  return (
    <section
      role="tabpanel"
      aria-label={m.caixa.pdv_tab_aria_pgto}
      className="flex shrink-0 flex-col gap-3 rounded-lg border border-border/60 bg-card/60 p-3 shadow-sm"
    >
      {/* 1. Totais da venda */}
      <div className="flex flex-col gap-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {m.caixa.pdv_pgto_totais_titulo}
        </h3>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border border-border bg-background px-2 py-1.5">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {m.caixa.pdv_pgto_subtotal_label}
            </dt>
            <dd className="tabular-nums text-sm font-semibold text-foreground">
              {moedaPrefixo} {formatDecimalBRL(totalBruto)}
            </dd>
          </div>
          <div className="rounded-md border border-border bg-background px-2 py-1.5">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {m.caixa.pdv_pgto_descontos_label}
            </dt>
            <dd className="tabular-nums text-sm font-semibold text-foreground">
              {moedaPrefixo} {formatDecimalBRL(descontoTotalExibido)}
            </dd>
          </div>
          <div className="rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-primary">
              {m.caixa.pdv_pgto_total_venda_label}
            </dt>
            <dd className="tabular-nums text-sm font-bold text-primary">
              {moedaPrefixo} {formatDecimalBRL(totalLiquidoComGerente)}
            </dd>
          </div>
        </dl>
      </div>

      {/* 2. Forma de pagamento */}
      {metodoPagamentoPanel ? <div>{metodoPagamentoPanel}</div> : null}

      {/* 3. Valor recebido — pagamento único ganha bloco grande (mockup); split
          mantém a lista de parcelas existente, só com o título renomeado. */}
      {pagamentos.length === 1 ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {m.caixa.pdv_pgto_valor_recebido}
            </span>
            <div className="flex items-center gap-2 rounded-lg border-2 border-border bg-background px-3 py-2 focus-within:border-primary">
              <span className="shrink-0 text-lg font-semibold text-muted-foreground">{moedaPrefixo}</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={pagamentos[0].valor === 0 ? "" : pagamentos[0].valor.toFixed(2)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  onAtualizarValor(0, Number.isFinite(v) ? v : 0)
                }}
                aria-label={caixaFmt(m.caixa.aria_parcela_valor, { n: 1 })}
                data-caixa-atalho-bloqueado="true"
                className="w-full border-0 bg-transparent text-right text-3xl font-black tabular-nums text-foreground focus:outline-none focus:ring-0"
              />
            </div>
          </label>
          {pagamentos[0].formaPagamento === "DINHEIRO"
            ? (() => {
                // Leitura de troco para dinheiro em pagamento único: cálculo
                // canônico (SSoT), mesmo de antes — só ganhou destaque visual.
                const t = calcularTroco(totalLiquidoComGerente, pagamentos[0].valor)
                return (
                  <div
                    data-testid="caixa-troco-inline"
                    className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-2.5",
                      t.troco > 0 ? "bg-success/10" : "bg-muted/30",
                    )}
                  >
                    <span className="text-sm font-semibold text-muted-foreground">
                      {m.caixa.pdv_pgto_troco_cliente}
                    </span>
                    <span
                      className={cn(
                        "text-2xl font-black tabular-nums",
                        t.troco > 0 ? "text-success" : "text-foreground",
                      )}
                    >
                      {moedaPrefixo} {formatDecimalBRL(t.troco)}
                    </span>
                  </div>
                )
              })()
            : null}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">{m.caixa.pdv_pgto_parcelas_titulo}</h3>
            <button
              type="button"
              onClick={onAutoCompletar}
              className="rounded-md border border-border bg-muted/60 px-2 py-1 text-[10px] font-semibold text-foreground/80 transition hover:bg-muted hover:text-foreground"
            >
              {m.caixa.pdv_pgto_auto_completar}
            </button>
          </div>
          <div className="space-y-3">
            {pagamentos.map((p, idx) => (
              <div
                key={`parcela-${idx}`}
                className="flex flex-col gap-1.5 rounded-lg border p-2.5 border-border/60 bg-muted/20"
              >
                <div className="flex items-center gap-2">
                  <Select
                    value={p.formaPagamento}
                    onChange={(e) => onAtualizarForma(idx, e.target.value as FormaPagamento)}
                    aria-label={caixaFmt(m.caixa.aria_parcela_forma, { n: idx + 1 })}
                    className="h-auto focus-visible:ring-0 focus-visible:ring-offset-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                  >
                    {formasDisponiveis.map((f) => (
                      <option key={f} value={f}>
                        {labelFormaPagamentoVenda(f, m)}
                      </option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    onClick={() => onRemoverParcela(idx)}
                    aria-label={caixaFmt(m.caixa.aria_remover_parcela, { n: idx + 1 })}
                    className="shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[10px] font-semibold text-destructive transition hover:bg-destructive/20"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
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
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-right text-sm font-semibold tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
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
        {temTroco ? (
          <div className="flex justify-between gap-3 text-xs">
            <dt className="font-medium text-success">{m.caixa.pdv_pgto_troco_cliente}</dt>
            <dd className="tabular-nums font-bold text-success">
              {moedaPrefixo} {formatDecimalBRL(diferenca)}
            </dd>
          </div>
        ) : null}
        {diferenca < -SALDO_PENDENTE_EPS ? (
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

const TAB_ORDER: readonly CaixaPdvOperadorTabId[] = ["produto", "cliente", "pgto"]

export function CaixaPdvOperadorTabs({
  m,
  activeTab,
  onActiveTabChange,
  clienteNome,
  onClienteCriado,
  pagamentos,
  totalLiquidoComGerente,
  totalBruto,
  totalDesconto,
  valorDescontoGerente,
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
  const tabLabel: Record<CaixaPdvOperadorTabId, string> = {
    produto: m.caixa.pdv_tab_produto,
    cliente: m.caixa.pdv_tab_cliente,
    pgto: m.caixa.pdv_tab_pgto,
  }
  const tabShortcut: Record<CaixaPdvOperadorTabId, string> = {
    produto: "Alt+Z",
    cliente: "Alt+C",
    pgto: "Alt+B",
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div role="tablist" aria-label={m.caixa.pdv_tabs_lista_aria} className="flex shrink-0 border-b border-border">
        {TAB_ORDER.map((tab) => {
          const selected = activeTab === tab
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onActiveTabChange(tab)}
              title={`${tabLabel[tab]} (${tabShortcut[tab]})`}
              className={cn(
                "-mb-px flex-1 border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
                selected
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {tabLabel[tab]}
            </button>
          )
        })}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {activeTab === "produto" && (
          <div role="tabpanel" aria-label={m.caixa.pdv_tab_aria_produto} className="flex min-h-0 flex-1 flex-col gap-2">
            {produtoPanel}
          </div>
        )}
        {activeTab === "cliente" && (
          <CaixaClienteTab m={m} clienteNome={clienteNome} onClienteCriado={onClienteCriado} />
        )}
        {activeTab === "pgto" && (
          <PagamentoPanel
            m={m}
            pagamentos={pagamentos}
            totalLiquidoComGerente={totalLiquidoComGerente}
            totalBruto={totalBruto}
            totalDesconto={totalDesconto}
            valorDescontoGerente={valorDescontoGerente}
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
        )}
      </div>
    </div>
  )
}
