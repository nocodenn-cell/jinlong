/**
 * Normalização de leitura (scanner/teclado) e mapa de produtos para o PDV local.
 * Cobre: trim, só dígitos, remoção de zeros à esquerda e chaves duplicadas do cadastro.
 */

import { variantesChaveLeitura } from '@core/caixa/variantesChaveLeitura'
export { variantesChaveLeitura }

export type ProdutoCacheLite = {
  id: string
  nome: string
  codigo_barras: string | null | undefined
  preco_varejo: number
  categoria_id: string | null | undefined
  ativo: boolean
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Mapa: cada variante de código + id do produto (útil para suporte / testes). */
export function buildMapaProdutoChaves(
  produtos: ProdutoCacheLite[]
): Record<string, ProdutoCacheLite> {
  const m: Record<string, ProdutoCacheLite> = {}
  const put = (k: string, p: ProdutoCacheLite) => {
    if (!k || m[k]) return
    m[k] = p
  }

  for (const p of produtos) {
    if (!p.ativo) continue
    put(p.id, p)
    put(p.id.toLowerCase(), p)
    const cb = p.codigo_barras != null ? String(p.codigo_barras).trim() : ''
    if (cb) {
      for (const v of variantesChaveLeitura(cb)) {
        put(v, p)
      }
    }
  }
  return m
}

export function produtosCatalogoAtivos(
  produtos: ProdutoCacheLite[]
): ProdutoCacheLite[] {
  return produtos.filter((p) => p.ativo)
}

/** Resolve produto por variantes de código, UUID ou nome. */
export function resolverProdutoNoCatalogo(
  input: string,
  mapa: Record<string, ProdutoCacheLite>,
  catalogo: ProdutoCacheLite[]
): ProdutoCacheLite | undefined {
  const trimmed = input.trim()
  if (!trimmed) return undefined

  for (const k of variantesChaveLeitura(trimmed)) {
    const hit = mapa[k]
    if (hit) return hit
  }

  if (UUID_RE.test(trimmed)) {
    const idLower = trimmed.toLowerCase()
    const porId = catalogo.find((p) => p.id.toLowerCase() === idLower)
    if (porId) return porId
  }

  const norm = trimmed.toLowerCase()
  const porNomeExato = catalogo.find((p) => p.nome.toLowerCase() === norm)
  if (porNomeExato) return porNomeExato

  const porIncludes = catalogo.find((p) =>
    p.nome.toLowerCase().includes(norm)
  )
  if (porIncludes) return porIncludes

  const tokens = norm.split(/\s+/).filter(Boolean)
  if (tokens.length >= 2) {
    const multi = catalogo.find((p) => {
      const n = p.nome.toLowerCase()
      return tokens.every((t) => n.includes(t))
    })
    if (multi) return multi
  }

  return undefined
}
