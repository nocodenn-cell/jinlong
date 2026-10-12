import { describe, expect, it } from 'vitest'
import { apresentacaoPrecoLinha } from './apresentacaoPrecoLinha'

describe('apresentacaoPrecoLinha', () => {
  it('mostra o unitário efetivo do atacado, o subtotal e o mínimo', () => {
    const linha = apresentacaoPrecoLinha({
      quantidade: 12,
      resultado: {
        precoUnitario: 8,
        precoOriginal: 10,
        tipoPreco: 'ATACADO',
        quantidadeMinima: 12,
      },
    })
    expect(linha.unitario).toBe(8)
    expect(linha.subtotal).toBe(96)
    expect(linha.descontoLinha).toBe(24)
    expect(linha.rotulo).toBe('Atacado')
    expect(linha.quantidadeMinima).toBe(12)
    expect(linha.exibeReferencia).toBe(true)
  })

  it('manual não é rotulado como varejo', () => {
    const linha = apresentacaoPrecoLinha({
      quantidade: 1,
      resultado: { precoUnitario: 9, precoOriginal: 10, tipoPreco: 'MANUAL' },
    })
    expect(linha.modalidade).toBe('MANUAL')
    expect(linha.rotulo).toBe('Manual')
  })

  it('varejo sem diferença não exibe desconto', () => {
    const linha = apresentacaoPrecoLinha({
      quantidade: 2,
      resultado: { precoUnitario: 10, precoOriginal: 10, tipoPreco: 'VAREJO' },
    })
    expect(linha.descontoLinha).toBe(0)
    expect(linha.subtotal).toBe(20)
    expect(linha.rotulo).toBe('Varejo')
  })
})
