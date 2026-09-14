/**
 * Converte a resposta de uma contagem embutida do PostgREST
 * (`select('id, produtos(count)')`) em `id → quantidade`.
 *
 * Substitui o N+1 de um `HEAD count` em `produtos` por linha listada: a contagem
 * embutida percorre a mesma FK e respeita a mesma RLS de `produtos`, então o
 * número por linha é o mesmo — em uma única ida ao banco.
 * Formato inesperado ou erro → mapa vazio (a tela mostra 0, como antes em erro).
 */
export function mapaContagemProdutos(data: unknown): Record<string, number> {
  const mapa: Record<string, number> = {}
  if (!Array.isArray(data)) return mapa
  for (const linha of data) {
    if (!linha || typeof linha !== 'object') continue
    const { id, produtos } = linha as { id?: unknown; produtos?: unknown }
    if (typeof id !== 'string') continue
    const agregado = Array.isArray(produtos) ? produtos[0] : produtos
    const count = Number((agregado as { count?: unknown } | null | undefined)?.count ?? 0)
    mapa[id] = Number.isFinite(count) ? count : 0
  }
  return mapa
}
