'use server'

/**
 * Fila de revisão de eventos offline — server actions.
 *
 * Camadas (todas no servidor):
 *  1. assertGerenteSession: perfil DONO/GERENTE no painel (1ª barreira, de UI).
 *  2. Cliente Supabase com o JWT do usuário (nunca service_role): o banco decide o escopo.
 *  3. listar_revisoes_offline / revisar_evento_offline (SECURITY DEFINER, 20261028150000): DONO/GERENTE ATIVO da
 *     loja do evento, empresa isolada, sem autoaprovação, FOR UPDATE + idempotência, trilha imutável.
 * Nada aqui confia em id de loja/empresa vindo do navegador: só o id do evento, a decisão e a justificativa.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { ROUTES } from '@/lib/navigation/routes'
import {
  erroRevisaoDoBanco,
  filtroValido,
  mapearLinha,
  validarDecisao,
  type Decisao,
  type ErroRevisao,
  type LinhaBanco,
  type RevisaoItem,
  type RevisaoStatus,
} from '@/lib/revisaoOffline/revisaoOffline'

export type ResultadoLista = { ok: true; itens: RevisaoItem[] } | { ok: false; erro: ErroRevisao }
export type ResultadoDecisao =
  | { ok: true; status: RevisaoStatus; idempotente: boolean }
  | { ok: false; erro: ErroRevisao }

export async function listarRevisoesOffline(filtro?: unknown): Promise<ResultadoLista> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, erro: 'sessao' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('listar_revisoes_offline', {
    p_status: filtroValido(filtro),
    p_limite: 100,
  })
  if (error) return { ok: false, erro: erroRevisaoDoBanco(error.message) }
  return { ok: true, itens: ((data ?? []) as unknown as LinhaBanco[]).map(mapearLinha) }
}

export async function decidirRevisaoOffline(input: { id: string; decisao: Decisao; motivo: string }): Promise<ResultadoDecisao> {
  const v = validarDecisao(input ?? {})
  if (!v.ok) return v
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, erro: 'sessao' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('revisar_evento_offline', {
    p_id: v.value.id,
    p_decisao: v.value.decisao,
    p_motivo: v.value.motivo,
  })
  if (error) return { ok: false, erro: erroRevisaoDoBanco(error.message) }
  const r = (data ?? {}) as { status?: string; idempotente?: boolean }
  revalidatePath(ROUTES.admin.revisaoOffline)
  return {
    ok: true,
    status: r.status === 'REJEITADO' ? 'REJEITADO' : 'APROVADO',
    idempotente: r.idempotente === true,
  }
}
