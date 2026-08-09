/**
 * Helpers puros da listagem de Fornecedores (UI only — sem I/O).
 */

export type StatusFiltroFornecedor = 'todos' | 'ativos' | 'inativos'

export function filtrosFornecedorAtivos(
  termo: string,
  status: StatusFiltroFornecedor,
): boolean {
  return termo.trim().length > 0 || status !== 'todos'
}

export function montarTituloContagem(
  carregados: number,
  hasMore: boolean,
  labels: { mostrando: string; ha_mais: string },
): string {
  const base = labels.mostrando.replace('{n}', String(carregados))
  return hasMore ? `${base} · ${labels.ha_mais}` : base
}

export function fornecedorTemEndereco(f: {
  endereco_logradouro?: string | null
  endereco_numero?: string | null
  endereco_complemento?: string | null
  endereco_bairro?: string | null
  endereco_cidade?: string | null
  endereco_cep?: string | null
}): boolean {
  return Boolean(
    f.endereco_logradouro ||
      f.endereco_numero ||
      f.endereco_complemento ||
      f.endereco_bairro ||
      f.endereco_cidade ||
      f.endereco_cep,
  )
}
