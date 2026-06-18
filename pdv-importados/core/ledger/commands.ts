import { randomUUID } from 'crypto'
import { CASH, COGS, DISCOUNTS, INVENTORY, SALES_REVENUE } from './chartOfAccounts'
import { toCents } from './money'
import type { JournalEntry } from './types'

/** Venda à vista: DR Caixa / CR Receita de Vendas. */
export function createSaleEntry(params: {
  totalLiquidoReais: number
  vendaId: string
  description?: string
}): JournalEntry {
  const amount = toCents(params.totalLiquidoReais)
  return {
    id: randomUUID(),
    createdAt: new Date(),
    description: params.description ?? `Venda ${params.vendaId}`,
    referenceId: params.vendaId,
    lines: [
      { account: CASH,          direction: 'DEBIT',  amount },
      { account: SALES_REVENUE, direction: 'CREDIT', amount },
    ],
  }
}

/** Desconto concedido: DR Descontos / CR Caixa (reduz o recebimento). */
export function createDiscountEntry(params: {
  descontoReais: number
  vendaId: string
}): JournalEntry {
  const amount = toCents(params.descontoReais)
  return {
    id: randomUUID(),
    createdAt: new Date(),
    description: `Desconto venda ${params.vendaId}`,
    referenceId: params.vendaId,
    lines: [
      { account: DISCOUNTS, direction: 'DEBIT',  amount },
      { account: CASH,      direction: 'CREDIT', amount },
    ],
  }
}

/** Compra de estoque a vista: DR Estoque / CR Caixa. */
export function createStockPurchaseEntry(params: {
  valorTotalReais: number
  referenceId: string
  description?: string
}): JournalEntry {
  const amount = toCents(params.valorTotalReais)
  return {
    id: randomUUID(),
    createdAt: new Date(),
    description: params.description ?? `Compra estoque ${params.referenceId}`,
    referenceId: params.referenceId,
    lines: [
      { account: INVENTORY, direction: 'DEBIT',  amount },
      { account: CASH,      direction: 'CREDIT', amount },
    ],
  }
}

/**
 * CMV — Custo da Mercadoria Vendida: DR COGS / CR Estoque.
 * Usar custoUnitarioSnap × quantidade de cada item da venda.
 */
export function createCOGSEntry(params: {
  custoTotalReais: number
  vendaId: string
}): JournalEntry {
  const amount = toCents(params.custoTotalReais)
  return {
    id: randomUUID(),
    createdAt: new Date(),
    description: `CMV venda ${params.vendaId}`,
    referenceId: params.vendaId,
    lines: [
      { account: COGS,      direction: 'DEBIT',  amount },
      { account: INVENTORY, direction: 'CREDIT', amount },
    ],
  }
}
