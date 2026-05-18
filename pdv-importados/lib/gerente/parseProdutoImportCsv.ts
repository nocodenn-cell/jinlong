import { z } from 'zod'
import {
  PRODUTO_IMPORT_CSV_HEADER_KEYS,
  PRODUTO_IMPORT_MAX_ROWS,
} from '@/lib/gerente/produtosCsvContract'
import type { ImportCsvFatalReason, ImportCsvRowFailReason } from '@/lib/gerente/produtosImportRowMessages'

/** Remove BOM UTF-8 do início do ficheiro. */
export function stripLeadingBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1)
  return text
}

/**
 * Divide o texto em linhas físicas respeitando aspas RFC 4180
 * (quebras de linha dentro de campo entre `"` não separam linhas).
 */
export function splitCsvPhysicalLines(text: string): string[] {
  const lines: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"'
        i++
        continue
      }
      inQuotes = !inQuotes
      cur += c
      continue
    }
    if (!inQuotes && (c === '\n' || (c === '\r' && text[i + 1] === '\n'))) {
      if (c === '\r') i++
      lines.push(cur)
      cur = ''
      continue
    }
    if (!inQuotes && c === '\r') {
      lines.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  if (cur.length > 0 || lines.length > 0) lines.push(cur)
  return lines
}

