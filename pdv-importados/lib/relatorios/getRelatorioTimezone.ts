import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Fuso IANA passado às RPCs `relatorio_*_periodo`.
 * Precedência: `RELATORIO_TIMEZONE` (servidor) → coluna `relatorio_settings.timezone` → America/Sao_Paulo.
 * Validação final no Postgres (`relatorio_tz_validado`).
 */
export async function getRelatorioTimezone(supabase: SupabaseClient): Promise<string> {
  const envTz = process.env.RELATORIO_TIMEZONE?.trim()
  if (envTz) return envTz

  const { data, error } = await supabase.from('relatorio_settings').select('timezone').eq('id', 1).maybeSingle()

  if (error || !data || typeof data !== 'object' || !('timezone' in data)) {
    return 'America/Sao_Paulo'
  }

  const dbTz = String((data as { timezone: unknown }).timezone ?? '').trim()
  return dbTz || 'America/Sao_Paulo'
}
