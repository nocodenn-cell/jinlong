import type { Mensagens } from '@/i18n/getMessages'
import { interpolateTemplate } from '@/lib/gerente/formatDashboardAtividade'

export type ImportCsvFatalReason =
  | { t: 'empty_file' }
  | { t: 'bad_header' }
  | { t: 'too_many_data_rows'; count: number; max: number }
  | { t: 'no_data_rows' }

export type ImportCsvRowFailReason =
  | { t: 'id_not_empty' }
  | { t: 'id_invalid_uuid' }
  | { t: 'wrong_columns'; expected: number; got: number }
  | { t: 'preco_empty' }
  | { t: 'preco_invalid' }
  | { t: 'boolean_invalid'; field: 'tem_nf' | 'ativo' }
  | { t: 'nome_short' }
  | { t: 'codigo_invalid' }
  | { t: 'origem_invalid' }
  | { t: 'preco_not_positive' }
  | { t: 'atacado_invalid' }
  | { t: 'gatilho_invalid' }
  | { t: 'unidade_invalid' }
  | { t: 'zod_other'; detail: string }

export function importCsvFatalToString(
  reason: ImportCsvFatalReason,
  p: Mensagens['produtos'],
): string {
  switch (reason.t) {
    case 'empty_file':
      return p.import_fatal_empty_file
    case 'bad_header':
      return p.import_fatal_bad_header
    case 'too_many_data_rows':
      return interpolateTemplate(p.import_fatal_too_many_rows, {
        count: String(reason.count),
        max: String(reason.max),
      })
    case 'no_data_rows':
      return p.import_fatal_no_data_rows
  }
}

export function importCsvRowFailToString(
  reason: ImportCsvRowFailReason,
  p: Mensagens['produtos'],
): string {
  switch (reason.t) {
    case 'id_not_empty':
      return p.import_row_id_not_empty
    case 'id_invalid_uuid':
      return p.import_row_id_invalid_uuid
    case 'wrong_columns':
      return interpolateTemplate(p.import_row_wrong_columns, {
        expected: String(reason.expected),
        got: String(reason.got),
      })
    case 'preco_empty':
      return p.import_row_preco_empty
    case 'preco_invalid':
      return p.import_row_preco_invalid
    case 'boolean_invalid':
      return reason.field === 'tem_nf'
        ? p.import_row_boolean_tem_nf
        : p.import_row_boolean_ativo
    case 'nome_short':
      return p.import_row_nome_short
    case 'codigo_invalid':
      return p.import_row_codigo_invalid
    case 'origem_invalid':
      return p.import_row_origem_invalid
    case 'preco_not_positive':
      return p.import_row_preco_not_positive
    case 'atacado_invalid':
      return p.import_row_atacado_invalid
    case 'gatilho_invalid':
      return p.import_row_gatilho_invalid
    case 'unidade_invalid':
      return p.import_row_unidade_invalid
    case 'zod_other':
      return interpolateTemplate(p.import_row_zod_other, { detail: reason.detail })
  }
}
