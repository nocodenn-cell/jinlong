import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { implicito, lerXmlImportacao } from './lerXmlImportacao'
import { InterpretadorMock, OrcamentoIa, configIa, interpretarDocumento } from '../ia/interpretadorDocumentos'

const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8')

describe('leitura de XML de importação (proposta para conferência)', () => {
  it('NF-e: itens com NCM, quantidade e valor como texto; tributos por item', () => {
    const p = lerXmlImportacao(fx('nfe-importacao-ficticia.xml'))
    expect(p).toMatchObject({ tipo: 'NFE', numero: '1234', data_documento: '2026-10-15' })
    expect(p.itens[0]).toEqual({ descricao: 'Chaleira eletrica 1,7L (ficticio)', codigo_fornecedor: '00123', ncm: '85161000', quantidade: '100.0000', unidade: 'UN', valor_brl: '5000.00' })
    expect(p.itens[1].codigo_fornecedor).toBe('00456') // zeros à esquerda preservados
    expect(p.tributos.filter((t) => t.item_indice === 0).map((t) => [t.tributo_codigo, t.valor_brl])).toEqual([
      ['II', '900.00'], ['IPI', '295.00'], ['PIS_IMPORTACAO', '105.00'], ['COFINS_IMPORTACAO', '482.50'], ['ICMS', '1200.50'],
    ])
    expect(p.tributos.filter((t) => t.item_indice === 1)).toEqual([{ item_indice: 1, tributo_codigo: 'II', valor_brl: '80.00' }])
  })
  it('DI: casas implícitas, tributos da adição, alerta de ICMS', () => {
    const p = lerXmlImportacao(fx('di-ficticia.xml'))
    expect(p).toMatchObject({ tipo: 'DI', numero: '2612345678', data_documento: '2026-10-14' })
    expect(p.itens).toEqual([{ descricao: 'CHALEIRA ELETRICA 1,7L (FICTICIO)', codigo_fornecedor: null, ncm: '85161000', quantidade: '100.00000', unidade: 'UNIDADE', valor_brl: '5000.00' }])
    expect(p.tributos.map((t) => t.valor_brl)).toEqual(['900.00', '295.00', '105.00', '482.50'])
    expect(p.alertas.some((a) => a.includes('ICMS'))).toBe(true)
  })
  it('recusa XML inválido, DOCTYPE (XXE) e tipo desconhecido', () => {
    expect(() => lerXmlImportacao('nada')).toThrow('XML_INVALIDO')
    expect(() => lerXmlImportacao('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>')).toThrow('XML_DOCTYPE_NAO_PERMITIDO')
    expect(() => lerXmlImportacao('<outro><a>1</a></outro>')).toThrow('XML_TIPO_NAO_RECONHECIDO')
  })
  it('casas implícitas', () => {
    expect(implicito('000000000012345', 2)).toBe('123.45')
    expect(implicito('5', 2)).toBe('0.05')
    expect(implicito('12a', 2)).toBeNull()
  })
})

describe('interface de IA (desligada, mock, orçamento)', () => {
  const e = { empresaId: 'e1', tipo: 'INVOICE' as const, mime: 'application/pdf' as const, paginas: 3, conteudo: new Uint8Array() }
  it('desligada por padrão', async () => {
    expect(configIa({}).habilitada).toBe(false)
    const r = await interpretarDocumento(e, { config: configIa({}), orcamento: new OrcamentoIa(10), interpretador: new InterpretadorMock() })
    expect(r).toEqual({ ok: false, motivo: 'IA_DESABILITADA' })
  })
  it('mock exige revisão humana; orçamento por empresa/dia', async () => {
    const deps = { config: { habilitada: true, maxPaginasPorDia: 5 }, orcamento: new OrcamentoIa(5, () => '2026-10-21'), interpretador: new InterpretadorMock() }
    const r1 = await interpretarDocumento(e, deps)
    expect(r1.ok && r1.revisaoHumanaObrigatoria).toBe(true)
    expect(await interpretarDocumento(e, deps)).toEqual({ ok: false, motivo: 'ORCAMENTO_EXCEDIDO' })
    expect((await interpretarDocumento({ ...e, empresaId: 'e2' }, deps)).ok).toBe(true)
  })
})
