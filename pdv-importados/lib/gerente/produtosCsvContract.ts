import { rowsToCsv } from '@/lib/csv'

/**
 * Fase 0 — rastreio para importação/exportação de produtos (gerente).
 *
 * **Últimas migrações numéricas** na pasta `backend/supabase/migrations/`:
 * consultar o maior prefixo `NNN_` (ex.: `083_produto_imagem_url_e_storage.sql`) e eventuais migrações com
 * timestamp (`2026...`). Novas migrações: usar o próximo número livre após `083_`.
 *
 * **FKs / referências a `public.produtos` (inventário não exaustivo):**
 * - `estoque.produto_id` → `produtos(id)` (schema inicial)
 * - `regras_preco.produto_id` → `produtos(id)` (schema inicial)
 * - `venda_itens` / vendas: ver migration `050` (cancelamento de venda, `ON DELETE RESTRICT`)
 * - `034_remessas_movimentos_transferencias.sql`: movimentos com `produto_id`
 *
 * **Cabeçalho canónico:** validação estrita usa esta ordem fixa, após normalizar BOM (`﻿`) e `trim` nas células.
 * O modelo usa chaves estáveis em inglês (sem depender do idioma da UI). Apenas estas colunas são lidas;
 * campos sensíveis da tabela que não aparecem no CSV não são alteráveis por importação.
 *
 * Campos opcionais no CSV: `preco_atacado`, `quantidade_gatilho_atacado`, `unidade_medida`, `observacao`.
 * Deixe em branco para usar o valor padrão (null / 'UN' / null).
 */
export const PRODUTO_IMPORT_CSV_HEADER_KEYS = [
  'id',
  'nome',
  'codigo_barras',
  'preco_varejo',
  'preco_atacado',
  'quantidade_gatilho_atacado',
  'unidade_medida',
  'observacao',
  'origem',
  'tem_nf',
  'ativo',
] as const

export type ProdutoImportCsvHeaderKey = (typeof PRODUTO_IMPORT_CSV_HEADER_KEYS)[number]

/** Limites sugeridos para a server action (Fase 3); reutilizar constantes aqui evita drift. */
export const PRODUTO_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024
export const PRODUTO_IMPORT_MAX_ROWS = 5000

export function buildProdutoImportTemplateCsv(): string {
  return rowsToCsv([...PRODUTO_IMPORT_CSV_HEADER_KEYS], [])
}

export function downloadProdutoImportTemplateCsv(): void {
  const csv = buildProdutoImportTemplateCsv()
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'produtos-modelo-importacao.csv'
  a.click()
  URL.revokeObjectURL(url)
}
