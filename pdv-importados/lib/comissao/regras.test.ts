import { describe, expect, it } from 'vitest'
import { escolherRegra, nivelRegra, normalizarCargo, type RegraComissao } from './regras'

const base: RegraComissao = {
  id: 'r0', lojaId: null, usuarioId: null, cargo: null, produtoId: null, categoriaId: null, canal: null,
  tipoCalculo: 'percentual', valor: 3, vigenciaInicio: '2026-01-01', vigenciaFim: null, ativo: true,
}
const ctx = { lojaId: 'L', vendedorId: 'U', cargo: ' Vendedor Externo ', produtoId: 'P', categoriaId: 'C', canal: 'VAREJO' as const, data: '2026-10-21' }

describe('regras de comissão', () => {
  it('níveis 1..9', () => {
    expect(nivelRegra({ usuarioId: 'u', cargo: null, produtoId: 'p', categoriaId: null })).toBe(1)
    expect(nivelRegra({ usuarioId: 'u', cargo: null, produtoId: null, categoriaId: null })).toBe(3)
    expect(nivelRegra({ usuarioId: null, cargo: 'x', produtoId: null, categoriaId: 'c' })).toBe(5)
    expect(nivelRegra({ usuarioId: null, cargo: null, produtoId: null, categoriaId: 'c' })).toBe(8)
    expect(nivelRegra({ usuarioId: null, cargo: null, produtoId: null, categoriaId: null })).toBe(9)
  })
  it('cargo normalizado vence categoria; regra futura e inativa ignoradas', () => {
    const regras: RegraComissao[] = [
      base,
      { ...base, id: 'cat', categoriaId: 'C', valor: 4 },
      { ...base, id: 'cargo', cargo: 'vendedor externo', valor: 6 },
      { ...base, id: 'fut', usuarioId: 'U', valor: 50, vigenciaInicio: '2026-12-01' },
      { ...base, id: 'off', usuarioId: 'U', valor: 40, ativo: false },
    ]
    expect(normalizarCargo(ctx.cargo)).toBe('vendedor externo')
    expect(escolherRegra(regras, ctx)?.id).toBe('cargo')
  })
  it('desempate: canal, loja, vigência mais recente, id', () => {
    const regras: RegraComissao[] = [
      { ...base, id: 'b' }, { ...base, id: 'a' },
      { ...base, id: 'loja', lojaId: 'L' },
      { ...base, id: 'canal', canal: 'VAREJO' },
    ]
    expect(escolherRegra(regras, ctx)?.id).toBe('canal')
    expect(escolherRegra(regras.slice(0, 3), ctx)?.id).toBe('loja')
    expect(escolherRegra(regras.slice(0, 2), ctx)?.id).toBe('a')
    expect(escolherRegra([{ ...base, id: 'z', vigenciaInicio: '2026-06-01' }, base], ctx)?.id).toBe('z')
    expect(escolherRegra([{ ...base, canal: 'ATACADO' }], ctx)).toBeNull()
  })
})
