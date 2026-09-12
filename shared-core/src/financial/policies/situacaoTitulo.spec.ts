import { describe, expect, it } from 'vitest'
import {
  saldoTitulo,
  situacaoAtrasada,
  situacaoEmAberto,
  situacaoTitulo,
} from './situacaoTitulo'

const hoje = '2026-09-11'

function sit(over: Partial<Parameters<typeof situacaoTitulo>[0]>) {
  return situacaoTitulo({
    valorTotal: 5000,
    valorPago: 0,
    vencimento: '2026-10-01',
    status: 'PENDENTE',
    hoje,
    ...over,
  })
}

describe('situacaoTitulo — as seis situações do Bling + CANCELADO', () => {
  it('em aberto: nada pago, vencimento futuro', () => {
    expect(sit({})).toBe('EM_ABERTO')
  })

  it('vencendo hoje: nada pago, vencimento == hoje', () => {
    expect(sit({ vencimento: hoje })).toBe('VENCE_HOJE')
  })

  it('atrasado: nada pago, vencimento no passado', () => {
    expect(sit({ vencimento: '2026-09-10' })).toBe('ATRASADO')
  })

  it('parcial em dia: pago parcial, vencimento futuro', () => {
    expect(sit({ valorPago: 2000 })).toBe('PARCIAL_EM_DIA')
  })

  it('parcial em dia: pago parcial, vencendo hoje ainda é em dia', () => {
    expect(sit({ valorPago: 2000, vencimento: hoje })).toBe('PARCIAL_EM_DIA')
  })

  it('parcial atrasado: pago parcial, vencimento no passado', () => {
    expect(sit({ valorPago: 2000, vencimento: '2026-09-10' })).toBe('PARCIAL_ATRASADO')
  })

  it('quitado quando o status do banco diz PAGO, mesmo vencido', () => {
    expect(sit({ status: 'PAGO', vencimento: '2020-01-01' })).toBe('QUITADO')
  })

  it('cancelado tem precedência sobre vencimento e saldo', () => {
    expect(sit({ status: 'CANCELADO', vencimento: '2020-01-01', valorPago: 0 })).toBe('CANCELADO')
  })
})

describe('situacaoTitulo — bordas', () => {
  it('status legado ATRASADO não vira estado próprio: resolve por saldo e vencimento', () => {
    expect(sit({ status: 'ATRASADO', vencimento: '2026-09-10' })).toBe('ATRASADO')
    expect(sit({ status: 'ATRASADO', vencimento: '2026-12-01' })).toBe('EM_ABERTO')
  })

  it('AR usa ABERTO/PARCIAL como status e cai nas mesmas regras', () => {
    expect(sit({ status: 'ABERTO', vencimento: '2026-09-10' })).toBe('ATRASADO')
    expect(sit({ status: 'PARCIAL', valorPago: 1, vencimento: '2026-09-10' })).toBe('PARCIAL_ATRASADO')
  })

  it('sem vencimento nunca é atrasado nem vence hoje', () => {
    expect(sit({ vencimento: null })).toBe('EM_ABERTO')
    expect(sit({ vencimento: null, valorPago: 2000 })).toBe('PARCIAL_EM_DIA')
  })

  it('vencimento com hora (timestamp) compara só a data', () => {
    expect(sit({ vencimento: '2026-09-11T23:00:00Z' })).toBe('VENCE_HOJE')
    expect(sit({ vencimento: '2026-09-10T23:00:00Z' })).toBe('ATRASADO')
  })

  it('saldo zerado com status em aberto é exibido como quitado, não como pendência de R$ 0,00', () => {
    expect(sit({ valorPago: 5000, status: 'PENDENTE' })).toBe('QUITADO')
  })

  it('resíduo de centavo abaixo da tolerância conta como quitado', () => {
    expect(sit({ valorTotal: 5000, valorPago: 4999.998 })).toBe('QUITADO')
  })

  it('um centavo em aberto ainda é parcial, não quitado', () => {
    expect(sit({ valorTotal: 5000, valorPago: 4999.99 })).toBe('PARCIAL_EM_DIA')
  })
})

describe('saldoTitulo', () => {
  it('é a diferença entre total e pago', () => {
    expect(saldoTitulo(5000, 2000)).toBe(3000)
  })

  it('nunca é negativo — pagamento a maior não vira crédito', () => {
    expect(saldoTitulo(5000, 5200)).toBe(0)
  })

  it('trata valores ausentes como zero', () => {
    expect(saldoTitulo(5000, Number.NaN)).toBe(5000)
  })
})

describe('classificadores', () => {
  it('em aberto cobre tudo que ainda pede ação', () => {
    expect(situacaoEmAberto('EM_ABERTO')).toBe(true)
    expect(situacaoEmAberto('VENCE_HOJE')).toBe(true)
    expect(situacaoEmAberto('ATRASADO')).toBe(true)
    expect(situacaoEmAberto('PARCIAL_EM_DIA')).toBe(true)
    expect(situacaoEmAberto('PARCIAL_ATRASADO')).toBe(true)
    expect(situacaoEmAberto('QUITADO')).toBe(false)
    expect(situacaoEmAberto('CANCELADO')).toBe(false)
  })

  it('atrasada cobre as duas situações vencidas', () => {
    expect(situacaoAtrasada('ATRASADO')).toBe(true)
    expect(situacaoAtrasada('PARCIAL_ATRASADO')).toBe(true)
    expect(situacaoAtrasada('VENCE_HOJE')).toBe(false)
    expect(situacaoAtrasada('EM_ABERTO')).toBe(false)
  })
})
