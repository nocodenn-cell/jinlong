import type { PDVContext } from './pdvContext'

export const PDV_INVARIANT_VIOLATION_CODES = [
  'CAIXA_INCONSISTENT',
  'FECHAMENTO_INVALIDO',
] as const

export type PdvInvariantViolationCode = (typeof PDV_INVARIANT_VIOLATION_CODES)[number]

export type PdvValidationMode = 'strict' | 'observational'

export type PdvViolationSeverity = 'error' | 'warning'

export type PdvViolationLayer = 'invariant' | 'mode'

export type PdvSeveritySummary = 'all-ok' | 'warnings' | 'errors'

export type PdvCaixaRow = {
  id: string
  operador_id: string | null
  loja_id: string
  status: string
  valor_inicial: number
  valor_fechamento: number | null
  fechamento_diferenca: number | null
  fechamento_observacao: string | null
  data_abertura: string
  data_fechamento: string | null
}

export type PdvVendaRow = {
  id: string
  caixa_id: string | null
  status: string
  total_liquido: number
  forma_pagamento: string
}

export type PdvItemVendaRow = {
  id: string
  venda_id: string
  produto_id: string
  quantidade: number
  preco_unitario: number
  desconto_unitario: number
}

export type PdvStateSnapshot = {
  generatedAt: string
  caixaVersion: number
  caixa: PdvCaixaRow
  vendas: PdvVendaRow[]
  itensPorVenda: Record<string, PdvItemVendaRow[]>
  valorSistemaCalculado: number
}

export type ValidatePdvStateOptions = {
  mode: PdvValidationMode
  context: PDVContext
  invariantAssert: boolean
}

export type PdvViolation = {
  code: string
  message: string
  severity: PdvViolationSeverity
  layer: PdvViolationLayer
}

export type PdvValidationResult = {
  ok: boolean
  mode: PdvValidationMode
  context: PDVContext
  invariantAssert: boolean
  violations: PdvViolation[]
  meta: {
    severitySummary: PdvSeveritySummary
  }
}
