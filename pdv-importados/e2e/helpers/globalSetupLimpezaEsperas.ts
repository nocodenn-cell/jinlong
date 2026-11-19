/**
 * Isolamento entre specs (E2E local): vendas EM_ESPERA deixadas por um spec bloqueiam o
 * fechamento do caixa do mesmo operador (regra D1, trigger trg_caixas_bloqueia_fechamento_em_espera).
 * Antes de cada execução, descarta as esperas abertas dos usuários de teste `e2e-*@localhost.test`.
 *
 * Escopo: somente usuários de teste locais (e-mail `e2e-%@localhost.test`). Não toca dados reais.
 * Usa a service_role do `.env.local` (localhost). Sem NEXT_PUBLIC_SUPABASE_URL/SERVICE_ROLE: não faz nada.
 */
import { createClient } from '@supabase/supabase-js'

export default async function globalSetupLimpezaEsperas() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
    throw new Error(`limpeza de esperas recusada: alvo não local (${url})`)
  }
  const admin = createClient(url, key, { auth: { persistSession: false } })
  const { data: users, error: usersErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (usersErr) throw usersErr
  const ids = (users?.users ?? [])
    .filter((u) => (u.email ?? '').toLowerCase().endsWith('@localhost.test') && (u.email ?? '').startsWith('e2e-'))
    .map((u) => u.id)
  if (ids.length === 0) return
  const agora = new Date().toISOString()
  // A constraint de auditoria exige descartada_por: usa o próprio operador da espera.
  for (const operadorId of ids) {
    const { error } = await admin
      .from('vendas_em_espera')
      .update({
        status: 'DESCARTADA',
        descartada_motivo: 'limpeza automática de teste E2E (isolamento entre specs)',
        descartada_por: operadorId,
        descartada_em: agora,
      })
      .eq('status', 'EM_ESPERA')
      .eq('operador_id', operadorId)
    if (error) throw error
  }
}
