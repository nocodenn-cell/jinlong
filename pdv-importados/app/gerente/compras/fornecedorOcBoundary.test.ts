import { describe, expect, it } from 'vitest'
import { mensagemSeFornecedorForaDaLoja, mensagemSeProdutosForaDaLoja } from './fornecedorOcBoundary'

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

describe('mensagemSeProdutosForaDaLoja', () => {
  it('permite lista vazia de produto_id (itens só com descrição)', () => {
    expect(
      mensagemSeProdutosForaDaLoja({
        produtoIds: [],
        produtosEncontrados: [],
        lojaIdOc: 'loja-a',
      }),
    ).toBeNull()
  })

  it('permite produtos todos da mesma loja', () => {
    expect(
      mensagemSeProdutosForaDaLoja({
        produtoIds: ['p1', 'p2'],
        produtosEncontrados: [
          { id: 'p1', loja_id: 'loja-a' },
          { id: 'p2', loja_id: 'loja-a' },
        ],
        lojaIdOc: 'loja-a',
      }),
    ).toBeNull()
  })

  it('rejeita produto de outra loja', () => {
    expect(
      mensagemSeProdutosForaDaLoja({
        produtoIds: ['p1'],
        produtosEncontrados: [{ id: 'p1', loja_id: 'loja-b' }],
        lojaIdOc: 'loja-a',
      }),
    ).toMatch(/inválido/i)
  })

  it('rejeita produto inexistente (ausente do resultado da query)', () => {
    expect(
      mensagemSeProdutosForaDaLoja({
        produtoIds: ['p-fantasma'],
        produtosEncontrados: [],
        lojaIdOc: 'loja-a',
      }),
    ).toMatch(/inválido/i)
  })

  it('payload misto: um produto próprio + um de outra loja rejeita a OC inteira', () => {
    expect(
      mensagemSeProdutosForaDaLoja({
        produtoIds: ['p1', 'p2'],
        produtosEncontrados: [
          { id: 'p1', loja_id: 'loja-a' },
          { id: 'p2', loja_id: 'loja-b' },
        ],
        lojaIdOc: 'loja-a',
      }),
    ).toMatch(/inválido/i)
  })

  it('produto_id duplicado nos itens não escapa da checagem', () => {
    expect(
      mensagemSeProdutosForaDaLoja({
        produtoIds: ['p1', 'p1'],
        produtosEncontrados: [{ id: 'p1', loja_id: 'loja-b' }],
        lojaIdOc: 'loja-a',
      }),
    ).toMatch(/inválido/i)
  })
})
