import { describe, expect, it } from 'vitest'
import { mensagemSeFornecedorForaDaLoja } from './fornecedorOcBoundary'

describe('mensagemSeFornecedorForaDaLoja', () => {
  it('permite fornecedor da mesma loja', () => {
    expect(
      mensagemSeFornecedorForaDaLoja({
        fornecedorId: 'f-a',
        fornecedorLojaId: 'loja-a',
        lojaIdOc: 'loja-a',
      }),
    ).toBeNull()
  })

  it('rejeita fornecedor de outra loja', () => {
    expect(
      mensagemSeFornecedorForaDaLoja({
        fornecedorId: 'f-b',
        fornecedorLojaId: 'loja-b',
        lojaIdOc: 'loja-a',
      }),
    ).toMatch(/inválido/i)
  })

  it('rejeita fornecedor inexistente (loja_id ausente)', () => {
    expect(
      mensagemSeFornecedorForaDaLoja({
        fornecedorId: 'missing',
        fornecedorLojaId: null,
        lojaIdOc: 'loja-a',
      }),
    ).toMatch(/inválido/i)
  })

  it('permite ausência de fornecedor_id (nome livre)', () => {
    expect(
      mensagemSeFornecedorForaDaLoja({
        fornecedorId: null,
        fornecedorLojaId: null,
        lojaIdOc: 'loja-a',
      }),
    ).toBeNull()
  })
})
