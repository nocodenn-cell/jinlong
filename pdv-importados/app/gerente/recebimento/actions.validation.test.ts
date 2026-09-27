import { describe, expect, it } from 'vitest'
import pt from '../../../src/lib/i18n/pt.json'
import zh from '../../../src/lib/i18n/zh.json'
import { validarRemessaInput } from './actions.validation'

function item(overrides: Partial<Parameters<typeof validarRemessaInput>[0]['itens'][0]> = {}) {
  return {
    produto_id: 'p1',
    quantidade_esperada: 1,
    quantidade_conferida: 1,
    custo_unitario: 10,
    ...overrides,
  }
}

describe('recebimento/actions validações', () => {
  it('exige fornecedor e item', () => {
    expect(validarRemessaInput({ fornecedor_id: '', itens: [] })).toBe('Selecione o fornecedor.')
    expect(validarRemessaInput({ fornecedor_id: 'f1', itens: [] })).toBe('Inclua ao menos um item.')
  })

  it('valida item da remessa', () => {
    expect(
      validarRemessaInput({ fornecedor_id: 'f1', itens: [item({ produto_id: '' })] }),
    ).toBe('Produto inválido na remessa.')

    expect(
      validarRemessaInput({ fornecedor_id: 'f1', itens: [item({ quantidade_esperada: -1 })] }),
    ).toBe('Quantidade esperada inválida.')

    expect(
      validarRemessaInput({ fornecedor_id: 'f1', itens: [item({ quantidade_conferida: -1 })] }),
    ).toBe('Quantidade conferida inválida.')

    expect(
      validarRemessaInput({ fornecedor_id: 'f1', itens: [item({ quantidade_esperada: 0 })] }),
    ).toBe('Quantidade esperada deve ser maior que zero.')

    expect(
      validarRemessaInput({ fornecedor_id: 'f1', itens: [item({ quantidade_conferida: 0 })] }),
    ).toBe('Quantidade conferida deve ser maior que zero para confirmar a entrada.')
  })

  it('T11: exige custo unitário maior que zero', () => {
    expect(
      validarRemessaInput({ fornecedor_id: 'f1', itens: [item({ custo_unitario: 0 })] }),
    ).toBe('Custo unitário deve ser maior que zero.')

    expect(
      validarRemessaInput({ fornecedor_id: 'f1', itens: [item({ custo_unitario: -5 })] }),
    ).toBe('Custo unitário deve ser maior que zero.')

    expect(
      validarRemessaInput({ fornecedor_id: 'f1', itens: [item({ custo_unitario: Number.NaN })] }),
    ).toBe('Custo unitário deve ser maior que zero.')
  })

  it('aceita payload válido', () => {
    expect(
      validarRemessaInput({
        fornecedor_id: 'f1',
        itens: [item({ quantidade_esperada: 10, quantidade_conferida: 9.5, custo_unitario: 12.5 })],
      }),
    ).toBeNull()
  })

  it('T11: mensagem do toast em português e chinês cobre fornecedor, produto, quantidade e custo', () => {
    expect(pt.gerente.recebimento_page.toast_dados_invalidos).toBe(
      'Selecione fornecedor e produto, e informe quantidades e custo unitário maiores que zero.',
    )
    expect(zh.gerente.recebimento_page.toast_dados_invalidos).toBe(
      '请选择供应商和商品，并输入大于 0 的数量与单位成本。',
    )
  })
})
