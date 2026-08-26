/**
 * Contrato canônico de `public.fornecedores` (piloto).
 * Campos comerciais futuros (telefone/email/contato/ativo) exigem migration aditiva.
 */

export const FORNECEDOR_SELECT_COLUMNS =
  'id, cnpj, nome, loja_id, created_at, updated_at' as const

/** Colunas que nunca existiram no schema — regressão se voltarem ao SELECT/payload. */
export const FORNECEDOR_COLUNAS_FANTASMA = [
  'ativo',
  'documento',
  'criado_em',
  'tipo',
  'email',
  'telefone',
  'contato_pessoa',
  'categoria',
  'endereco_logradouro',
  'endereco_numero',
  'endereco_complemento',
  'endereco_bairro',
  'endereco_cidade',
  'endereco_uf',
  'endereco_cep',
] as const

export type FornecedorListRow = {
  id: string
  cnpj: string
  nome: string
  loja_id: string
  created_at: string
  updated_at: string
}

export type FornecedorInput = {
  id?: string
  nome: string
  cnpj: string
}

export function normalizarCnpj(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function validarFornecedorInput(input: FornecedorInput): string | null {
  if (!input.nome || input.nome.trim().length < 2) return 'Nome inválido.'
  const cnpj = normalizarCnpj(input.cnpj)
  if (cnpj.length !== 14) return 'CNPJ deve ter 14 dígitos.'
  return null
}

export function selectContemColunaFantasma(selectSql: string): string | null {
  const tokens = selectSql
    .split(/[\s,]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
  for (const col of FORNECEDOR_COLUNAS_FANTASMA) {
    if (tokens.includes(col)) return col
  }
  return null
}

export const MSG_FORNECEDOR_SEM_LOJA =
  'Sua conta não está associada a uma loja. Contate o administrador.'

export const MSG_FORNECEDOR_LOJA_INVALIDA =
  'Fornecedor inválido para esta loja.'

/** Fail-closed: escrita/leitura scoped nunca cai em Loja Matriz. */
export function lojaIdDaSessao(
  session: { lojaId: string | null },
): { ok: true; lojaId: string } | { ok: false; error: string } {
  if (!session.lojaId) return { ok: false, error: MSG_FORNECEDOR_SEM_LOJA }
  return { ok: true, lojaId: session.lojaId }
}
