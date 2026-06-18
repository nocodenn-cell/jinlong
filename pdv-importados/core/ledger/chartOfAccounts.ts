import type { Account } from './types'

export const CASH: Account = {
  id: 'CASH',
  name: 'Caixa',
  type: 'ASSET',
  normalBalance: 'DEBIT',
}

export const SALES_REVENUE: Account = {
  id: 'SALES_REVENUE',
  name: 'Receita de Vendas',
  type: 'REVENUE',
  normalBalance: 'CREDIT',
}

export const COGS: Account = {
  id: 'COGS',
  name: 'Custo da Mercadoria Vendida (CMV)',
  type: 'EXPENSE',
  normalBalance: 'DEBIT',
}

export const INVENTORY: Account = {
  id: 'INVENTORY',
  name: 'Estoque',
  type: 'ASSET',
  normalBalance: 'DEBIT',
}

export const EXPENSES: Account = {
  id: 'EXPENSES',
  name: 'Despesas Operacionais',
  type: 'EXPENSE',
  normalBalance: 'DEBIT',
}

export const DISCOUNTS: Account = {
  id: 'DISCOUNTS',
  name: 'Descontos Concedidos',
  type: 'EXPENSE',
  normalBalance: 'DEBIT',
}

export const CHART_OF_ACCOUNTS: readonly Account[] = [
  CASH,
  SALES_REVENUE,
  COGS,
  INVENTORY,
  EXPENSES,
  DISCOUNTS,
]
