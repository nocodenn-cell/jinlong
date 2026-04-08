import { describe, expect, it } from 'vitest'
import {
  validarCriarClienteInput,
  validarCriarTituloInput,
  validarLiquidarTituloInput,
} from './actions'

describe('financeiro/actions validações', () => {
  it('valida criar cliente', () => {
    expect(validarCriarClienteInput({ nome: '' })).toBe('Nome obrigatório')
    expect(validarCriarClienteInput({ nome: ' Cliente ' })).toBeNull()
  })

  it('valida criar título', () => {
    expect(validarCriarTituloInput({ cliente_id: '', valor_total: 10 })).toBe('Cliente obrigatório')
    expect(validarCriarTituloInput({ cliente_id: 'c1', valor_total: 0 })).toBe('Valor inválido')
    expect(validarCriarTituloInput({ cliente_id: 'c1', valor_total: 12.5 })).toBeNull()
  })

  it('valida liquidar título', () => {
    expect(validarLiquidarTituloInput({ titulo_id: '', valor: 10 })).toBe('Título obrigatório')
    expect(validarLiquidarTituloInput({ titulo_id: 't1', valor: -1 })).toBe('Valor inválido para liquidação')
    expect(validarLiquidarTituloInput({ titulo_id: 't1', valor: 5 })).toBeNull()
  })
})
