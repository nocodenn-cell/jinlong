/**
 * Normalização de leitura (scanner/teclado) e mapa de produtos para o PDV local.
 * Cobre: trim, só dígitos, remoção de zeros à esquerda e chaves duplicadas do cadastro.
 */

import { variantesChaveLeitura } from '@core/caixa/variantesChaveLeitura'
import {
  filterProdutosVendaveis,
  isProdutoVendavel,
  type StatusPublicacao,
} from '@core/catalog/isProdutoVendavel'

export { variantesChaveLeitura }
export { isProdutoVendavel, filterProdutosVendaveis }

export type ProdutoCacheLite = {
  id: string
  nome: string
  codigo_barras: string | null | undefined
  preco_varejo: number
  /** Catálogo atacado (RPC fallback). */
  preco_atacado?: number | null
  categoria_id: string | null | undefined
  ativo: boolean
  status_publicacao?: StatusPublicacao | string | null
  /** URL pública da foto (sync); opcional. */
  imagem_url?: string | null
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
    if (!isProdutoVendavel(p)) continue
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

/** @deprecated Use produtosCatalogoVendaveis — alias legado. */
export const produtosCatalogoAtivos = produtosCatalogoVendaveis

/** Catálogo PDV offline: apenas produtos que passam isProdutoVendavel. */
export function produtosCatalogoVendaveis(
  produtos: ProdutoCacheLite[],
): ProdutoCacheLite[] {
  return filterProdutosVendaveis(produtos)
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
    if (porId && isProdutoVendavel(porId)) return porId
  }

  const vendaveis = filterProdutosVendaveis(catalogo)
  const norm = trimmed.toLowerCase()
  const porNomeExato = vendaveis.find((p) => p.nome.toLowerCase() === norm)
  if (porNomeExato) return porNomeExato

  const porIncludes = vendaveis.find((p) =>
    p.nome.toLowerCase().includes(norm)
  )
  if (porIncludes) return porIncludes

  const tokens = norm.split(/\s+/).filter(Boolean)
  if (tokens.length >= 2) {
    const multi = vendaveis.find((p) => {
      const n = p.nome.toLowerCase()
      return tokens.every((t) => n.includes(t))
    })
    if (multi) return multi
  }

  return undefined
}
