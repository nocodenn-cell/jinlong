import { describe, expect, it } from 'vitest'
import { expandirEtiquetas } from './gerarPdf'
import { gerarPdfEtiquetas } from './gerarPdf'
import { getEtiquetaConfig } from './EtiquetaConfig'
import type { ItemCarrinho } from './types'

const item = (id: string, quantidade: number): ItemCarrinho => ({
  produtoId: id,
  nome: `Produto ${id}`,
  codigoBarras: '7891234567895',
  precoVarejo: 10,
  quantidade,
})

describe('expandirEtiquetas', () => {
  it('gera `quantidade` cópias por produto, na ordem do carrinho', () => {
    const out = expandirEtiquetas([item('a', 2), item('b', 3)])
    expect(out.map((i) => i.produtoId)).toEqual(['a', 'a', 'b', 'b', 'b'])
  })

  it('ignora quantidade 0, negativa ou inválida', () => {
    const out = expandirEtiquetas([item('a', 0), item('b', -1), item('c', Number.NaN), item('d', 1)])
    expect(out.map((i) => i.produtoId)).toEqual(['d'])
  })

  it('quantidade fracionária é truncada', () => {
    expect(expandirEtiquetas([item('a', 2.9)])).toHaveLength(2)
  })
})

describe('gerarPdfEtiquetas — validações', () => {
  const config = getEtiquetaConfig()

  it('limite conta etiquetas, não produtos', async () => {
    await expect(
      gerarPdfEtiquetas([item('a', config.maxEtiquetasPorPdf + 1)], { config }),
    ).rejects.toThrow(/Máximo/)
  })

  it('carrinho sem nenhuma etiqueta a imprimir falha com mensagem clara', async () => {
    await expect(gerarPdfEtiquetas([item('a', 0)], { config })).rejects.toThrow(/Nenhuma etiqueta/)
  })
})
