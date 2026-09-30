import { describe, expect, it } from 'vitest'
import { adminEstoqueRecebimentoProdutoQuery, ROUTES } from '@/lib/navigation/routes'

describe('adminEstoqueRecebimentoProdutoQuery (RM-02 — "Repor" a partir do estoque crítico)', () => {
  it('monta a URL do recebimento com o produto na query string', () => {
    expect(adminEstoqueRecebimentoProdutoQuery('produto-123')).toBe(
      `${ROUTES.admin.estoqueRecebimento}?produto=produto-123`,
    )
  })

  it('não adiciona query string para um id vazio', () => {
    expect(adminEstoqueRecebimentoProdutoQuery('')).toBe(ROUTES.admin.estoqueRecebimento)
    expect(adminEstoqueRecebimentoProdutoQuery('   ')).toBe(ROUTES.admin.estoqueRecebimento)
  })
})
