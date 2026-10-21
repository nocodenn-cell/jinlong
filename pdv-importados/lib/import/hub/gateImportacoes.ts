import 'server-only'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@/lib/navigation/routes'
import { requireModulo, type ClienteSessao } from '@/lib/modulos/requireModulo'
import type { ClienteImport } from '@/lib/import/importIntelligence'
import type { AdminSession } from '@/lib/admin/auth/types'

/**
 * Gate do hub de Importações (Import Intelligence). Server-only.
 *
 * Camadas, todas no servidor:
 *  1. adminPolicy: recurso `route:/admin/importacoes` (perfil DONO/GERENTE).
 *  2. Licença + vínculo + papel + empresa operacional: `requireModulo` → banco
 *     (`fp_empresa_contexto_modulo`). O tenant é derivado da sessão; nada vem do navegador.
 *  3. Cada RPC import_* revalida tudo de novo no banco (RLS + SECURITY DEFINER).
 */

export const MODULO_IMPORT = 'IMPORT_INTELLIGENCE' as const
const PAPEIS_OPERACAO = ['DONO', 'GERENTE'] as const

export type ContextoImportacoes = {
  client: ClienteImport
  session: AdminSession
  empresaId: string
  userId: string
  /** DONO da empresa (aprova, reabre). Decisão de UI; o banco revalida. */
  ehDono: boolean
}

type ClienteServidor = Awaited<ReturnType<typeof createClient>>

async function resolver(session: AdminSession): Promise<ContextoImportacoes | null> {
  const client = await createClient()
  const sessao = client as unknown as ClienteSessao
  const operacao = await requireModulo(sessao, MODULO_IMPORT, { papeis: [...PAPEIS_OPERACAO] })
  if (!operacao.ok) return null
  const dono = await requireModulo(sessao, MODULO_IMPORT, { papeis: ['DONO'], empresaId: operacao.empresaId })
  return {
    client: client as unknown as ClienteImport,
    session,
    empresaId: operacao.empresaId,
    userId: session.userId,
    ehDono: dono.ok,
  }
}

/** Para páginas: sem perfil, licença ou vínculo → 404 (não revela a existência do módulo). */
export async function paginaImportacoes(): Promise<ContextoImportacoes> {
  const { session, permissions } = await loadAdminContext({
    pathname: ROUTES.admin.importacoes,
    resource: `route:${ROUTES.admin.importacoes}`,
  })
  if (!permissions.resources[`route:${ROUTES.admin.importacoes}`]) notFound()
  const ctx = await resolver(session)
  if (!ctx) notFound()
  return ctx
}

/** Para server actions: mesma verificação, devolvendo erro em vez de 404. */
export async function actionImportacoes(
  opts: { somenteDono?: boolean } = {},
): Promise<{ ok: true; ctx: ContextoImportacoes } | { ok: false; erro: 'NAO_AUTORIZADO' }> {
  try {
    const { session, permissions } = await loadAdminContext({
      pathname: ROUTES.admin.importacoes,
      resource: `route:${ROUTES.admin.importacoes}`,
    })
    if (!permissions.resources[`route:${ROUTES.admin.importacoes}`]) return { ok: false, erro: 'NAO_AUTORIZADO' }
    const ctx = await resolver(session)
    if (!ctx || (opts.somenteDono && !ctx.ehDono)) return { ok: false, erro: 'NAO_AUTORIZADO' }
    return { ok: true, ctx }
  } catch {
    return { ok: false, erro: 'NAO_AUTORIZADO' }
  }
}

/** Módulos visíveis no menu (cosmético; best-effort: qualquer falha ⇒ nenhum). */
export async function modulosAtivosDaSessao(): Promise<string[]> {
  try {
    const client: ClienteServidor = await createClient()
    const r = await requireModulo(client as unknown as ClienteSessao, MODULO_IMPORT, { papeis: [...PAPEIS_OPERACAO] })
    return r.ok ? [MODULO_IMPORT] : []
  } catch {
    return []
  }
}
