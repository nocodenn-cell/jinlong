import { describe, expect, it } from 'vitest'
import { metaSchema, regraSchema } from './schemas'

const regra = {
  somenteEstaLoja: false, usuarioId: null, cargo: null, produtoId: null, categoriaId: null, canal: null,
  tipoCalculo: 'percentual' as const, valor: 5, vigenciaInicio: '2026-10-01', vigenciaFim: null, ativo: true, descricao: null,
}
const meta = { usuarioId: null, cargo: null, competenciaInicio: '2026-10', competenciaFim: null, faixas: [{ aPartirDe: 0, bonusPct: 1 }], ativo: true, descricao: null }

describe('cargo vazio não vira regra/meta da empresa inteira (#607)', () => {
  it.each(['', '   '])('regra com alvo cargo %j é recusada', (cargo) => {
    const r = regraSchema.safeParse({ ...regra, cargo })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toBe('Informe o cargo.')
  })
  it.each(['', '   '])('meta com alvo cargo %j é recusada', (cargo) => {
    expect(metaSchema.safeParse({ ...meta, cargo }).success).toBe(false)
  })
  it('cargo preenchido e alvo geral (null) continuam válidos', () => {
    expect(regraSchema.safeParse({ ...regra, cargo: 'Vendedor' }).success).toBe(true)
    expect(regraSchema.safeParse(regra).success).toBe(true)
    expect(metaSchema.safeParse({ ...meta, cargo: 'vendedor' }).success).toBe(true)
    expect(metaSchema.safeParse(meta).success).toBe(true)
  })
})
