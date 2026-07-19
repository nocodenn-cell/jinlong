import type { SupabaseClient } from '@supabase/supabase-js'

/** Resolve caixas da loja — vendas não têm loja_id direto. */
export async function listCaixaIdsForStore(
  supabase: SupabaseClient,
  storeId: string,
): Promise<readonly string[]> {
  const { data, error } = await supabase
    .from('caixas')
    .select('id')
    .eq('loja_id', storeId)
    .limit(2_000)

  if (error) {
    throw new Error(`DI_PROVIDER_CAIXAS: ${error.message}`)
  }
  return (data ?? [])
    .map((row) => row.id as string)
    .filter((id) => typeof id === 'string' && id.length > 0)
}
