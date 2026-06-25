import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { refinePrecoAtacadoMenorQueVarejo } from './produtoPrecoValidacao'

// Schema mínimo que espelha o uso real em NovoProdutoSchema / EditarProdutoCatalogoSchema.
const schema = z
  .object({
    preco_varejo: z.number(),
    preco_atacado: z.number().nullable(),
  })
  .superRefine(refinePrecoAtacadoMenorQueVarejo)

describe('refinePrecoAtacadoMenorQueVarejo', () => {
  it('aceita atacado nulo (sem preço de atacado)', () => {
    expect(schema.safeParse({ preco_varejo: 10, preco_atacado: null }).success).toBe(true)
  })

  it('aceita atacado estritamente menor que varejo', () => {
    expect(schema.safeParse({ preco_varejo: 10, preco_atacado: 8 }).success).toBe(true)
  })

  it('rejeita atacado igual ao varejo', () => {
    const r = schema.safeParse({ preco_varejo: 10, preco_atacado: 10 })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.path).toEqual(['preco_atacado'])
      expect(r.error.issues[0]?.message).toBe(
        'O preço de atacado deve ser menor que o preço de varejo.',
      )
    }
  })

  it('rejeita atacado maior que varejo', () => {
    expect(schema.safeParse({ preco_varejo: 10, preco_atacado: 12 }).success).toBe(false)
  })
})
