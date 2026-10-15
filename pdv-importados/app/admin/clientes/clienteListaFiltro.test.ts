import { describe, expect, it } from 'vitest'
import { clienteIdsComTituloVencido } from './clienteListaFiltro'
import { limiteDisponivel, resumirTitulosCliente } from './clienteFinanceiroResumo'
import { escopoCrediario } from '@/app/gerente/clientes/clienteListaEscopo'

describe('clienteListaFiltro', () => {
  it('separa atraso de saldo em aberto sem vencimento', () => {
    const ids = clienteIdsComTituloVencido(
      [
        { cliente_id: 'a', status: 'ABERTO', vencimento: '2026-01-01' },
        { cliente_id: 'b', status: 'ABERTO', vencimento: null },
        { cliente_id: 'c', status: 'PAGO', vencimento: '2026-01-01' },
        { cliente_id: 'a', status: 'PARCIAL', vencimento: '2026-01-02' },
      ],
      '2026-02-01',
    )
    expect(ids).toEqual(['a'])
  })
})

describe('resumo financeiro do cliente', () => {
  it('soma só títulos já marcados como atrasados e limita o disponível a zero', () => {
    expect(resumirTitulosCliente([
      { valorAberto: 10, atrasado: true, vencimento: '2026-01-01' },
      { valorAberto: 5, atrasado: false, vencimento: null },
    ])).toEqual({ vencido: 10, comVencimento: 1, totalTitulos: 2 })
    expect(limiteDisponivel(0, 20)).toBe(0)
    expect(limiteDisponivel(100, 40)).toBe(60)
  })
})

describe('escopo do crediário exibido', () => {
  it('diz se a soma é da lista inteira, filtrada ou parcial', () => {
    expect(escopoCrediario(false, false)).toBe('todos')
    expect(escopoCrediario(true, false)).toBe('filtrado')
    expect(escopoCrediario(false, true)).toBe('parcial')
  })
})
