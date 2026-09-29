import { describe, expect, it } from 'vitest'
import { CODIGO_INTERNO_MAX, codigoInternoField } from './produtoFormSchema'

describe('SKU (codigo_interno) — coerente com varchar(50)', () => {
  it('limite do schema é o da coluna', () => {
    expect(CODIGO_INTERNO_MAX).toBe(50)
  })

  it('vazio/nulo/espaços viram null', () => {
    expect(codigoInternoField.parse(undefined)).toBeNull()
    expect(codigoInternoField.parse(null)).toBeNull()
    expect(codigoInternoField.parse('   ')).toBeNull()
  })

  it('aceita até 50 caracteres (com trim) sem alterar o valor', () => {
    const sku = 'A'.repeat(50)
    expect(codigoInternoField.parse(`  ${sku}  `)).toBe(sku)
  })

  it('51 a 60 caracteres: REJEITA em vez de passar e estourar no banco', () => {
    for (const n of [51, 55, 60, 80]) {
      const r = codigoInternoField.safeParse('B'.repeat(n))
      expect(r.success).toBe(false)
      if (!r.success) expect(r.error.issues[0]?.message).toContain('50')
    }
  })

  it('não trunca em silêncio: acima do limite nunca devolve um SKU cortado', () => {
    const r = codigoInternoField.safeParse('C'.repeat(70))
    expect(r.success).toBe(false)
  })
})
