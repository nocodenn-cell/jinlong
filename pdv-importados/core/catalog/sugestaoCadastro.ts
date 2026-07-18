/**
 * Política pura — sugestão de cadastro e metas de tempo (Fase 3).
 * Sem I/O; consumidores: adapters + UI.
 */

export const MARKUP_CADASTRO_PADRAO = 1.5 as const

/** Produto conhecido (nome+preço sugeridos): meta operacional. */
export const META_CADASTRO_CONHECIDO_MS = 8_000 as const
/** Produto novo manual: meta operacional. */
export const META_CADASTRO_MANUAL_MS = 15_000 as const

export type FonteSugestaoCadastro =
  | 'catalogo'
  | 'vinculo_nfe'
  | 'cache'
  | 'openfoodfacts'
  | 'categoria_mediana'
  | 'nenhuma'

export function normalizeGtinDigits(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function isGtinLookupCandidate(digits: string): boolean {
  return digits.length >= 8 && digits.length <= 14
}

/** Mesma regra da RPC import NF-e: varejo ≈ custo × 1.5. */
export function sugerirPrecoVarejoDeCusto(
  custo: number | null | undefined,
  markup = MARKUP_CADASTRO_PADRAO,
): number | null {
  if (custo == null || !Number.isFinite(custo) || custo <= 0) return null
  const v = Math.round(custo * markup * 100) / 100
  return v > 0 ? Math.max(v, 0.01) : null
}

export function medianaPrecos(valores: number[]): number | null {
  const xs = valores.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
  if (xs.length === 0) return null
  const mid = Math.floor(xs.length / 2)
  if (xs.length % 2 === 1) return xs[mid]!
  return Math.round(((xs[mid - 1]! + xs[mid]!) / 2) * 100) / 100
}

/** Match simples: token da sugestão externa ⊆ nome da categoria da loja. */
export function sugerirCategoriaId(
  categorias: ReadonlyArray<{ id: string; nome: string }>,
  pistas: ReadonlyArray<string | null | undefined>,
): string | null {
  const needles = pistas
    .flatMap((p) => (p ?? '').toLowerCase().split(/[^a-z0-9à-ü]+/i))
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
  if (needles.length === 0 || categorias.length === 0) return null

  let best: { id: string; score: number } | null = null
  for (const cat of categorias) {
    const nome = cat.nome.toLowerCase()
    let score = 0
    for (const n of needles) {
      if (nome.includes(n) || n.includes(nome)) score += n.length
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { id: cat.id, score }
    }
  }
  return best?.id ?? null
}

export function isSugestaoConhecida(input: {
  nome: string | null | undefined
  precoVarejo: number | null | undefined
}): boolean {
  const nomeOk = (input.nome?.trim().length ?? 0) >= 2
  const precoOk = input.precoVarejo != null && input.precoVarejo > 0
  return nomeOk && precoOk
}

export function avaliarMetaCadastroDuration(input: {
  durationMs: number
  knownSuggestion: boolean
}): { metaMs: number; metaOk: boolean } {
  const metaMs = input.knownSuggestion
    ? META_CADASTRO_CONHECIDO_MS
    : META_CADASTRO_MANUAL_MS
  return {
    metaMs,
    metaOk: Number.isFinite(input.durationMs) && input.durationMs <= metaMs,
  }
}
