// D-11 paridade offline: o PDV local aplica o cadastro (preco_atacado + quantidade_gatilho_atacado)
// com as mesmas regras do fixture compartilhado (shared-core/src/pricing/fixtures/d11-paridade.json).
import { describe, expect, it } from 'vitest'
import { resolverPrecoCanonicoLocal, type PrecoCanonicoSnapshot } from './resolverPrecoCanonicoLocal'

const SNAP: PrecoCanonicoSnapshot = {
  lojaId: 'L1',
  quantidadeMinimaAtacadoPadrao: null,
  tiers: [],
}

const produto = (over: { preco_atacado?: number | null; quantidade_gatilho_atacado?: number | null } = {}) => ({
  id: 'p1',
  ativo: true,
  preco_varejo: 100,
  preco_atacado: 85,
  quantidade_gatilho_atacado: 8,
  ...over,
})

describe('D-11 offline: cadastro do produto como fonte de atacado', () => {
  it('abaixo do gatilho → varejo', () => {
    const r = resolverPrecoCanonicoLocal(produto(), 7, SNAP)
    expect(r.tipoPreco).toBe('VAREJO')
    expect(r.precoUnitario).toBe(100)
  })

  it('no gatilho → atacado do cadastro', () => {
    const r = resolverPrecoCanonicoLocal(produto(), 8, SNAP)
    expect(r.tipoPreco).toBe('ATACADO')
    expect(r.precoUnitario).toBe(85)
  })

  it('fracionada usa floor como na RPC (8,9 → 8)', () => {
    const r = resolverPrecoCanonicoLocal(produto(), 8.9, SNAP)
    expect(r.tipoPreco).toBe('ATACADO')
  })

  it('gatilho ausente no catálogo offline → regra do cadastro não aplica (alinha à RPC para gatilho nulo)', () => {
    const r = resolverPrecoCanonicoLocal(produto({ quantidade_gatilho_atacado: null }), 50, SNAP)
    expect(r.tipoPreco).toBe('VAREJO')
  })

  it('gatilho 0 ou atacado >= varejo são inválidos e ignorados', () => {
    expect(resolverPrecoCanonicoLocal(produto({ quantidade_gatilho_atacado: 0 }), 50, SNAP).tipoPreco).toBe('VAREJO')
    expect(resolverPrecoCanonicoLocal(produto({ preco_atacado: 100, quantidade_gatilho_atacado: 1 }), 5, SNAP).tipoPreco).toBe('VAREJO')
  })
})
