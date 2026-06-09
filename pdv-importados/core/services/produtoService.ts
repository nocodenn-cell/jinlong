import type {
  NovoProdutoInput,
  ProdutoRepositoryPort,
  StatusPublicacao,
} from '@/core/ports/produto'

export type CriarProdutoResult =
  | { success: true; data: { id: string } }
  | { success: false; error: string }

/**
 * Persiste produto + estoque inicial.
 * Validação (Zod) fica na camada de apresentação (Server Actions).
 */
export async function criarProdutoComEstoque(
  input: NovoProdutoInput,
  repo: ProdutoRepositoryPort
): Promise<CriarProdutoResult> {
  const result = await repo.createWithDefaultEstoque(input)
  if (!result.ok) {
    return { success: false, error: result.message }
  }
  return { success: true, data: { id: result.id } }
}

export type AlternarAtivoResult =
  | { success: true }
  | { success: false; error: string }

export async function alternarAtivoProduto(
  produtoId: string,
  ativo: boolean,
  repo: ProdutoRepositoryPort
): Promise<AlternarAtivoResult> {
  const result = await repo.updateAtivo(produtoId, ativo)
  if (!result.ok) return { success: false, error: result.message }
  return { success: true }
}

export async function publicarProdutoCatalogo(
  produtoId: string,
  repo: ProdutoRepositoryPort
): Promise<AlternarAtivoResult> {
  const result = await repo.updateStatusPublicacao(produtoId, 'PUBLICADO')
  if (!result.ok) return { success: false, error: result.message }
  return { success: true }
}

export async function inativarProdutoCatalogo(
  produtoId: string,
  repo: ProdutoRepositoryPort
): Promise<AlternarAtivoResult> {
  const result = await repo.updateStatusPublicacao(produtoId, 'INATIVO')
  if (!result.ok) return { success: false, error: result.message }
  return { success: true }
}

export type { StatusPublicacao }
