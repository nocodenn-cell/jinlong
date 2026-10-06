"use client"

import type { ReactNode } from "react"
import { forwardRef } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { FinalizarVendaInput } from "@/app/caixa/finalizarVendaValidation"
import { labelFormaPagamentoVenda } from "@/lib/format/vendaLabels"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { enterVoltaParaBusca } from "@/app/caixa/caixaFocoBusca"
import type { FormaPagamento } from "@/app/caixa/hooks/useCaixaPagamentos"
import { formatDecimalBRL } from "@/lib/format/money"
import { CaixaMoneyInput } from "@/app/caixa/CaixaMoneyInput"
import { Select } from "@/components/ui/select"
import {
  EXCESSO_PAGAMENTO_EPS,
  SALDO_PENDENTE_EPS,
  avaliarExcessoParcelas,
  calcularTroco,
} from "@/app/caixa/caixaPagamentoSaldo"

/** Mantido por compatibilidade com atalhos legados — fluxo linear sem abas. */
export type CaixaPdvOperadorTabId = "produto"

type PagamentoLinha = {
  formaPagamento: FinalizarVendaInput["formaPagamento"]
  valor: number
}

type PagamentoPanelProps = {
  m: Mensagens
  disabled?: boolean
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
  /** Abre a autorização de gerente para desconto %; só oferecido em pagamento único em dinheiro. */
  onDescontoDinheiro?: () => void
  moedaPrefixo: string
  metodoPagamentoPanel?: ReactNode
}

type Props = PagamentoPanelProps & {
  produtoPanel: ReactNode
}

