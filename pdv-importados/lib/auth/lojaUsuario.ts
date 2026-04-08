import type { SupabaseClient } from '@supabase/supabase-js'

/** Loja padrão (Matriz) — alinhada à migration `032_lojas_estoque_por_loja.sql`. */
export const LOJA_MATRIZ_ID = 'a0000001-0000-4000-8000-000000000001'

export async function getLojaIdUsuario(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('loja_id')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data?.loja_id) return null
  return data.loja_id as string
}
