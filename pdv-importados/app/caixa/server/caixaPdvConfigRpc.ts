import { createClient } from '@/lib/supabase/server'
import { mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'

type PdvConfigCaixaWebRow = {
  quantidade_minima_atacado_padrao: number
  blind_closure: boolean
}

/** Campos não sensíveis de `pdv_config` (migration 058 — tabela sem SELECT direto para authenticated). */
export async function fetchPdvConfigParaCaixaWeb(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<
  { ok: true; row: PdvConfigCaixaWebRow | null } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('pdv_config_para_caixa_web')
  if (error) return { ok: false, error: mensagemErroParaUsuario(error.message) }
  const rows = data as PdvConfigCaixaWebRow[] | null | undefined
  const row = rows?.[0] ?? null
  return { ok: true, row }
}
