import { describe, expect, it } from 'vitest'
import type { ProductExclusionFacts } from '../contracts'
import {
  decideProductExclusion,
  produtoTemReferenciaOperacional,
} from './exclusionPolicy'

function facts(over: Partial<ProductExclusionFacts> = {}): ProductExclusionFacts {
  return {
    ativo: true,
    temItensVenda: false,
    temRemessaItens: false,
    temMovimentosEstoque: false,
    temReposicoesCancelamento: false,
    temSaldoEstoque: false,
    ...over,
  }
}

describe('produtoTemReferenciaOperacional', () => {
  it('false quando limpo', () => {
    expect(produtoTemReferenciaOperacional(facts())).toBe(false)
  })

  it('true para cada referência operacional legada', () => {
    expect(produtoTemReferenciaOperacional(facts({ temItensVenda: true }))).toBe(true)
    expect(produtoTemReferenciaOperacional(facts({ temRemessaItens: true }))).toBe(true)
    expect(produtoTemReferenciaOperacional(facts({ temMovimentosEstoque: true }))).toBe(
      true,
    )
    expect(
      produtoTemReferenciaOperacional(facts({ temReposicoesCancelamento: true })),
    ).toBe(true)
  })

  it('saldo de estoque sozinho NÃO é referência operacional', () => {
    expect(produtoTemReferenciaOperacional(facts({ temSaldoEstoque: true }))).toBe(false)
  })
})

describe('decideProductExclusion', () => {
  it('produto sem histórico → delete', () => {
    expect(decideProductExclusion(facts())).toEqual({ action: 'delete' })
  })

  it('produto vendido (itens_venda) → inactivate', () => {
    expect(decideProductExclusion(facts({ temItensVenda: true }))).toEqual({
      action: 'inactivate',
      alreadyInactive: false,
    })
  })

  it('produto com estoque (só saldo) → delete — saldo não bloqueia', () => {
    expect(decideProductExclusion(facts({ temSaldoEstoque: true }))).toEqual({
      action: 'delete',
    })
  })

  it('produto com movimentos de estoque → inactivate', () => {
    expect(decideProductExclusion(facts({ temMovimentosEstoque: true }))).toEqual({
      action: 'inactivate',
      alreadyInactive: false,
    })
  })

  it('bloqueado e já inativo → inactivate alreadyInactive', () => {
    expect(
      decideProductExclusion(facts({ temItensVenda: true, ativo: false })),
    ).toEqual({
      action: 'inactivate',
      alreadyInactive: true,
    })
  })

  it('remessa_itens ou reposições também bloqueiam delete', () => {
    expect(decideProductExclusion(facts({ temRemessaItens: true })).action).toBe(
      'inactivate',
    )
    expect(
      decideProductExclusion(facts({ temReposicoesCancelamento: true })).action,
    ).toBe('inactivate')
  })
})
