import { describe, expect, it } from 'vitest'
import pt from '../../../src/lib/i18n/pt.json'
import zh from '../../../src/lib/i18n/zh.json'
import { validarRemessaInput, validarVinculoOrdemCompra } from './actions.validation'

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

    expect(
      validarRemessaInput({
        origem: 'Container',
        itens: [{ produto_id: 'p1', quantidade_esperada: 0, quantidade_conferida: 1 }],
      }),
    ).toBe('Quantidade esperada deve ser maior que zero.')

    expect(
      validarRemessaInput({
        origem: 'Container',
        itens: [{ produto_id: 'p1', quantidade_esperada: 1, quantidade_conferida: 0 }],
      }),
    ).toBe('Quantidade conferida deve ser maior que zero para confirmar a entrada.')
  })

  it('aceita payload válido', () => {
    expect(
      validarRemessaInput({
        origem: 'Container 01',
        itens: [{ produto_id: 'p1', quantidade_esperada: 10, quantidade_conferida: 9.5 }],
      }),
    ).toBeNull()
  })

  it('UX-04 — validarVinculoOrdemCompra: só CONFIRMADA/EM_TRANSITO recebem entrada; encerrada, cancelada e rascunho são recusadas', () => {
    expect(validarVinculoOrdemCompra('CONFIRMADA')).toBeNull()
    expect(validarVinculoOrdemCompra('EM_TRANSITO')).toBeNull()
    expect(validarVinculoOrdemCompra('RECEBIDA')).toContain('já está encerrada')
    expect(validarVinculoOrdemCompra('CANCELADA')).toContain('foi cancelada')
    expect(validarVinculoOrdemCompra('RASCUNHO')).toContain('Confirme a ordem de compra')
  })

  it('informa em português e chinês que é preciso selecionar produto e quantidade positiva', () => {
    // RecebimentoGerentePageClient dispara este mesmo toast tanto quando
    // produto_id está vazio quanto quando a quantidade é inválida — a
    // mensagem precisa cobrir os dois casos, não só quantidade.
    expect(pt.gerente.recebimento_page.toast_dados_invalidos).toBe(
      'Selecione um produto e informe quantidades maiores que zero.',
    )
    expect(zh.gerente.recebimento_page.toast_dados_invalidos).toBe('请选择商品并输入大于 0 的数量。')
  })
})
