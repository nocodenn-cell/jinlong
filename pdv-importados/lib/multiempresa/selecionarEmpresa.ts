import type { SupabaseClient } from '@supabase/supabase-js'

export type VinculoEmpresa = { empresa_id: string; loja_id: string | null; nome: string | null }

type Q = { data: unknown; error: unknown }
type Sb = { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Vínculos ativos do usuário, com o nome da empresa (vista do próprio usuário, RLS). */
export async function listarEmpresasDoUsuario(supabase: SupabaseClient, userId: string): Promise<VinculoEmpresa[]> {
  const sb = supabase as unknown as Sb
  const { data, error } = (await sb
    .from('usuario_vinculos')
    .select('empresa_id, loja_id, empresas(nome)')
    .eq('usuario_id', userId)
    .eq('ativo', true)) as Q
  if (error || !Array.isArray(data)) return []
  const porEmpresa = new Map<string, VinculoEmpresa>()
  for (const r of data as Array<{ empresa_id: string; loja_id: string | null; empresas?: { nome?: string } | null }>) {
    const atual = porEmpresa.get(r.empresa_id)
    if (!atual || (!atual.loja_id && r.loja_id)) {
      porEmpresa.set(r.empresa_id, { empresa_id: r.empresa_id, loja_id: r.loja_id, nome: r.empresas?.nome ?? null })
    }
  }
  return [...porEmpresa.values()]
}

/**
 * Valida a escolha e devolve a loja ativa a gravar em `usuarios.loja_id`
 * (as policies legadas seguem a loja ativa; o header só estreita).
 * Vínculo de empresa inteira (loja_id null) ⇒ primeira loja ativa da empresa.
 */
export async function lojaAtivaParaEmpresa(
  admin: SupabaseClient,
  vinculos: VinculoEmpresa[],
  empresaId: string,
): Promise<{ ok: true; lojaId: string } | { ok: false; motivo: 'sem_vinculo' | 'sem_loja' }> {
  const v = vinculos.find((x) => x.empresa_id === empresaId)
  if (!v) return { ok: false, motivo: 'sem_vinculo' }
  if (v.loja_id) return { ok: true, lojaId: v.loja_id }
  const sb = admin as unknown as Sb
  const { data } = (await sb
    .from('lojas')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()) as Q
  const id = (data as { id?: string } | null)?.id
  return id ? { ok: true, lojaId: id } : { ok: false, motivo: 'sem_loja' }
}
