'use server'

/**
 * Módulo Comissão (P0–P2) — server actions.
 * Toda regra de negócio e autorização fica no banco (RPCs SECURITY DEFINER + RLS por empresa);
 * aqui só há validação de entrada e mapeamento. Nada é lançado em caixa, contas a pagar ou folha.
 */
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'

export type ModuloResult<T> = { success: true; data: T } | { success: false; error: string }

async function ctxGestor() {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false as const, error: auth.error }
  return { ok: true as const, lojaId: auth.session.lojaId ?? LOJA_MATRIZ_ID, supabase: await createClient() }
}

// ── P0: falhas ────────────────────────────────────────────────────────────────
export type FalhaComissao = {
  id: string
  vendaId: string
  etapa: 'APURACAO' | 'AJUSTE' | 'REATRIBUICAO'
  motivo: string
  tentativas: number
  ultimaTentativaEm: string
}

export async function listarFalhasComissao(): Promise<ModuloResult<FalhaComissao[]>> {
  const c = await ctxGestor()
  if (!c.ok) return { success: false, error: c.error }
  const { data, error } = await c.supabase
    .from('comissoes_falhas')
    .select('id, venda_id, etapa, motivo, tentativas, ultima_tentativa_em')
    .eq('loja_id', c.lojaId)
    .is('resolvida_em', null)
    .order('ultima_tentativa_em', { ascending: false })
    .limit(200)
  if (error) return { success: false, error: mensagemErroComSecao('Comissões', error.message) }
  return {
    success: true,
    data: (data ?? []).map((r) => ({
      id: r.id,
      vendaId: r.venda_id,
      etapa: r.etapa as FalhaComissao['etapa'],
      motivo: r.motivo,
      tentativas: r.tentativas,
      ultimaTentativaEm: r.ultima_tentativa_em,
    })),
  }
}

export async function reprocessarComissaoVenda(vendaId: string): Promise<ModuloResult<{ ok: boolean; falha: string | null }>> {
  if (!z.string().uuid().safeParse(vendaId).success) return { success: false, error: 'Venda inválida.' }
  const c = await ctxGestor()
  if (!c.ok) return { success: false, error: c.error }
  const { data, error } = await c.supabase.rpc('reprocessar_comissao_venda', { p_venda_id: vendaId })
  if (error) return { success: false, error: mensagemErroComSecao('Reprocessar comissão', error.message) }
  const r = (data ?? {}) as { ok?: boolean; falha?: string | null }
  revalidatePath('/admin/comissoes')
  return { success: true, data: { ok: !!r.ok, falha: r.falha ?? null } }
}
