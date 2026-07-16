/**
 * Bulk Import (Cadastro em Lote) — modelo e regras da grade editável.
 *
 * Módulo **client-safe** (só depende de zod e do validador de linhas já existente).
 * Fonte única da verdade para: colunas da grade, deteção de linha vazia, parsing de
 * colagem (Excel = TSV / CSV) e validação em tempo real por linha.
 *
 * Reutiliza `parseAndValidateImportRow` — o mesmo motor usado na importação CSV e
 * revalidado no servidor — para garantir que a grade e o commit falem a mesma língua.
 */
import {
  parseAndValidateImportRow,
  parseCsvLine,
  splitCsvPhysicalLines,
  stripLeadingBom,
  type ProdutoImportRowParsed,
  type ValidateProdutoImportCsvOptions,
} from '@/lib/gerente/parseProdutoImportCsv'
import { PRODUTO_IMPORT_CSV_HEADER_KEYS } from '@/lib/gerente/produtosCsvContract'
import type { ImportCsvRowFailReason } from '@/lib/gerente/produtosImportRowMessages'

export type BulkGridColumnKey = (typeof PRODUTO_IMPORT_CSV_HEADER_KEYS)[number]

/** Célula por coluna canónica (sempre string crua — o parsing é feito na validação). */
export type BulkRowCells = Record<BulkGridColumnKey, string>

export type BulkGridColumnKind = 'text' | 'number' | 'enum' | 'bool'

export type BulkGridColumn = Readonly<{
  key: BulkGridColumnKey
  /** Chave i18n dentro de `m.produtos` para o cabeçalho da coluna. */
  labelKey: string
  kind: BulkGridColumnKind
  required: boolean
  /** Largura mínima aproximada (Tailwind) para a coluna na grade. */
  widthClass: string
  /** Sugestões para `<datalist>` (enum/bool) — não restringem, só ajudam. */
  suggestions?: readonly string[]
  /** Coluna só é relevante quando a atualização por id está ativa. */
  onlyWhenAtualizarPorId?: boolean
}>

export const BULK_GRID_COLUMNS: readonly BulkGridColumn[] = [
  { key: 'id', labelKey: 'bulk_col_id', kind: 'text', required: false, widthClass: 'min-w-[7rem]', onlyWhenAtualizarPorId: true },
  { key: 'nome', labelKey: 'bulk_col_nome', kind: 'text', required: true, widthClass: 'min-w-[12rem]' },
  { key: 'codigo_barras', labelKey: 'bulk_col_codigo_barras', kind: 'text', required: false, widthClass: 'min-w-[9rem]' },
  { key: 'preco_varejo', labelKey: 'bulk_col_preco_varejo', kind: 'number', required: true, widthClass: 'min-w-[7rem]' },
  { key: 'preco_atacado', labelKey: 'bulk_col_preco_atacado', kind: 'number', required: false, widthClass: 'min-w-[7rem]' },
  { key: 'quantidade_gatilho_atacado', labelKey: 'bulk_col_gatilho', kind: 'number', required: false, widthClass: 'min-w-[7rem]' },
  { key: 'unidade_medida', labelKey: 'bulk_col_unidade', kind: 'enum', required: false, widthClass: 'min-w-[6rem]', suggestions: ['UN', 'KG', 'CX', 'FD', 'M'] },
  { key: 'observacao', labelKey: 'bulk_col_observacao', kind: 'text', required: false, widthClass: 'min-w-[10rem]' },
  { key: 'origem', labelKey: 'bulk_col_origem', kind: 'enum', required: true, widthClass: 'min-w-[9rem]', suggestions: ['china_manual', 'brasil_nf', 'brasil_sem_nf'] },
  { key: 'tem_nf', labelKey: 'bulk_col_tem_nf', kind: 'bool', required: false, widthClass: 'min-w-[5rem]', suggestions: ['0', '1'] },
  { key: 'ativo', labelKey: 'bulk_col_ativo', kind: 'bool', required: false, widthClass: 'min-w-[5rem]', suggestions: ['0', '1'] },
]

export function createEmptyCells(): BulkRowCells {
  const o = {} as BulkRowCells
  for (const k of PRODUTO_IMPORT_CSV_HEADER_KEYS) o[k] = ''
  return o
}

/** Linha totalmente em branco → ignorada (não conta como válida nem como erro). */
export function isRowBlank(cells: BulkRowCells): boolean {
  for (const k of PRODUTO_IMPORT_CSV_HEADER_KEYS) {
    if ((cells[k] ?? '').trim() !== '') return false
  }
  return true
}

