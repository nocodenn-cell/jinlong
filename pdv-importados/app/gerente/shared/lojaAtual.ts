import type { SupabaseClient } from '@supabase/supabase-js'

export async function obterLojaAtualDoUsuario(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('usuarios')
    .select('loja_id')
    .eq('id', user.id)
    .maybeSingle()

  const lojaId = data?.loja_id
  return typeof lojaId === 'string' && lojaId.trim() ? lojaId : null
}
