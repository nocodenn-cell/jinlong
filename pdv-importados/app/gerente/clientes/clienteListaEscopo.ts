export type EscopoCrediario = 'todos' | 'filtrado' | 'parcial'

/** A soma da tela é dos clientes já carregados — não de um total de loja à parte. */
export function escopoCrediario(filtrado: boolean, hasMore: boolean): EscopoCrediario {
  if (filtrado) return 'filtrado'
  if (hasMore) return 'parcial'
  return 'todos'
}
