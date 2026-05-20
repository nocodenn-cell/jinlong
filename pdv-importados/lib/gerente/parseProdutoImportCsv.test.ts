import { describe, expect, it } from 'vitest'
import {
  canonicalImportHeadersMatch,
  parseCsvLine,
  splitCsvPhysicalLines,
  stripLeadingBom,
  validateProdutoImportCsvDocument,
} from '@/lib/gerente/parseProdutoImportCsv'
import { buildProdutoImportTemplateCsv } from '@/lib/gerente/produtosCsvContract'

describe('parseProdutoImportCsv', () => {
  it('stripLeadingBom remove FEFF', () => {
    expect(stripLeadingBom('\uFEFFid,nome')).toBe('id,nome')
  })

  it('splitCsvPhysicalLines respeita aspas', () => {
    const s = 'a,"b\nc",d'
    expect(splitCsvPhysicalLines(s)).toEqual(['a,"b\nc",d'])
  })

  it('parseCsvLine com vírgulas entre aspas', () => {
    expect(parseCsvLine('x,"y,z",w')).toEqual(['x', 'y,z', 'w'])
  })

  it('cabeçalho do modelo é aceite', () => {
    const header = parseCsvLine(buildProdutoImportTemplateCsv().split('\n')[0])
    expect(canonicalImportHeadersMatch(header)).toBe(true)
  })

  it('valida uma linha de dados válida', () => {
    const csv = [
      'id,nome,codigo_barras,preco_varejo,preco_atacado,quantidade_gatilho_atacado,unidade_medida,observacao,origem,tem_nf,ativo',
      ',Arroz,,12.5,,,,,china_manual,1,1',
    ].join('\n')
    const r = validateProdutoImportCsvDocument(csv)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.outcomes).toHaveLength(1)
    expect(r.outcomes[0]?.ok).toBe(true)
    if (r.outcomes[0]?.ok) {
      expect(r.outcomes[0].data.nome).toBe('Arroz')
      expect(r.outcomes[0].data.codigo_barras).toBeNull()
    }
  })

  it('rejeita id preenchido sem atualização por id', () => {
    const csv = [
      'id,nome,codigo_barras,preco_varejo,preco_atacado,quantidade_gatilho_atacado,unidade_medida,observacao,origem,tem_nf,ativo',
      '550e8400-e29b-41d4-a716-446655440000,X,,1,,,,,china_manual,0,1',
    ].join('\n')
    const r = validateProdutoImportCsvDocument(csv)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.outcomes[0]?.ok).toBe(false)
  })

  it('aceita id UUID quando permiteAtualizacaoPorId', () => {
    const csv = [
      'id,nome,codigo_barras,preco_varejo,preco_atacado,quantidade_gatilho_atacado,unidade_medida,observacao,origem,tem_nf,ativo',
      '550e8400-e29b-41d4-a716-446655440000,Arroz Integral,,12.5,,,,,china_manual,1,1',
    ].join('\n')
    const r = validateProdutoImportCsvDocument(csv, { permiteAtualizacaoPorId: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.outcomes[0]?.ok).toBe(true)
    if (r.outcomes[0]?.ok) {
      expect(r.outcomes[0].data.id).toBe('550e8400-e29b-41d4-a716-446655440000')
    }
  })

  it('documento misto no parser: criar, atualizar por id e linha inválida', () => {
    const csv = [
      'id,nome,codigo_barras,preco_varejo,preco_atacado,quantidade_gatilho_atacado,unidade_medida,observacao,origem,tem_nf,ativo',
      ',Novo A,,10,,,,,china_manual,1,1',
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8,Novo B,,11,,,,,brasil_nf,0,1',
      ',A,,12,,,,,china_manual,1,1',
    ].join('\n')
    const r = validateProdutoImportCsvDocument(csv, { permiteAtualizacaoPorId: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.outcomes).toHaveLength(3)
    expect(r.outcomes[0]?.ok).toBe(true)
    if (r.outcomes[0]?.ok) expect(r.outcomes[0].data.nome).toBe('Novo A')
    expect(r.outcomes[1]?.ok).toBe(true)
    if (r.outcomes[1]?.ok) {
      expect(r.outcomes[1].data.id).toBe('6ba7b810-9dad-11d1-80b4-00c04fd430c8')
    }
    expect(r.outcomes[2]?.ok).toBe(false)
  })
})
