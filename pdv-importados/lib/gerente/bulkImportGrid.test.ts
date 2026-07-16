import { describe, expect, it } from 'vitest'
import {
  BULK_GRID_COLUMNS,
  bulkRowsToRawObjects,
  cellsArrayToRow,
  createEmptyCells,
  detectDelimiter,
  isRowBlank,
  parseDelimitedLine,
  parsePastedTable,
  reasonToField,
  validateBulkRow,
} from '@/lib/gerente/bulkImportGrid'

const HEADER =
  'id,nome,codigo_barras,preco_varejo,preco_atacado,quantidade_gatilho_atacado,unidade_medida,observacao,origem,tem_nf,ativo'

describe('bulkImportGrid — modelo de células', () => {
  it('createEmptyCells cria todas as colunas vazias', () => {
    const c = createEmptyCells()
    expect(Object.keys(c)).toHaveLength(BULK_GRID_COLUMNS.length)
    expect(isRowBlank(c)).toBe(true)
  })

  it('isRowBlank ignora espaços mas deteta conteúdo', () => {
    const c = createEmptyCells()
    c.nome = '   '
    expect(isRowBlank(c)).toBe(true)
    c.nome = 'Arroz'
    expect(isRowBlank(c)).toBe(false)
  })
})

describe('bulkImportGrid — parsing de colagem', () => {
  it('detectDelimiter distingue TSV de CSV', () => {
    expect(detectDelimiter('a\tb\tc')).toBe('\t')
    expect(detectDelimiter('a,b,c')).toBe(',')
  })

  it('parseDelimitedLine respeita aspas em TSV', () => {
    expect(parseDelimitedLine('x\t"y\tz"\tw', '\t')).toEqual(['x', 'y\tz', 'w'])
  })

  it('cola do Excel (TSV) mapeando por posição', () => {
    // id, nome, codigo_barras, preco_varejo, preco_atacado, gatilho, unidade, obs, origem, tem_nf, ativo
    const linha = ['', 'Arroz', '', '12.5', '', '', '', '', 'china_manual', '1', '1'].join('\t')
    const rows = parsePastedTable(linha)
    expect(rows).toHaveLength(1)
    expect(rows[0].nome).toBe('Arroz')
    expect(rows[0].preco_varejo).toBe('12.5')
    expect(rows[0].origem).toBe('china_manual')
  })

  it('descarta o cabeçalho canónico quando presente', () => {
    const paste = [HEADER, ',Feijao,,9.9,,,,,brasil_nf,1,1'].join('\n')
    const rows = parsePastedTable(paste)
    expect(rows).toHaveLength(1)
    expect(rows[0].nome).toBe('Feijao')
  })

  it('ignora linhas totalmente vazias na colagem', () => {
    const vazia = ['', '', '', '', '', '', '', '', '', '', ''].join('\t')
    const cheia = ['', 'Sal', '', '3', '', '', '', '', 'china_manual', '0', '1'].join('\t')
    const rows = parsePastedTable([vazia, cheia].join('\n'))
    expect(rows).toHaveLength(1)
    expect(rows[0].nome).toBe('Sal')
  })

  it('cellsArrayToRow mapeia posição → coluna e ignora excedentes', () => {
    const row = cellsArrayToRow(['', 'Item', '123456', '10', '', '', '', '', 'china_manual', '1', '1', 'EXTRA'])
    expect(row.nome).toBe('Item')
    expect(row.codigo_barras).toBe('123456')
    expect(row.ativo).toBe('1')
  })
})

describe('bulkImportGrid — validação em tempo real', () => {
  it('linha vazia → status blank (nem válida nem erro)', () => {
    expect(validateBulkRow(createEmptyCells()).status).toBe('blank')
  })

  it('linha válida → status ok com dados parseados', () => {
    const c = createEmptyCells()
    c.nome = 'Arroz'
    c.preco_varejo = '12,50'
    c.origem = 'china_manual'
    c.ativo = '1'
    const v = validateBulkRow(c)
    expect(v.status).toBe('ok')
    if (v.status === 'ok') {
      expect(v.data.preco_varejo).toBe(12.5)
      expect(v.data.nome).toBe('Arroz')
    }
  })

  it('preço vazio → erro apontando para preco_varejo', () => {
    const c = createEmptyCells()
    c.nome = 'Arroz'
    c.origem = 'china_manual'
    c.ativo = '1'
    const v = validateBulkRow(c)
    expect(v.status).toBe('error')
    if (v.status === 'error') expect(v.field).toBe('preco_varejo')
  })

  it('origem inválida → erro apontando para origem', () => {
    const c = createEmptyCells()
    c.nome = 'Arroz'
    c.preco_varejo = '10'
    c.origem = 'marte'
    c.ativo = '1'
    const v = validateBulkRow(c)
    expect(v.status).toBe('error')
    if (v.status === 'error') expect(v.field).toBe('origem')
  })

  it('id preenchido sem permissão → erro; com permissão exige UUID', () => {
    const c = createEmptyCells()
    c.id = 'nao-uuid'
    c.nome = 'Arroz'
    c.preco_varejo = '10'
    c.origem = 'china_manual'
    c.ativo = '1'
    expect(validateBulkRow(c).status).toBe('error')
    const v = validateBulkRow(c, { permiteAtualizacaoPorId: true })
    expect(v.status).toBe('error')
    if (v.status === 'error') expect(v.field).toBe('id')
  })

  it('reasonToField cobre os motivos principais', () => {
    expect(reasonToField({ t: 'nome_short' })).toBe('nome')
    expect(reasonToField({ t: 'preco_not_positive' })).toBe('preco_varejo')
    expect(reasonToField({ t: 'atacado_invalid' })).toBe('preco_atacado')
    expect(reasonToField({ t: 'unidade_invalid' })).toBe('unidade_medida')
    expect(reasonToField({ t: 'zod_other', detail: 'x' })).toBeNull()
  })
})

describe('bulkImportGrid — serialização para commit', () => {
  it('bulkRowsToRawObjects remove linhas vazias', () => {
    const cheia = createEmptyCells()
    cheia.nome = 'Arroz'
    cheia.preco_varejo = '10'
    cheia.origem = 'china_manual'
    cheia.ativo = '1'
    const out = bulkRowsToRawObjects([createEmptyCells(), cheia, createEmptyCells()])
    expect(out).toHaveLength(1)
    expect(out[0].nome).toBe('Arroz')
  })
})
