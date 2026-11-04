import { describe, expect, it } from 'vitest'
import { primeiroItemComQuantidadeInvalida } from '@shared/format/unidadeMedida'

const UN_ID = '11111111-1111-4111-8111-111111111111'
const KG_ID = '22222222-2222-4222-8222-222222222222'
const M_ID = '33333333-3333-4333-8333-333333333333'

const produtos = [
  { id: UN_ID, nome: 'Chaleira', unidade_medida: 'UN' },
  { id: KG_ID, nome: 'Castanha', unidade_medida: 'KG' },
  { id: M_ID, nome: 'Cordão', unidade_medida: 'M' },
]

describe('primeiroItemComQuantidadeInvalida', () => {
  it('aceita quantidade inteira em UN e fração em KG e M', () => {
    expect(
      primeiroItemComQuantidadeInvalida(
        [
          { produtoId: UN_ID, quantidade: 3 },
          { produtoId: KG_ID, quantidade: 0.125 },
          { produtoId: M_ID, quantidade: 2.5 },
        ],
        produtos,
      ),
    ).toBeNull()
  })

  it('rejeita fração em UN, informando nome e unidade', () => {
    expect(
      primeiroItemComQuantidadeInvalida([{ produtoId: UN_ID, quantidade: 2.5 }], produtos),
    ).toEqual({ nome: 'Chaleira', unidade: 'UN' })
  })

  it('devolve o primeiro item inválido quando há mais de um', () => {
    expect(
      primeiroItemComQuantidadeInvalida(
        [
          { produtoId: KG_ID, quantidade: 1 },
          { produtoId: UN_ID, quantidade: 1.5 },
          { produtoId: UN_ID, quantidade: 2.5 },
        ],
        produtos,
      ),
    ).toEqual({ nome: 'Chaleira', unidade: 'UN' })
  })

  it('trata produto com unidade ausente como UN', () => {
    expect(
      primeiroItemComQuantidadeInvalida(
        [{ produtoId: 'x', quantidade: 1.5 }],
        [{ id: 'x', nome: 'Sem unidade', unidade_medida: null }],
      ),
    ).toEqual({ nome: 'Sem unidade', unidade: 'UN' })
  })

  it('ignora item cujo produto não está na lista (checado antes pelo chamador)', () => {
    expect(
      primeiroItemComQuantidadeInvalida([{ produtoId: 'fora', quantidade: 9.5 }], produtos),
    ).toBeNull()
  })
})
