import type { CotacaoUsdBrlResult } from '@/app/caixa/caixaActionTypes'

function parseFallbackEnv(): number | null {
  const raw =
    process.env.CAMBIO_USD_BRL_FALLBACK ?? process.env.NEXT_PUBLIC_CAMBIO_USD_BRL_FALLBACK ?? ''
  const n = Number(String(raw).replace(',', '.').trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/**
 * Cotação USD→BRL para referência no caixa (Frankfurter; sem chave).
 * Em falha de rede, usa `CAMBIO_USD_BRL_FALLBACK` ou `NEXT_PUBLIC_CAMBIO_USD_BRL_FALLBACK` se definido.
 */
export async function obterCotacaoUsdBrlImpl(): Promise<CotacaoUsdBrlResult> {
  const fallback = parseFallbackEnv()
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=BRL', {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    clearTimeout(t)
    if (!res.ok) throw new Error('http')
    const j = (await res.json()) as { date?: string; rates?: { BRL?: number } }
    const brl = j.rates?.BRL
    if (typeof brl !== 'number' || !Number.isFinite(brl)) throw new Error('parse')
    return {
      ok: true,
      brlPorUsd: brl,
      fonte: 'api',
      dataReferencia: j.date ?? new Date().toISOString().slice(0, 10),
    }
  } catch {
    if (fallback !== null) {
      return {
        ok: true,
        brlPorUsd: fallback,
        fonte: 'fallback',
        dataReferencia: new Date().toISOString().slice(0, 10),
      }
    }
    return { ok: false }
  }
}
