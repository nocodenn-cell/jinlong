import { describe, expect, it } from 'vitest'
import { labelFormaPagamentoVenda, labelStatusVenda } from './vendaLabels'

const mockMensagens = {
  gerente: {
    pagamento_dinheiro: 'Dinheiro',
    pagamento_pix: 'PIX',
    forma_cartao_debito: 'Cartão Débito',
    forma_cartao_credito: 'Cartão Crédito',
    pagamento_cartao: 'Cartão',
    forma_outros: 'Outros',
    venda_status_concluida: 'Concluída',
    venda_status_cancelada: 'Cancelada',
  },
} as never

describe('labelFormaPagamentoVenda', () => {
  it('maps DINHEIRO', () => {
    expect(labelFormaPagamentoVenda('DINHEIRO', mockMensagens)).toBe('Dinheiro')
  })

  it('maps PIX', () => {
    expect(labelFormaPagamentoVenda('PIX', mockMensagens)).toBe('PIX')
  })

  it('maps CARTAO_DEBITO', () => {
    expect(labelFormaPagamentoVenda('CARTAO_DEBITO', mockMensagens)).toBe('Cartão Débito')
  })

  it('maps CARTAO_CREDITO', () => {
    expect(labelFormaPagamentoVenda('CARTAO_CREDITO', mockMensagens)).toBe('Cartão Crédito')
  })

  it('maps CARTAO', () => {
    expect(labelFormaPagamentoVenda('CARTAO', mockMensagens)).toBe('Cartão')
  })

  it('maps OUTROS and OUTRO', () => {
    expect(labelFormaPagamentoVenda('OUTROS', mockMensagens)).toBe('Outros')
    expect(labelFormaPagamentoVenda('OUTRO', mockMensagens)).toBe('Outros')
  })

  it('returns raw value for unknown codes', () => {
    expect(labelFormaPagamentoVenda('CHEQUE', mockMensagens)).toBe('CHEQUE')
  })

  it('returns dash for null', () => {
    expect(labelFormaPagamentoVenda(null, mockMensagens)).toBe('—')
  })

  it('is case-insensitive', () => {
    expect(labelFormaPagamentoVenda('dinheiro', mockMensagens)).toBe('Dinheiro')
  })
})

describe('labelStatusVenda', () => {
  it('maps CONCLUIDA', () => {
    expect(labelStatusVenda('CONCLUIDA', mockMensagens)).toBe('Concluída')
  })

  it('maps CANCELADA', () => {
    expect(labelStatusVenda('CANCELADA', mockMensagens)).toBe('Cancelada')
  })

  it('returns raw value for unknown', () => {
    expect(labelStatusVenda('PENDENTE', mockMensagens)).toBe('PENDENTE')
  })

  it('returns dash for null', () => {
    expect(labelStatusVenda(null, mockMensagens)).toBe('—')
  })
})
