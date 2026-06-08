import { PDVContext } from './pdvContext'
import type { PdvStateSnapshot, PdvViolation, ValidatePdvStateOptions } from './types'

export function makeSnapshot(overrides: Partial<PdvStateSnapshot> = {}): PdvStateSnapshot {
  return {
    generatedAt: '2026-06-08T12:00:00.000Z',
    caixaVersion: 1_718_000_000_000,
    caixa: {
      id: 'caixa-1',
      operador_id: 'op-1',
      loja_id: 'loja-1',
      status: 'FECHADO',
      valor_inicial: 100,
      valor_fechamento: 150,
      fechamento_diferenca: 0,
      fechamento_observacao: null,
      data_abertura: '2026-06-08T10:00:00.000Z',
      data_fechamento: '2026-06-08T18:00:00.000Z',
    },
    vendas: [
      {
        id: 'venda-1',
        caixa_id: 'caixa-1',
        status: 'CONCLUIDA',
        total_liquido: 50,
        forma_pagamento: 'DINHEIRO',
      },
    ],
    itensPorVenda: {
      'venda-1': [
        {
          id: 'item-1',
          venda_id: 'venda-1',
          produto_id: 'prod-1',
          quantidade: 1,
          preco_unitario: 50,
          desconto_unitario: 0,
        },
      ],
    },
    valorSistemaCalculado: 150,
    ...overrides,
  }
}

export function makeOptions(
  overrides: Partial<ValidatePdvStateOptions> = {},
): ValidatePdvStateOptions {
  return {
    mode: 'strict',
    context: PDVContext.TEST,
    invariantAssert: false,
    ...overrides,
  }
}

export function modeViolation(code = 'VENDA_TOTAL_DIVERGENTE'): PdvViolation {
  return {
    code,
    message: 'mode rule',
    severity: 'warning',
    layer: 'mode',
  }
}
