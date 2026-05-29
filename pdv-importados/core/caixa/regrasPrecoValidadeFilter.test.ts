import { describe, expect, it } from 'vitest'
import { buildRegrasPrecoValidadeOrFilter } from './regrasPrecoValidadeFilter'

describe('buildRegrasPrecoValidadeOrFilter', () => {
  const fixed = new Date('2026-05-29T13:00:00.000Z')

  it('gera as duas condições esperadas (null OU >= agora)', () => {
    expect(buildRegrasPrecoValidadeOrFilter(fixed)).toBe(
      'data_validade.is.null,data_validade.gte.2026-05-29T13:00:00.000Z',
    )
  })

  it('produz exatamente duas condições válidas para o parser de or() do PostgREST', () => {
    const filtro = buildRegrasPrecoValidadeOrFilter(fixed)
    const condicoes = filtro.split(',')
    expect(condicoes).toHaveLength(2)
    // Cada condição precisa ser col.op.val (>= 3 tokens separados por ponto).
    for (const c of condicoes) {
      expect(c.split('.').length).toBeGreaterThanOrEqual(3)
      expect(c.startsWith('data_validade.')).toBe(true)
    }
  })

  it('não contém caracteres que quebram o parser de or() (parênteses)', () => {
    const filtro = buildRegrasPrecoValidadeOrFilter(fixed)
    expect(filtro).not.toContain('(')
    expect(filtro).not.toContain(')')
  })

  it('o valor gte é um timestamp ISO sem vírgula (que separaria condições)', () => {
    const filtro = buildRegrasPrecoValidadeOrFilter(fixed)
    const valorGte = filtro.split('data_validade.gte.')[1]
    expect(valorGte).toBe(fixed.toISOString())
    expect(valorGte).not.toContain(',')
    expect(Number.isNaN(Date.parse(valorGte))).toBe(false)
  })

  it('usa o horário atual quando nenhuma data é informada', () => {
    const antes = Date.now()
    const filtro = buildRegrasPrecoValidadeOrFilter()
    const valorGte = filtro.split('data_validade.gte.')[1]
    const t = Date.parse(valorGte)
    expect(t).toBeGreaterThanOrEqual(antes - 1000)
    expect(t).toBeLessThanOrEqual(Date.now() + 1000)
  })
})
