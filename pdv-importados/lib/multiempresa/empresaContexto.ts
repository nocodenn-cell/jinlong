import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Empresa da operação para leituras/gravações de configuração por empresa (fase 3).
 * Usa `fp_empresa_contexto` no banco (empresa selecionada ⇒ loja ativa do usuário ⇒ única empresa).
 * Função ausente (migration não aplicada) ⇒ `null` = comportamento antigo (sem filtro).
 */
export async function empresaContextoId(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await (
      supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
      }
    ).rpc('fp_empresa_contexto', { p_loja: null })
    if (error || typeof data !== 'string') return null
    return data
  } catch {
    return null
  }
}

/** Aplica `.eq('empresa_id', id)` quando há empresa de contexto (consulta tipada sem a coluna nova). */
export function filtrarEmpresa<Q>(query: Q, empresaId: string | null): Q {
  if (!empresaId) return query
  return (query as unknown as { eq: (c: string, v: string) => Q }).eq('empresa_id', empresaId)
}
