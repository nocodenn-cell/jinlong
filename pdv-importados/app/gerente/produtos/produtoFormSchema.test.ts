import { describe, expect, it } from 'vitest'
import {
  EditarProdutoCatalogoSchema,
  NovoProdutoSchema,
} from './produtoFormSchema'

const base = {
  nome: 'Parafuso',
  codigo_barras: null,
  origem: 'china_manual' as const,
  tem_nf: false,
}

describe('produtoFormSchema — atacado legado vs edição', () => {
  it('CREATE ainda rejeita atacado >= varejo (CSV / payload explícito)', () => {
    const r = NovoProdutoSchema.safeParse({
      ...base,
      preco_varejo: 70,
      preco_atacado: 80,
    })
    expect(r.success).toBe(false)
  })

  it('EDIT aceita baixar varejo abaixo do preco_atacado residual oculto', () => {
    const r = EditarProdutoCatalogoSchema.safeParse({
      ...base,
      produto_id: 'a0000001-0000-4000-8000-000000000001',
      preco_varejo: 70,
      preco_atacado: 80,
      quantidade_gatilho_atacado: 10,
    })
    expect(r.success).toBe(true)
  })
})
