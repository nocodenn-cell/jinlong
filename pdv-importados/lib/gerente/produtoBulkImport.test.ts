import { describe, it, expect } from 'vitest'
import {
  validarGradeBulkImport,
  linhasComErroBulkImport,
  linhaVaziaBulkImport,
  podeComitarBulkImport,
  extrairLinhasParaCommit,
} from './produtoBulkImport'
import { PRODUTO_IMPORT_CSV_HEADER_KEYS } from './produtosCsvContract'

/** Constrói uma linha crua (todas as colunas do contrato) a partir de overrides. */
function linha(over: Partial<Record<string, string>> = {}): Record<string, string> {
  const base: Record<string, string> = {}
  for (const k of PRODUTO_IMPORT_CSV_HEADER_KEYS) base[k] = ''
  return {
    ...base,
    nome: 'Produto Teste',
    codigo_barras: '7890000000001',
    preco_varejo: '10,90',
    unidade_medida: 'UN',
    origem: 'china_manual',
    ativo: '1',
    ...over,
  }
}

describe('linhaVaziaBulkImport', () => {
  it('true quando todas as células estão em branco', () => {
    const vazia: Record<string, string> = {}
    for (const k of PRODUTO_IMPORT_CSV_HEADER_KEYS) vazia[k] = ''
    expect(linhaVaziaBulkImport(vazia)).toBe(true)
    expect(linhaVaziaBulkImport({ ...vazia, nome: 'X' })).toBe(false)
  })
})

describe('validarGradeBulkImport (motor da grade, SSoT = parseAndValidateImportRow)', () => {
  it('conta válidas e mantém a posição original (indice)', () => {
    const grade = validarGradeBulkImport([linha({ nome: 'A Camiseta' }), linha({ nome: 'B Calça' })])
    expect(grade.resumo.total).toBe(2)
    expect(grade.resumo.validas).toBe(2)
    expect(grade.resumo.comErro).toBe(0)
    expect(grade.linhas.map((l) => l.indice)).toEqual([0, 1])
  })

  it('linha inválida carrega o motivo (reusa a regra da fonte única)', () => {
    // nome com 1 caractere → inválido (min 2 na fonte única)
    const grade = validarGradeBulkImport([linha({ nome: 'X' })])
    expect(grade.resumo.comErro).toBe(1)
    const l = grade.linhas[0]
    expect(l.ok).toBe(false)
    if (!l.ok) expect(l.reason).toBeTruthy()
  })

  it('descarta linhas totalmente vazias (não contam como válida nem erro)', () => {
    const vazia: Record<string, string> = {}
    for (const k of PRODUTO_IMPORT_CSV_HEADER_KEYS) vazia[k] = ''
    const grade = validarGradeBulkImport([linha(), vazia, linha({ nome: 'Outro Produto' })])
    expect(grade.resumo.total).toBe(2)
    expect(grade.resumo.validas).toBe(2)
    // índices preservam a posição real na grade (0 e 2, pulando a vazia em 1)
    expect(grade.linhas.map((l) => l.indice)).toEqual([0, 2])
  })

  it('mistura válidas e inválidas conta certo', () => {
    const grade = validarGradeBulkImport([
      linha({ nome: 'Válido Um' }),
      linha({ preco_varejo: '' }), // preço vazio → erro
      linha({ origem: 'inexistente' }), // origem inválida → erro
      linha({ nome: 'Válido Dois' }),
    ])
    expect(grade.resumo.total).toBe(4)
    expect(grade.resumo.validas).toBe(2)
    expect(grade.resumo.comErro).toBe(2)
    expect(grade.resumo.limite).toBe(5000)
    expect(grade.resumo.excedeuLimite).toBe(false)
  })
})

describe('linhasComErroBulkImport (filtro "só linhas com erro")', () => {
  it('retorna apenas as linhas com erro', () => {
    const grade = validarGradeBulkImport([linha(), linha({ nome: 'X' }), linha()])
    const erros = linhasComErroBulkImport(grade)
    expect(erros).toHaveLength(1)
    expect(erros[0].indice).toBe(1)
  })
})

describe('podeComitarBulkImport (GATE)', () => {
  it('false quando há qualquer erro', () => {
    const grade = validarGradeBulkImport([linha(), linha({ nome: 'X' })])
    expect(podeComitarBulkImport(grade.resumo)).toBe(false)
  })

  it('false quando a grade está vazia', () => {
    const grade = validarGradeBulkImport([])
    expect(podeComitarBulkImport(grade.resumo)).toBe(false)
  })

  it('true somente quando há linhas e zero erros', () => {
    const grade = validarGradeBulkImport([linha({ nome: 'Um Produto' }), linha({ nome: 'Dois Produto' })])
    expect(podeComitarBulkImport(grade.resumo)).toBe(true)
  })
})

describe('extrairLinhasParaCommit (gate aplicado)', () => {
  it('lança quando a grade tem erro (commit impossível)', () => {
    const grade = validarGradeBulkImport([linha(), linha({ nome: 'X' })])
    expect(() => extrairLinhasParaCommit(grade)).toThrow()
  })

  it('retorna só os dados válidos quando a grade está limpa', () => {
    const grade = validarGradeBulkImport([linha({ nome: 'Alfa Produto' }), linha({ nome: 'Beta Produto' })])
    const commit = extrairLinhasParaCommit(grade)
    expect(commit).toHaveLength(2)
    expect(commit[0].nome).toBe('Alfa Produto')
    expect(commit.every((d) => d.preco_varejo > 0)).toBe(true)
  })
})
