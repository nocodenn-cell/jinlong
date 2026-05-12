import type { SupabaseClient } from '@supabase/supabase-js'

/** Resposta de `configuracoes_para_caixa_web()` (valores como string). */
export type ConfigCaixaWebMap = Record<string, string>

/**
 * Lê subconjunto público de configurações para o caixa (RPC SECURITY DEFINER).
 */
export async function obterMapaConfiguracoesParaCaixaWeb(
  supabase: SupabaseClient,
): Promise<ConfigCaixaWebMap> {
  const { data, error } = await supabase.rpc('configuracoes_para_caixa_web')
  if (error || data == null || typeof data !== 'object' || Array.isArray(data)) {
    return {}
  }
  const out: ConfigCaixaWebMap = {}
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v)
  }
  return out
}

export function parsePercentConfig(v: string | undefined, fallback: number): number {
  const n = Number.parseFloat(v ?? '')
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function parseMoneyConfig(v: string | undefined, fallback: number): number {
  const n = Number.parseFloat(v ?? '')
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function parseIntegerConfig(v: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}
