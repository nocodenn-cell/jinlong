import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryLedger } from '../adapters/InMemoryLedger'
import { LedgerEngine } from '../LedgerEngine'
import { createCOGSEntry, createDiscountEntry, createSaleEntry, createStockPurchaseEntry } from '../commands'
import { getAccountBalance } from '../queries'
import { toReais } from '../money'

describe('getAccountBalance', () => {
  let ledger: InMemoryLedger
  let engine: LedgerEngine

  beforeEach(() => {
    ledger = new InMemoryLedger()
    engine = new LedgerEngine(ledger)
  })

  it('saldo CASH após venda de R$ 100 = 10000¢', async () => {
    await engine.postEntry(createSaleEntry({ totalLiquidoReais: 100, vendaId: 'v1' }))
    const balance = await getAccountBalance(ledger, 'CASH')
    expect(balance).toBe(10000)
    expect(toReais(balance)).toBe(100)
  })

  it('saldo SALES_REVENUE após venda de R$ 100 = -10000¢ (conta de crédito)', async () => {
    await engine.postEntry(createSaleEntry({ totalLiquidoReais: 100, vendaId: 'v1' }))
    const balance = await getAccountBalance(ledger, 'SALES_REVENUE')
    expect(balance).toBe(-10000)
  })

  it('saldo CASH após venda R$ 100 e desconto R$ 10 = 9000¢', async () => {
    await engine.postEntry(createSaleEntry({ totalLiquidoReais: 100, vendaId: 'v2' }))
    await engine.postEntry(createDiscountEntry({ descontoReais: 10, vendaId: 'v2' }))
    const balance = await getAccountBalance(ledger, 'CASH')
    expect(balance).toBe(9000)
  })

  it('saldo DISCOUNTS após desconto R$ 10 = 10000¢ positivo (conta de despesa)', async () => {
    await engine.postEntry(createDiscountEntry({ descontoReais: 10, vendaId: 'v3' }))
    const balance = await getAccountBalance(ledger, 'DISCOUNTS')
    expect(balance).toBe(1000)
  })

  it('INVENTORY aumenta com compra e diminui com CMV', async () => {
    await engine.postEntry(createStockPurchaseEntry({ valorTotalReais: 200, referenceId: 'c1' }))
    await engine.postEntry(createCOGSEntry({ custoTotalReais: 80, vendaId: 'v4' }))
    const balance = await getAccountBalance(ledger, 'INVENTORY')
    expect(balance).toBe(12000) // 20000 - 8000
  })

  it('conta sem lançamentos retorna saldo zero', async () => {
    const balance = await getAccountBalance(ledger, 'EXPENSES')
    expect(balance).toBe(0)
  })

  it('múltiplas vendas acumulam corretamente', async () => {
    await engine.postEntry(createSaleEntry({ totalLiquidoReais: 50, vendaId: 'v5' }))
    await engine.postEntry(createSaleEntry({ totalLiquidoReais: 75, vendaId: 'v6' }))
    const balance = await getAccountBalance(ledger, 'CASH')
    expect(balance).toBe(12500) // 5000 + 7500
  })
})