export type BulkRowValidation =
  | { status: 'blank' }
  | { status: 'ok'; data: ProdutoImportRowParsed }
  | { status: 'error'; reason: ImportCsvRowFailReason; field: BulkGridColumnKey | null }

/** Mapeia o motivo de falha para a coluna a destacar na grade (null = linha inteira). */
export function reasonToField(reason: ImportCsvRowFailReason): BulkGridColumnKey | null {
  switch (reason.t) {
    case 'id_not_empty':
    case 'id_invalid_uuid':
      return 'id'
    case 'nome_short':
      return 'nome'
    case 'codigo_invalid':
      return 'codigo_barras'
    case 'preco_empty':
    case 'preco_invalid':
    case 'preco_not_positive':
      return 'preco_varejo'
    case 'atacado_invalid':
      return 'preco_atacado'
    case 'gatilho_invalid':
      return 'quantidade_gatilho_atacado'
    case 'unidade_invalid':
      return 'unidade_medida'
    case 'origem_invalid':
      return 'origem'
    case 'boolean_invalid':
      return 'ativo'
    case 'wrong_columns':
    case 'zod_other':
      return null
  }
}

/** Valida uma linha em tempo real reutilizando o motor da importação CSV. */
export function validateBulkRow(
  cells: BulkRowCells,
  opts?: ValidateProdutoImportCsvOptions,
): BulkRowValidation {
  if (isRowBlank(cells)) return { status: 'blank' }
  const v = parseAndValidateImportRow(cells, opts)
  if (v.ok) return { status: 'ok', data: v.data }
  return { status: 'error', reason: v.reason, field: reasonToField(v.reason) }
}

/** Deteta o delimitador de uma colagem tabular: Excel/Sheets colam TSV; ficheiros CSV, vírgula. */
export function detectDelimiter(text: string): '\t' | ',' {
  return text.includes('\t') ? '\t' : ','
}

/** Divide uma linha usando o delimitador dado, respeitando aspas RFC 4180. */
export function parseDelimitedLine(line: string, delimiter: '\t' | ','): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && c === delimiter) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function cellsMatchCanonicalHeader(cells: string[]): boolean {
  if (cells.length < PRODUTO_IMPORT_CSV_HEADER_KEYS.length) return false
  for (let i = 0; i < PRODUTO_IMPORT_CSV_HEADER_KEYS.length; i++) {
    if ((cells[i] ?? '').trim().toLowerCase() !== PRODUTO_IMPORT_CSV_HEADER_KEYS[i]) {
      return false
    }
  }
  return true
}

/** Converte uma matriz de células (por posição) numa linha da grade. */
export function cellsArrayToRow(cells: string[]): BulkRowCells {
  const row = createEmptyCells()
  for (let i = 0; i < PRODUTO_IMPORT_CSV_HEADER_KEYS.length; i++) {
    row[PRODUTO_IMPORT_CSV_HEADER_KEYS[i]] = (cells[i] ?? '').trim()
  }
  return row
}

/**
 * Faz o parse de texto tabular colado (Excel/Sheets = TSV, ou conteúdo CSV) em linhas
 * da grade. Mapeia as colunas por posição; se a primeira linha for o cabeçalho canónico
 * é descartada. Linhas totalmente vazias são ignoradas.
 */
export function parsePastedTable(text: string): BulkRowCells[] {
  const normalized = stripLeadingBom(text).replace(/\r\n?/g, '\n')
  if (normalized.trim() === '') return []
  const delimiter = detectDelimiter(normalized)
  const physical = splitCsvPhysicalLines(normalized).filter((l) => l.trim() !== '')
  if (physical.length === 0) return []

  const parsed = physical.map((l) =>
    delimiter === ',' ? parseCsvLine(l) : parseDelimitedLine(l, delimiter),
  )
  const start = cellsMatchCanonicalHeader(parsed[0]) ? 1 : 0
  const rows: BulkRowCells[] = []
  for (let i = start; i < parsed.length; i++) {
    const arr = parsed[i]
    if (arr.every((c) => c.trim() === '')) continue
    rows.push(cellsArrayToRow(arr))
  }
  return rows
}

/** Serializa as linhas não-vazias da grade em objetos de célula crus (para o servidor). */
export function bulkRowsToRawObjects(rows: BulkRowCells[]): BulkRowCells[] {
  return rows.filter((r) => !isRowBlank(r)).map((r) => ({ ...r }))
}
