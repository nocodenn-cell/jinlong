import type { SupabaseClient } from '@supabase/supabase-js'
import type { GtinLookupHit } from '@/core/ports/gtinLookup'
import { normalizeGtinDigits } from '@/core/catalog/sugestaoCadastro'

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 dias

type CacheRow = {
  gtin: string
  fonte: string
  nome: string | null
  ncm: string | null
  marca: string | null
  categoria_externa: string | null
  expires_at: string
}

export async function readGtinCache(
  supabase: SupabaseClient,
  rawGtin: string,
): Promise<GtinLookupHit | null> {
  const gtin = normalizeGtinDigits(rawGtin)
  if (!gtin) return null
  const { data, error } = await supabase
    .from('gtin_lookup_cache')
    .select('gtin, fonte, nome, ncm, marca, categoria_externa, expires_at')
    .eq('gtin', gtin)
    .maybeSingle()
  if (error || !data) return null
  const row = data as CacheRow
  if (new Date(row.expires_at).getTime() < Date.now()) return null
  if (!row.nome?.trim()) return null
  return {
    gtin: row.gtin,
    nome: row.nome,
    ncm: row.ncm,
    marca: row.marca,
    categoriaExterna: row.categoria_externa,
    fonte: 'cache',
  }
}

export async function writeGtinCache(
  supabase: SupabaseClient,
  hit: GtinLookupHit,
): Promise<void> {
  const gtin = normalizeGtinDigits(hit.gtin)
  if (!gtin || !hit.nome?.trim()) return
  const expires = new Date(Date.now() + CACHE_TTL_MS).toISOString()
  const fonteDb =
    hit.fonte === 'openfoodfacts' || hit.fonte === 'interno' || hit.fonte === 'manual'
      ? hit.fonte
      : hit.fonte === 'cache'
        ? 'openfoodfacts'
        : 'interno'
  await supabase.from('gtin_lookup_cache').upsert(
    {
      gtin,
      fonte: fonteDb,
      nome: hit.nome,
      ncm: hit.ncm,
      marca: hit.marca,
      categoria_externa: hit.categoriaExterna,
      payload: { fonte_origem: hit.fonte },
      fetched_at: new Date().toISOString(),
      expires_at: expires,
    },
    { onConflict: 'gtin' },
  )
}
