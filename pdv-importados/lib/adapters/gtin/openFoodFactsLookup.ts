import type { GtinLookupHit } from '@/core/ports/gtinLookup'
import { isGtinLookupCandidate, normalizeGtinDigits } from '@/core/catalog/sugestaoCadastro'

type OffProduct = {
  product_name?: string
  product_name_pt?: string
  generic_name?: string
  brands?: string
  categories?: string
  categories_tags?: string[]
  ncm?: string
  code?: string
}

type OffResponse = {
  status?: number
  product?: OffProduct
}

function pickNome(p: OffProduct): string | null {
  const candidates = [p.product_name_pt, p.product_name, p.generic_name]
  for (const c of candidates) {
    const t = (c ?? '').trim()
    if (t.length >= 2) return t.slice(0, 200)
  }
  return null
}

function pickCategoria(p: OffProduct): string | null {
  if (p.categories?.trim()) {
    const first = p.categories.split(',')[0]?.trim()
    if (first) return first.slice(0, 120)
  }
  const tag = p.categories_tags?.[0]
  if (tag) return tag.replace(/^en:/, '').replace(/-/g, ' ').slice(0, 120)
  return null
}

/**
 * Open Food Facts — API pública, sem chave.
 * Desligar com GTIN_LOOKUP_EXTERNAL=0.
 */
export async function lookupOpenFoodFacts(
  rawGtin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GtinLookupHit | null> {
  if (process.env.GTIN_LOOKUP_EXTERNAL === '0') return null
  const gtin = normalizeGtinDigits(rawGtin)
  if (!isGtinLookupCandidate(gtin)) return null

  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(gtin)}.json`
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 4_500)
  const res = await fetchImpl(url, {
    headers: {
      'User-Agent': 'JinLong-PDV/1.0 (cadastro-produto; +https://fastproduct.local)',
      Accept: 'application/json',
    },
    signal: ac.signal,
  })
    .catch(() => null)
    .finally(() => clearTimeout(timer))
  if (!res?.ok) return null

  const body = (await res.json().catch(() => null)) as OffResponse | null
  if (!body || body.status !== 1 || !body.product) return null

  const nome = pickNome(body.product)
  if (!nome) return null

  return {
    gtin,
    nome,
    ncm: null,
    marca: body.product.brands?.trim().slice(0, 80) || null,
    categoriaExterna: pickCategoria(body.product),
    fonte: 'openfoodfacts',
  }
}
