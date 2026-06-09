import { describe, expect, it } from 'vitest'
import {
  buildMapaProdutoChaves,
  resolverProdutoNoCatalogo,
  variantesChaveLeitura,
  type ProdutoCacheLite,
} from './catalogoLookup'

const produto: ProdutoCacheLite = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  nome: 'Café Premium 500g',
  codigo_barras: '0078901234567',
  preco_varejo: 19.9,
  categoria_id: null,
  ativo: true,
  status_publicacao: 'PUBLICADO',
}

describe('variantesChaveLeitura', () => {
  it('remove zeros à esquerda nos dígitos', () => {
    expect(variantesChaveLeitura('0078901234567')).toContain('78901234567')
  })

  it('aceita leitura com sufixo numérico extra (prefixo EAN)', () => {
    const longa = '00789012345679999'
    expect(variantesChaveLeitura(longa)).toContain('0078901234567')
  })

  it('EAN com zero à esquerda e dígitos extras: inclui GTIN-13 sem zeros à esquerda', () => {
    const lida = '07891234567890'
    expect(variantesChaveLeitura(lida)).toContain('7891234567890')
    expect(variantesChaveLeitura(lida)).toContain('0789123456789')
  })
})

describe('buildMapaProdutoChaves — idempotência de chave', () => {
  it('mantém o primeiro produto ativo quando dois compartilham variante de código', () => {
    const primeiro: ProdutoCacheLite = {
      ...produto,
      id: '11111111-1111-1111-1111-111111111111',
      nome: 'Primeiro',
      codigo_barras: '0078901234567',
    }
    const segundo: ProdutoCacheLite = {
      ...produto,
      id: '22222222-2222-2222-2222-222222222222',
      nome: 'Segundo',
      codigo_barras: '0078901234567',
    }
    const mapa = buildMapaProdutoChaves([primeiro, segundo])
    expect(mapa['78901234567']?.id).toBe(primeiro.id)
    expect(mapa['78901234567']?.nome).toBe('Primeiro')
  })
})

describe('resolverProdutoNoCatalogo', () => {
  it('resolve por código normalizado mesmo com zeros à esquerda na leitura', () => {
    const mapa = buildMapaProdutoChaves([produto])
    const cat = [produto]
    expect(
      resolverProdutoNoCatalogo('78901234567', mapa, cat)?.id
    ).toBe(produto.id)
  })

  it('resolve por UUID', () => {
    const mapa = buildMapaProdutoChaves([produto])
    expect(
      resolverProdutoNoCatalogo(
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        mapa,
        [produto]
      )?.nome
    ).toBe('Café Premium 500g')
  })

  it('resolve por várias palavras no nome', () => {
    const mapa = buildMapaProdutoChaves([produto])
    expect(
      resolverProdutoNoCatalogo('café 500', mapa, [produto])?.id
    ).toBe(produto.id)
  })

  it('ignora produto DRAFT mesmo com ativo=true (drift)', () => {
    const draft: ProdutoCacheLite = {
      ...produto,
      id: 'draft-id',
      ativo: true,
      status_publicacao: 'DRAFT',
    }
    const mapa = buildMapaProdutoChaves([draft])
    expect(mapa[produto.codigo_barras!]).toBeUndefined()
    expect(resolverProdutoNoCatalogo('78901234567', mapa, [draft])).toBeUndefined()
  })
})
