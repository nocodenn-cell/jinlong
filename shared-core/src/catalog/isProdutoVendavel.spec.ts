import { describe, expect, it } from 'vitest'
import {
  filterProdutosVendaveis,
  isProdutoVendavel,
  STATUS_PUBLICACAO_PUBLICADO,
} from './isProdutoVendavel'

describe('isProdutoVendavel', () => {
  it('PUBLICADO + ativo=true → vendável', () => {
    expect(
      isProdutoVendavel({ ativo: true, status_publicacao: STATUS_PUBLICACAO_PUBLICADO }),
    ).toBe(true)
  })

  it('DRAFT + ativo=false → não vendável', () => {
    expect(isProdutoVendavel({ ativo: false, status_publicacao: 'DRAFT' })).toBe(false)
  })

  it('INATIVO + ativo=false → não vendável', () => {
    expect(isProdutoVendavel({ ativo: false, status_publicacao: 'INATIVO' })).toBe(false)
  })

  it('PUBLICADO + ativo=false (drift) → não vendável', () => {
    expect(isProdutoVendavel({ ativo: false, status_publicacao: 'PUBLICADO' })).toBe(false)
  })

  it('DRAFT + ativo=true (drift) → não vendável', () => {
    expect(isProdutoVendavel({ ativo: true, status_publicacao: 'DRAFT' })).toBe(false)
  })

  it('status ausente → não vendável', () => {
    expect(isProdutoVendavel({ ativo: true, status_publicacao: null })).toBe(false)
    expect(isProdutoVendavel({ ativo: true })).toBe(false)
  })

  it('filterProdutosVendaveis mantém só vendáveis', () => {
    const list = [
      { id: '1', ativo: true, status_publicacao: 'PUBLICADO' as const },
      { id: '2', ativo: false, status_publicacao: 'DRAFT' as const },
      { id: '3', ativo: true, status_publicacao: 'INATIVO' as const },
    ]
    expect(filterProdutosVendaveis(list).map((p) => p.id)).toEqual(['1'])
  })
})