/** Divide uma linha CSV em células (suporta aspas e `""`). */
export function parseCsvLine(line: string): string[] {
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
    if (!inQuotes && c === ',') {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function normalizeHeaderCell(s: string): string {
  return stripLeadingBom(s).trim()
}

export function canonicalImportHeadersMatch(parsedHeader: string[]): boolean {
  if (parsedHeader.length !== PRODUTO_IMPORT_CSV_HEADER_KEYS.length) return false
  for (let i = 0; i < PRODUTO_IMPORT_CSV_HEADER_KEYS.length; i++) {
    if (normalizeHeaderCell(parsedHeader[i] ?? '') !== PRODUTO_IMPORT_CSV_HEADER_KEYS[i]) {
      return false
    }
  }
  return true
}

function parseBoolLoose(raw: string): { ok: true; value: boolean } | { ok: false } {
  const s = raw.trim().toLowerCase()
  if (['1', 'true', 't', 'sim', 'yes', 'y', 's', '是'].includes(s)) return { ok: true, value: true }
  if (['0', 'false', 'f', 'nao', 'não', 'no', 'n', '否'].includes(s)) return { ok: true, value: false }
  return { ok: false }
}

function parsePrecoLoose(raw: string): { ok: true; value: number } | { ok: false; empty: boolean } {
  const t = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (t === '') return { ok: false, empty: true }
  const n = Number(t)
  if (!Number.isFinite(n)) return { ok: false, empty: false }
  return { ok: true, value: n }
}

/** Parse optional positive decimal — empty string → null, invalid → error. */
function parsePrecoOpcional(raw: string): { ok: true; value: number | null } | { ok: false } {
  const t = raw.trim()
  if (t === '') return { ok: true, value: null }
  const r = parsePrecoLoose(t)
  if (!r.ok || r.value <= 0) return { ok: false }
  return { ok: true, value: r.value }
}

/** Parse optional positive integer — empty string → null, invalid/non-int → error. */
function parseIntOpcional(raw: string): { ok: true; value: number | null } | { ok: false } {
  const t = raw.trim()
  if (t === '') return { ok: true, value: null }
  const n = Number(t)
  if (!Number.isInteger(n) || n < 1) return { ok: false }
  return { ok: true, value: n }
}

const UNIDADES_VALIDAS = ['UN', 'KG', 'CX', 'FD', 'M'] as const
type UnidadeValida = (typeof UNIDADES_VALIDAS)[number]

function parseUnidade(raw: string): { ok: true; value: UnidadeValida } | { ok: false } {
  const t = raw.trim().toUpperCase()
  if (t === '') return { ok: true, value: 'UN' }
  if ((UNIDADES_VALIDAS as readonly string[]).includes(t)) return { ok: true, value: t as UnidadeValida }
  return { ok: false }
}

const ImportRowZ = z
  .object({
    id: z.union([z.literal(''), z.string().uuid()]),
    nome: z.string().min(2),
    codigo_barras: z
      .string()
      .transform((s) => s.trim())
      .transform((t) => (t.length === 0 ? null : t))
      .refine((s) => s === null || s.length >= 3),
    preco_varejo: z.number().positive(),
    preco_atacado: z.number().positive().nullable().optional(),
    quantidade_gatilho_atacado: z.number().int().min(1).nullable().optional(),
    unidade_medida: z.enum(['UN', 'KG', 'CX', 'FD', 'M']).default('UN'),
    observacao: z.string().nullable().optional(),
    origem: z.enum(['china_manual', 'brasil_nf', 'brasil_sem_nf']),
    tem_nf: z.boolean(),
    ativo: z.boolean(),
  })
  .strict()

export type ProdutoImportRowParsed = z.infer<typeof ImportRowZ>

export function rowCellsToObject(cells: string[]): Record<string, string> {
  const o: Record<string, string> = {}
  for (let i = 0; i < PRODUTO_IMPORT_CSV_HEADER_KEYS.length; i++) {
    o[PRODUTO_IMPORT_CSV_HEADER_KEYS[i]] = cells[i] ?? ''
  }
  return o
}

function zodFailToReason(error: z.ZodError): ImportCsvRowFailReason {
  const issue = error.issues[0]
  if (!issue) return { t: 'zod_other', detail: '?' }
  const path0 = issue.path[0]
  if (path0 === 'nome' && issue.code === 'too_small') return { t: 'nome_short' }
  if (path0 === 'codigo_barras') return { t: 'codigo_invalid' }
  if (path0 === 'preco_varejo' && issue.code === 'too_small') return { t: 'preco_not_positive' }
  if (path0 === 'origem') return { t: 'origem_invalid' }
  return { t: 'zod_other', detail: issue.message }
}

export type ValidateProdutoImportCsvOptions = Readonly<{
  /** Se true, `id` com UUID válido indica atualização; vazio = criar. */
  permiteAtualizacaoPorId?: boolean
}>

export function parseAndValidateImportRow(
  raw: Record<string, string>,
  opts?: ValidateProdutoImportCsvOptions,
):
  | { ok: true; data: ProdutoImportRowParsed }
  | { ok: false; reason: ImportCsvRowFailReason } {
  const id = (raw.id ?? '').trim()
  if (!opts?.permiteAtualizacaoPorId) {
    if (id.length > 0) {
      return { ok: false, reason: { t: 'id_not_empty' } }
    }
  } else if (id.length > 0 && !z.string().uuid().safeParse(id).success) {
    return { ok: false, reason: { t: 'id_invalid_uuid' } }
  }

  const precoRaw = parsePrecoLoose(raw.preco_varejo ?? '')
  if (!precoRaw.ok) {
    return {
      ok: false,
      reason: precoRaw.empty ? { t: 'preco_empty' } : { t: 'preco_invalid' },
    }
  }

  const precoAtacadoRaw = parsePrecoOpcional(raw.preco_atacado ?? '')
  if (!precoAtacadoRaw.ok) return { ok: false, reason: { t: 'atacado_invalid' } }

  const gatilhoRaw = parseIntOpcional(raw.quantidade_gatilho_atacado ?? '')
  if (!gatilhoRaw.ok) return { ok: false, reason: { t: 'gatilho_invalid' } }

  const unidadeRaw = parseUnidade(raw.unidade_medida ?? '')
  if (!unidadeRaw.ok) return { ok: false, reason: { t: 'unidade_invalid' } }

  const temNf = parseBoolLoose(raw.tem_nf ?? '')
  if (!temNf.ok) return { ok: false, reason: { t: 'boolean_invalid', field: 'tem_nf' } }

  const ativo = parseBoolLoose(raw.ativo ?? '')
  if (!ativo.ok) return { ok: false, reason: { t: 'boolean_invalid', field: 'ativo' } }

  const observacaoRaw = (raw.observacao ?? '').trim()

  const parsed = ImportRowZ.safeParse({
    id,
    nome: raw.nome ?? '',
    codigo_barras: raw.codigo_barras ?? '',
    preco_varejo: precoRaw.value,
    preco_atacado: precoAtacadoRaw.value,
    quantidade_gatilho_atacado: gatilhoRaw.value,
    unidade_medida: unidadeRaw.value,
    observacao: observacaoRaw || null,
    origem: raw.origem ?? '',
    tem_nf: temNf.value,
    ativo: ativo.value,
  })

  if (!parsed.success) {
    return { ok: false, reason: zodFailToReason(parsed.error) }
  }
  return { ok: true, data: parsed.data }
}

export type ProdutoImportRowOutcome =
  | { lineNo: number; ok: true; data: ProdutoImportRowParsed }
  | { lineNo: number; ok: false; reason: ImportCsvRowFailReason }

export type ValidateProdutoImportCsvResult =
  | { ok: false; fatal: ImportCsvFatalReason }
  | { ok: true; outcomes: ProdutoImportRowOutcome[] }

/**
 * Valida cabeçalho, limite de linhas e cada linha de dados (erros por linha não abortam o restante).
 */
export function validateProdutoImportCsvDocument(
  csvText: string,
  opts?: ValidateProdutoImportCsvOptions,
): ValidateProdutoImportCsvResult {
  const normalized = stripLeadingBom(csvText.trim())
  if (!normalized) return { ok: false, fatal: { t: 'empty_file' } }

  const physical = splitCsvPhysicalLines(normalized)
  const nonEmpty = physical.map((l) => l.trim()).filter((l) => l.length > 0)
  if (nonEmpty.length === 0) return { ok: false, fatal: { t: 'empty_file' } }

  const headerCells = parseCsvLine(nonEmpty[0])
  if (!canonicalImportHeadersMatch(headerCells)) {
    return { ok: false, fatal: { t: 'bad_header' } }
  }

  const dataLines = nonEmpty.slice(1)
  if (dataLines.length > PRODUTO_IMPORT_MAX_ROWS) {
    return {
      ok: false,
      fatal: { t: 'too_many_data_rows', count: dataLines.length, max: PRODUTO_IMPORT_MAX_ROWS },
    }
  }

  const outcomes: ProdutoImportRowOutcome[] = []
  for (let i = 0; i < dataLines.length; i++) {
    const lineNo = i + 2
    const line = dataLines[i]
    if (line.trim() === '') continue

    const cells = parseCsvLine(line)
    if (cells.length === 1 && cells[0] === '') continue

    if (cells.length !== PRODUTO_IMPORT_CSV_HEADER_KEYS.length) {
      outcomes.push({
        lineNo,
        ok: false,
        reason: {
          t: 'wrong_columns',
          expected: PRODUTO_IMPORT_CSV_HEADER_KEYS.length,
          got: cells.length,
        },
      })
      continue
    }

    const obj = rowCellsToObject(cells)
    const v = parseAndValidateImportRow(obj, opts)
    if (!v.ok) {
      outcomes.push({ lineNo, ok: false, reason: v.reason })
    } else {
      outcomes.push({ lineNo, ok: true, data: v.data })
    }
  }

  if (outcomes.length === 0) {
    return { ok: false, fatal: { t: 'no_data_rows' } }
  }

  return { ok: true, outcomes }
}
