import { createClient } from '@/lib/supabase/server'

export async function quantidadeEstoque(
  supabase: Awaited<ReturnType<typeof createClient>>,
  produtoId: string,
  lojaId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from('estoque')
    .select('quantidade_atual')
    .eq('produto_id', produtoId)
    .eq('loja_id', lojaId)
    .maybeSingle()
  if (!data || data.quantidade_atual === undefined || data.quantidade_atual === null) {
    return null
  }
  return Number(data.quantidade_atual)
}
