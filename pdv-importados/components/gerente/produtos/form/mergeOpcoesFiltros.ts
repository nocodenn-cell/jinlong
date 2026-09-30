import type { OpcoesFiltrosProdutos } from '@/lib/gerente/produtos/opcoesFiltrosTypes'

/**
 * Sincroniza opções do servidor com appends locais do modal aberto.
 * Servidor é a base; ids só locais (quick-create ainda não no cache) são preservados.
 */
export function mergeOpcoesPorId<T extends { id: string }>(server: T[], local: T[]): T[] {
  const serverIds = new Set(server.map((o) => o.id))
  const extras = local.filter((o) => !serverIds.has(o.id))
  return extras.length === 0 ? server : [...server, ...extras]
}

export function mergeOpcoesFiltrosPreservandoLocal(
  local: OpcoesFiltrosProdutos,
  server: OpcoesFiltrosProdutos,
): OpcoesFiltrosProdutos {
  return {
    categorias: mergeOpcoesPorId(server.categorias, local.categorias),
    marcas: mergeOpcoesPorId(server.marcas, local.marcas),
    fornecedores: mergeOpcoesPorId(server.fornecedores, local.fornecedores),
  }
}