const PagamentoPanelImpl = forwardRef(function PagamentoPanelImpl(
  {
    m,
    disabled = false,
    pagamentos,
    totalLiquidoComGerente,
    diferenca,
    podeAdicionarParcela,
    formasDisponiveis,
    onAdicionarParcela,
    onRemoverParcela,
    onAtualizarForma,
    onAtualizarValor,
    onAutoCompletar,
    onDescontoDinheiro,
    moedaPrefixo,
    metodoPagamentoPanel,
  }: PagamentoPanelProps,
  ref: React.ForwardedRef<HTMLElement>,
) {
  const excedendo = diferenca > EXCESSO_PAGAMENTO_EPS
  // Troco só existe em dinheiro (calcularTroco/avaliarExcessoParcelas): um
  // excesso sem parcela DINHEIRO suficiente é erro de digitação do
  // operador (ex.: cartão/PIX somando mais que o total), não troco a
  // devolver — mostrar como diferença a corrigir, não como troco.
  const { trocoValido } = avaliarExcessoParcelas(pagamentos, diferenca)
  const temTroco = excedendo && trocoValido
  const excessoInvalido = excedendo && !trocoValido
  const faltando = diferenca < -SALDO_PENDENTE_EPS

  // Pagamento único é o caso de 99% das vendas. Enquanto houver uma só parcela o
  // painel mostra APENAS o que aquela forma exige: dinheiro pede valor recebido
  // (para o troco), cartão e PIX não pedem nada — o valor é o total. Dividir o
  // cupom continua possível, mas fora do caminho padrão.
  const dividido = pagamentos.length > 1
  const formaUnica = pagamentos[0]?.formaPagamento
  const pedeValorRecebido = !dividido && formaUnica === "DINHEIRO"
  const troco = pedeValorRecebido
    ? calcularTroco(totalLiquidoComGerente, pagamentos[0].valor)
    : null

  return (
    <section
      ref={ref}
      id="caixa-pdv-panel-pgto"
      tabIndex={-1}
      aria-label={m.caixa.pdv_tab_aria_pgto}
      className="flex shrink-0 flex-col gap-2 rounded-lg border border-border/60 bg-card/60 p-3 shadow-sm"
    >
      {metodoPagamentoPanel}

      {pedeValorRecebido && onDescontoDinheiro ? (
        <button
          disabled={disabled}
          type="button"
          onClick={onDescontoDinheiro}
          data-testid="caixa-desconto-dinheiro"
          className="self-start text-small font-medium text-primary underline underline-offset-2 transition hover:text-primary/80"
        >
          {m.caixa.validar_gerente}
        </button>
      ) : null}

      {pedeValorRecebido ? (
        <div className="flex items-center gap-2">
          <label
            htmlFor="caixa-valor-recebido"
            className="shrink-0 text-xs font-medium text-muted-foreground"
          >
            {m.caixa.pdv_pgto_valor_recebido}
          </label>
          <div className="flex flex-1 items-center gap-1.5">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {moedaPrefixo}
            </span>
            <CaixaMoneyInput
              disabled={disabled}
              id="caixa-valor-recebido"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={pagamentos[0].valor}
              onValueChange={(value) => onAtualizarValor(0, value)}
              onKeyDown={enterVoltaParaBusca}
              data-caixa-atalho-bloqueado="true"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-right text-base font-semibold tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
        </div>
      ) : null}

      {!dividido && !pedeValorRecebido ? (
        <div className="flex justify-between gap-3 rounded border p-2 font-semibold">
          <span>{labelFormaPagamentoVenda(formaUnica ?? "PIX", m)}</span>
          <span>{moedaPrefixo} {formatDecimalBRL(totalLiquidoComGerente)}</span>
        </div>
      ) : null}

      {dividido ? (
        <div className="space-y-2">
          {pagamentos.map((p, idx) => (
            <div
              key={`parcela-${idx}`}
              className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 p-2"
            >
              <Select
                disabled={disabled}
                value={p.formaPagamento}
                onChange={(e) => onAtualizarForma(idx, e.target.value as FormaPagamento)}
                aria-label={caixaFmt(m.caixa.aria_parcela_forma, { n: idx + 1 })}
                className="h-auto flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 focus-visible:ring-0 focus-visible:ring-offset-0"
              >
                {formasDisponiveis.map((f) => (
                  <option key={f} value={f}>
                    {labelFormaPagamentoVenda(f, m)}
                  </option>
                ))}
              </Select>
              <CaixaMoneyInput
                disabled={disabled}
                inputMode="decimal"
                step="0.01"
                min="0"
                value={p.valor}
                onValueChange={(value) => onAtualizarValor(idx, value)}
                onKeyDown={enterVoltaParaBusca}
                aria-label={caixaFmt(m.caixa.aria_parcela_valor, { n: idx + 1 })}
                data-caixa-atalho-bloqueado="true"
                className="w-28 rounded-md border border-border bg-background px-2 py-1.5 text-right text-sm font-semibold tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              <button
                disabled={disabled}
                type="button"
                onClick={() => onRemoverParcela(idx)}
                aria-label={caixaFmt(m.caixa.aria_remover_parcela, { n: idx + 1 })}
                className="shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-caption font-semibold text-destructive transition hover:bg-destructive/20"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            {podeAdicionarParcela ? (
              <button
                disabled={disabled}
                type="button"
                onClick={() => onAdicionarParcela()}
                aria-label={m.caixa.aria_adicionar_parcela}
                className="rounded-md border border-dashed border-border px-2 py-1 text-small font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
              >
                + {m.caixa.pdv_pgto_adicionar_forma}
              </button>
            ) : (
              <span className="text-caption text-muted-foreground">
                {m.caixa.pdv_pgto_max_parcelas}
              </span>
            )}
            <button
              disabled={disabled}
              type="button"
              onClick={onAutoCompletar}
              className="rounded-md border border-border bg-muted/60 px-2 py-1 text-small font-semibold text-foreground/80 transition hover:bg-muted hover:text-foreground"
            >
              {m.caixa.pdv_pgto_auto_completar}
            </button>
          </div>
        </div>
      ) : null}

      {troco && pagamentos[0].valor > 0 ? (
        <div
          data-testid="caixa-troco-inline"
          className={`flex items-baseline justify-between gap-3 rounded-md px-2.5 py-1.5 ${
            troco.troco > 0 ? "bg-success/10" : "bg-muted/30"
          }`}
        >
          <span className="text-xs font-medium text-muted-foreground">
            {m.caixa.pdv_pgto_troco_cliente}
          </span>
          <span
            className={`text-lg font-bold tabular-nums ${
              troco.troco > 0 ? "text-success" : "text-foreground"
            }`}
          >
            {moedaPrefixo} {formatDecimalBRL(troco.troco)}
          </span>
        </div>
      ) : null}

      {dividido && temTroco ? (
        <div className="flex justify-between gap-3 text-xs">
          <span className="font-medium text-success">{m.caixa.pdv_pgto_troco_cliente}</span>
          <span className="tabular-nums font-bold text-success">
            {moedaPrefixo} {formatDecimalBRL(diferenca)}
          </span>
        </div>
      ) : null}

      {faltando ? (
        <div className="flex justify-between gap-3 text-xs">
          <span className="font-medium text-destructive">{m.caixa.pdv_pgto_diferenca}</span>
          <span className="tabular-nums font-bold text-destructive">
            {moedaPrefixo} {formatDecimalBRL(Math.abs(diferenca))}
          </span>
        </div>
      ) : null}

      {dividido && excessoInvalido ? (
        <div className="flex justify-between gap-3 text-xs">
          <span className="font-medium text-destructive">
            {m.caixa.pdv_pgto_excesso_sem_dinheiro}
          </span>
          <span className="tabular-nums font-bold text-destructive">
            {moedaPrefixo} {formatDecimalBRL(diferenca)}
          </span>
        </div>
      ) : null}

      {!dividido && podeAdicionarParcela ? (
        <button
          disabled={disabled}
          type="button"
          onClick={() => onAdicionarParcela()}
          aria-label={m.caixa.aria_adicionar_parcela}
          className="self-start text-small font-medium text-muted-foreground underline underline-offset-2 transition hover:text-foreground"
        >
          {m.caixa.pdv_pgto_dividir}
        </button>
      ) : null}
    </section>
  )
})

PagamentoPanelImpl.displayName = "PagamentoPanel"

export function CaixaPdvOperadorTabs({
  m,
  disabled = false,
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
  onDescontoDinheiro,
  moedaPrefixo,
  produtoPanel,
  metodoPagamentoPanel,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">{produtoPanel}</div>
      <PagamentoPanelImpl
        m={m}
        disabled={disabled}
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
        onDescontoDinheiro={onDescontoDinheiro}
        moedaPrefixo={moedaPrefixo}
        metodoPagamentoPanel={metodoPagamentoPanel}
      />
    </div>
  )
}
