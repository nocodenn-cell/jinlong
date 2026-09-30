/** Opções de filtro/cadastro de produto — tipo fora de `app/` (a action em `app/gerente/produtos/actions.ts` reexporta). */
export type OpcoesFiltrosProdutos = {
  /**
   * `ativo` acompanha a categoria porque o formulário precisa distinguir "não
   * ofereço mais" de "não existe": a categoria inativa some das escolhas novas,
   * mas continua visível no produto que já a usa (senão salvar apagaria o
   * vínculo). Ver `Jinlong/decisoes/CATALOGO_CATEGORIA_INATIVA_E_PUBLICAR.md`.
   */
  categorias: { id: string; nome: string; ativo?: boolean }[]
  /** `ativo` pelo mesmo motivo de `categorias` — ver nota acima. */
  marcas: { id: string; nome: string; ativo?: boolean }[]
  fornecedores: { id: string; nome: string }[]
}
