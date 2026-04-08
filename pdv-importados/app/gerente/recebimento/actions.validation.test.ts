import { describe, expect, it } from 'vitest'
import { validarRemessaInput } from './actions'

describe('recebimento/actions validações', () => {
  it('exige origem e item', () => {
    expect(validarRemessaInput({ origem: '', itens: [] })).toBe('Informe a origem da remessa.')
    expect(validarRemessaInput({ origem: 'Origem', itens: [] })).toBe('Inclua ao menos um item.')
  })

  it('valida item da remessa', () => {
    expect(
      validarRemessaInput({
        origem: 'Container',
        itens: [{ produto_id: '', quantidade_esperada: 1, quantidade_conferida: 1 }],
      }),
    ).toBe('Produto inválido na remessa.')

    expect(
      validarRemessaInput({
        origem: 'Container',
        itens: [{ produto_id: 'p1', quantidade_esperada: -1, quantidade_conferida: 1 }],
      }),
    ).toBe('Quantidade esperada inválida.')

    expect(
      validarRemessaInput({
        origem: 'Container',
        itens: [{ produto_id: 'p1', quantidade_esperada: 1, quantidade_conferida: -1 }],
      }),
    ).toBe('Quantidade conferida inválida.')
  })

  it('aceita payload válido', () => {
    expect(
      validarRemessaInput({
        origem: 'Container 01',
        itens: [{ produto_id: 'p1', quantidade_esperada: 10, quantidade_conferida: 9.5 }],
      }),
    ).toBeNull()
  })
})
