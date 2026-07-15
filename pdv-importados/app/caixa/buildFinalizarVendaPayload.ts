import {
  buildCheckoutSnapshot,
  validateCheckoutSnapshot,
  type CheckoutViolation,
} from '@shared-core/src/caixa/checkoutSnapshot'
import { roundMoney2, type FinalizarVendaInput } from '@/app/caixa/finalizarVendaValidation'
import { EXCESSO_PAGAMENTO_EPS } from '@/app/caixa/caixaPagamentoSaldo'
import type { ItemCarrinhoComPreco } from '@/stores/carrinhoStore'
import type { ParcelaPagamento } from '@/app/caixa/hooks/useCaixaPagamentos'

export type BuildFinalizarVendaPayloadInput = {
  itens: ItemCarrinhoComPreco[]
  /** Totais base do carrinho (store), antes do desconto de gerente. */
  totalBruto: number
  totalDesconto: number
  totalLiquido: number
  /** Desconto de gerente já resolvido (clampado) para este total. */
  descontoGerentePercentualEfetivo: number
  valorDescontoGerente: number
  totalLiquidoComGerente: number
  gerenteToken: string | null
  pagamentos: ParcelaPagamento[]
  clienteId: string | null
}

export type BuildFinalizarVendaPayloadResult =
  | { ok: true; payload: FinalizarVendaInput }
  | { ok: false; violations: CheckoutViolation[] }

/**
 * Desconta o excesso pago (troco) da(s) parcela(s) DINHEIRO, de trás para
 * frente, priorizando a última parcela em dinheiro. Comportamento idêntico
 * ao que antes vivia inline no handler de clique de "Finalizar".
 */
function normalizarParcelasComTroco(
  pagamentos: ParcelaPagamento[],
  totalLiquidoComGerente: number,
): ParcelaPagamento[] {
  const totalPagamentos = roundMoney2(pagamentos.reduce((acc, p) => acc + p.valor, 0))
  const parcelas = pagamentos.map((p) => ({ ...p }))
  const excesso = roundMoney2(totalPagamentos - totalLiquidoComGerente)

  if (excesso > EXCESSO_PAGAMENTO_EPS) {
    let idxDinheiro = -1
    for (let i = parcelas.length - 1; i >= 0; i--) {
      if (parcelas[i].formaPagamento === 'DINHEIRO') {
        idxDinheiro = i
        break
      }
    }
    let remaining = excesso
    if (idxDinheiro >= 0 && remaining > 0.001) {
      const deduct = Math.min(parcelas[idxDinheiro].valor, remaining)
      parcelas[idxDinheiro].valor = roundMoney2(parcelas[idxDinheiro].valor - deduct)
      remaining = roundMoney2(remaining - deduct)
    }
    for (let i = parcelas.length - 1; i >= 0 && remaining > 0.001; i--) {
      if (i === idxDinheiro) continue
      const deduct = Math.min(parcelas[i].valor, remaining)
      parcelas[i].valor = roundMoney2(parcelas[i].valor - deduct)
      remaining = roundMoney2(remaining - deduct)
    }
  }

  const filtradas = parcelas.filter((p) => p.valor > 0)
  return filtradas.length > 0
    ? filtradas
    : [{ formaPagamento: pagamentos[0]?.formaPagamento ?? 'DINHEIRO', valor: 0 }]
}

/**
 * Ponto único de montagem do payload de finalização de venda — antes disto,
 * a construção acontecia inline no handler de clique de "Finalizar" em
 * `CaixaPageClient.tsx`, reconciliando manualmente 7 fontes de estado
 * independentes (ver ARQUITETURA_CANONICA_PDV.md seção 1.1). Esta função não
 * move os donos do estado (ainda espalhados entre store/hooks/estado local) —
 * é o primeiro passo, seguro e testável isoladamente, de consolidar a
 * *montagem* num único lugar antes de consolidar a *posse* do estado.
 *
 * Comportamento idêntico ao código anterior: mesmo snapshot imutável +
 * validação fail-fast, mesma normalização de troco, mesmo payload final.
 *
 * `idempotencyKey` não é parâmetro aqui de propósito: a geração/atribuição do
 * ref só deve ocorrer depois que esta função confirma que a venda é válida
 * (mesma ordem do código original) — o caller mescla o campo no payload
 * retornado.
 */
export function buildFinalizarVendaPayload(
  input: BuildFinalizarVendaPayloadInput,
): BuildFinalizarVendaPayloadResult {
  const checkoutSnapshot = buildCheckoutSnapshot(input.itens, {
    totalBruto: input.totalBruto,
    totalLiquido: input.totalLiquido,
    totalDesconto: input.totalDesconto,
  })
  const snapshotCheck = validateCheckoutSnapshot(checkoutSnapshot)
  if (!snapshotCheck.ok) {
    return { ok: false, violations: snapshotCheck.violations }
  }

  const parcelasParaEnviar = normalizarParcelasComTroco(
    input.pagamentos,
    input.totalLiquidoComGerente,
  )

  const payload: FinalizarVendaInput = {
    formaPagamento: input.pagamentos[0]?.formaPagamento ?? 'DINHEIRO',
    totalBruto: input.totalBruto,
    totalDesconto:
      input.descontoGerentePercentualEfetivo > 0
        ? roundMoney2(input.totalDesconto + input.valorDescontoGerente)
        : input.totalDesconto,
    totalLiquido: input.totalLiquidoComGerente,
    descontoGerenteToken:
      input.descontoGerentePercentualEfetivo > 0 ? input.gerenteToken ?? undefined : undefined,
    descontoGerentePercentual:
      input.descontoGerentePercentualEfetivo > 0 ? input.descontoGerentePercentualEfetivo : undefined,
    pagamentos: parcelasParaEnviar,
    // Itens derivados do snapshot imutável já validado — não do carrinho mutável.
    itens: checkoutSnapshot.itens.map((i) => ({
      produtoId: i.produtoId,
      quantidade: i.quantidade,
      precoOriginal: i.precoOriginal,
      precoUnitario: i.precoUnitario,
      tipoPreco: i.tipoPreco,
    })),
    clienteId: input.clienteId ?? undefined,
  }

  return { ok: true, payload }
}
