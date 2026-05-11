'use server'

import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { getLojaIdUsuario, LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { getRelatorioTimezone } from '@/lib/relatorios/getRelatorioTimezone'
import {
  actionFail,
  runServerActionWithObservability,
  type ActionResult,
} from '@/lib/observability/runServerAction'
import { parseDashboardResumo } from '@/lib/gerente/dashboardResumoParse'
import type { DashboardResumoDTO } from '@/lib/gerente/dashboardResumoTypes'

export type {
  DashboardSerieHora,
  DashboardEstoqueCritico,
  DashboardAtividadeTipo,
  DashboardAtividadeRecente,
  DashboardResumoDTO,
} from '@/lib/gerente/dashboardResumoTypes'

/**
 * KPIs do dia para o dashboard do gerente. A RPC já valida perfil
 * (GERENTE/DONO/ADMIN) e o acesso à loja (gerente só enxerga a própria).
 *
 * Cache: deliberadamente sem `unstable_cache` por enquanto — o cliente
 * Supabase depende de `cookies()` para o JWT do usuário, e funções dentro
 * de `unstable_cache` rodam em contexto isolado. A revalidação fica no nível
 * da página (`export const revalidate`).
 */
export async function obterDashboardResumo(): Promise<ActionResult<DashboardResumoDTO>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return actionFail(auth.error, { errorCode: 'UNAUTHORIZED' })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return actionFail('Faça login para continuar.', { errorCode: 'UNAUTHORIZED' })
  }

  const lojaId = (await getLojaIdUsuario(supabase, user.id)) ?? LOJA_MATRIZ_ID
  const tz = await getRelatorioTimezone(supabase)

  return runServerActionWithObservability(
    'gerente/dashboard/resumo',
    async () => {
      const { data, error } = await supabase.rpc('dashboard_gerente_resumo', {
        p_loja_id: lojaId,
        p_tz: tz,
      })
      if (error) throw new Error(error.message)
      return parseDashboardResumo(data)
    },
    'dashboard_gerente_resumo',
  )
}
