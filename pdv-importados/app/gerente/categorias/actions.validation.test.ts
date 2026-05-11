import { describe, expect, it } from 'vitest'
import { categoriaSchema, categoriaValidacao } from './actions.validation'

describe('categorias.actions.validation', () => {
  it('rejeita nome vazio', () => {
    const r = categoriaValidacao({ nome: '  ', categoria_pai_id: '', ativo: true })
    expect(r.ok).toBe(false)
  })

  it('aceita nome válido e normaliza pai vazio', () => {
    const r = categoriaValidacao({ nome: ' Bebidas ', categoria_pai_id: '', ativo: true })
    expect(r).toEqual({
      ok: true,
      value: {
        nome: 'Bebidas',
        categoria_pai_id: undefined,
        ativo: true,
      },
    })
  })

  it('schema aceita uuid como categoria_pai_id', () => {
    const parsed = categoriaSchema.parse({
      nome: 'Mercearia',
      categoria_pai_id: '11111111-1111-1111-1111-111111111111',
      ativo: true,
    })
    expect(parsed.categoria_pai_id).toBe('11111111-1111-1111-1111-111111111111')
  })
})

