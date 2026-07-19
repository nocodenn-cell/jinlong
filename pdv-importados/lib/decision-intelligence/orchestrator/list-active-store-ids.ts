import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Lista lojas ativas — I/O puro, sem regras de Decision Intelligence.
 */
export async function listActiveStoreIds(
  supabase: SupabaseClient,
): Promise<readonly string[]> {
  const { data, error } = await supabase
    .from('lojas')
    .select('id')
    .eq('ativo', true)

  if (error) {
    throw new Error(`DI_ORCH_LIST_STORES: ${error.message}`)
  }

  return (data ?? [])
    .map((row) => row.id as string)
    .filter((id) => typeof id === 'string' && id.length > 0)
}
