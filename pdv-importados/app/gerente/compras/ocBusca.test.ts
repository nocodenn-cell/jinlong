import { describe, expect, it } from 'vitest'
import { montarFiltroBuscaOc } from './ocBusca'

/**
 * `ordens_compra.id` é uuid: `id.ilike` derrubava a consulta inteira
 * (`operator does not exist: uuid ~~* unknown`). O filtro nunca pode aplicar `ilike` ao id.
 */
describe('montarFiltroBuscaOc', () => {
  it('busca vazia ou só espaços: nenhum filtro', () => {
    expect(montarFiltroBuscaOc(undefined)).toBeNull()
    expect(montarFiltroBuscaOc(null)).toBeNull()
    expect(montarFiltroBuscaOc('')).toBeNull()
    expect(montarFiltroBuscaOc('   ')).toBeNull()
    // só caracteres de sintaxe também não sobra nada para buscar
    expect(montarFiltroBuscaOc(' ,() ')).toBeNull()
  })

  it('fornecedor: ilike só em fornecedor_nome', () => {
    expect(montarFiltroBuscaOc('Teste PR1')).toBe('fornecedor_nome.ilike.%Teste PR1%')
    expect(montarFiltroBuscaOc('  Alfa  ')).toBe('fornecedor_nome.ilike.%Alfa%')
  })

  it('nunca aplica ilike/like ao id (coluna uuid), qualquer que seja o termo', () => {
    for (const termo of ['Alfa', 'cfd732e5', 'cfd732e5-0f95', 'CFD732E5', 'a1b2c3', '123456789012']) {
      const f = montarFiltroBuscaOc(termo)!
      expect(f).not.toMatch(/id\.i?like/)
    }
  })

  it('código curto do operador (8 primeiros caracteres do uuid): faixa de uuid, sem ilike no id', () => {
    expect(montarFiltroBuscaOc('CFD732E5')).toBe(
      'fornecedor_nome.ilike.%CFD732E5%,' +
        'and(id.gte.cfd732e5-0000-0000-0000-000000000000,id.lte.cfd732e5-ffff-ffff-ffff-ffffffffffff)',
    )
  })

  it('prefixo mais longo, com hífens, e uuid completo', () => {
    expect(montarFiltroBuscaOc('cfd732e5-0f95')).toContain(
      'and(id.gte.cfd732e5-0f95-0000-0000-000000000000,id.lte.cfd732e5-0f95-ffff-ffff-ffffffffffff)',
    )
    const completo = 'cfd732e5-0f95-4c0d-ac27-6fa85b027740'
    expect(montarFiltroBuscaOc(completo)).toContain(`and(id.gte.${completo},id.lte.${completo})`)
  })

  it('termos hexadecimais curtos ou com letras fora de a-f não viram busca por id', () => {
    // "cafe" é hexadecimal, mas curto demais: casaria ids ao acaso
    expect(montarFiltroBuscaOc('cafe')).toBe('fornecedor_nome.ilike.%cafe%')
    expect(montarFiltroBuscaOc('Fornecedor')).toBe('fornecedor_nome.ilike.%Fornecedor%')
    expect(montarFiltroBuscaOc('cfd732g5')).toBe('fornecedor_nome.ilike.%cfd732g5%')
    // mais de 32 dígitos não é um uuid
    expect(montarFiltroBuscaOc('a'.repeat(33))).not.toContain('and(')
  })

  it('sintaxe do .or() e curingas do LIKE não passam do termo digitado', () => {
    const f = montarFiltroBuscaOc('Alfa),id.eq.x,(%_\\')!
    expect(f).toBe('fornecedor_nome.ilike.%Alfa  id.eq.x%')
    // o termo não consegue acrescentar condições
    expect(f.split(',')).toHaveLength(1)
    expect(montarFiltroBuscaOc('Caneca (300ml)')).toBe('fornecedor_nome.ilike.%Caneca  300ml%')
  })
})
