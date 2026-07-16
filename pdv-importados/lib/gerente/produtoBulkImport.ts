/**
 * Domínio BulkImport (cadastro de produtos em lote).
 *
 * FONTE ÚNICA DE VALIDAÇÃO: reutiliza `parseAndValidateImportRow` — as regras de
 * negócio de cada linha vivem lá e NÃO são reimplementadas aqui. Este módulo só
 * orquestra a grade (validar N linhas), resume o resultado e define o gate de
 * commit. Sem lógica de validação paralela.
 */
import {
  parseAndValidateImportRow,
  type ProdutoImportRowParsed,
  type ValidateProdutoImportCsvOptions,
} from '@/lib/gerente/parseProdutoImportCsv'
import { PRODUTO_IMPORT_MAX_ROWS } from '@/lib/gerente/produtosCsvContract'
import type { ImportCsvRowFailReason } from '@/lib/gerente/produtosImportRowMessages'

/** Uma linha da grade após validação. `indice` = posição na grade original. */
export type LinhaBulkImport =
  | { indice: number; ok: true; data: ProdutoImportRowParsed }
  | { indice: number; ok: false; reason: ImportCsvRowFailReason }

export type ResumoBulkImport = Readonly<{
  /** Linhas não-vazias consideradas (válidas + com erro). */
  total: number
  validas: number
  comErro: number
  /** Excedeu o limite máximo de linhas por importação. */
  excedeuLimite: boolean
  limite: number
}>

export type GradeBulkImport = Readonly<{
  linhas: LinhaBulkImport[]
  resumo: ResumoBulkImport
}>

/** Linha totalmente vazia (todas as células em branco) — ignorada na validação. */
export function linhaVaziaBulkImport(raw: Record<string, string>): boolean {
  return Object.values(raw).every((v) => (v ?? '').trim() === '')
}

/**
 * Motor de validação da grade. Valida cada linha NÃO-vazia reusando
 * `parseAndValidateImportRow` (única fonte da verdade). Linhas totalmente vazias
 * são descartadas (não contam como válidas nem como erro).
 */
export function validarGradeBulkImport(
  rows: ReadonlyArray<Record<string, string>>,
  opts?: ValidateProdutoImportCsvOptions,
): GradeBulkImport {
  const linhas: LinhaBulkImport[] = []
  let validas = 0
  for (let i = 0; i < rows.length; i++) {
    if (linhaVaziaBulkImport(rows[i])) continue
    const v = parseAndValidateImportRow(rows[i], opts)
    if (v.ok) {
      validas += 1
      linhas.push({ indice: i, ok: true, data: v.data })
    } else {
      linhas.push({ indice: i, ok: false, reason: v.reason })
    }
  }
  const total = linhas.length
  return {
    linhas,
    resumo: {
      total,
      validas,
      comErro: total - validas,
      excedeuLimite: total > PRODUTO_IMPORT_MAX_ROWS,
      limite: PRODUTO_IMPORT_MAX_ROWS,
    },
  }
}

/** Filtro "mostrar só linhas com erro" (corrige-antes-de-commitar). */
export function linhasComErroBulkImport(grade: GradeBulkImport): LinhaBulkImport[] {
  return grade.linhas.filter((l): l is Extract<LinhaBulkImport, { ok: false }> => !l.ok)
}

/**
 * GATE DE COMMIT — a importação só é permitida quando há pelo menos uma linha,
 * ZERO erros e dentro do limite. Única porta para o commit em lote.
 */
export function podeComitarBulkImport(resumo: ResumoBulkImport): boolean {
  return resumo.total > 0 && resumo.comErro === 0 && !resumo.excedeuLimite
}

/**
 * Extrai as linhas prontas para commit (apenas dados válidos). Aplica o gate:
 * lança se houver qualquer erro — impossível commitar uma grade "suja".
 */
export function extrairLinhasParaCommit(grade: GradeBulkImport): ProdutoImportRowParsed[] {
  if (!podeComitarBulkImport(grade.resumo)) {
    throw new Error('BulkImport: commit bloqueado — a grade tem linhas com erro ou está vazia.')
  }
  return grade.linhas.flatMap((l) => (l.ok ? [l.data] : []))
}
