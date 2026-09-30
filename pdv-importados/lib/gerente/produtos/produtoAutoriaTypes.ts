/** Autoria de produto — tipo fora de `app/` (a action reexporta). */
export type ProdutoAutoria = {
  criadoPorNome: string | null
  criadoEm: string | null
  /** true quando há autor registrado mas o nome não pôde ser lido (≠ removido). */
  criadoPorIndisponivel: boolean
  atualizadoPorNome: string | null
  atualizadoEm: string | null
  atualizadoPorIndisponivel: boolean
}
