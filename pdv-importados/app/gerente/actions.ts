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

export type DashboardResumoDTO = {
  tz: string
  hoje: string
  ontem: string
  faturamento_hoje: number
  faturamento_ontem: number
  quantidade_vendas_hoje: number
  quantidade_vendas_ontem: number
  ticket_medio_hoje: number
  ticket_medio_ontem: number
  /**
   * Margem bruta estimada do dia (R$) ou `null` quando a cobertura de custo
   * for menor que 95% — alinhado com `relatorio_resumo_executivo_periodo`.
   */
  margem_estimada: number | null
  cobertura_custo: number
  custo_confiavel: boolean
}

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

function parseDashboardResumo(raw: unknown): DashboardResumoDTO {
  const r = (raw ?? {}) as Record<string, unknown>
  const num = (v: unknown) => Number(v ?? 0)
  return {
    tz: String(r.tz ?? 'America/Sao_Paulo'),
    hoje: String(r.hoje ?? ''),
    ontem: String(r.ontem ?? ''),
    faturamento_hoje: num(r.faturamento_hoje),
    faturamento_ontem: num(r.faturamento_ontem),
    quantidade_vendas_hoje: num(r.quantidade_vendas_hoje),
    quantidade_vendas_ontem: num(r.quantidade_vendas_ontem),
    ticket_medio_hoje: num(r.ticket_medio_hoje),
    ticket_medio_ontem: num(r.ticket_medio_ontem),
    margem_estimada:
      r.margem_estimada === null || r.margem_estimada === undefined
        ? null
        : Number(r.margem_estimada),
    cobertura_custo: num(r.cobertura_custo),
    custo_confiavel: Boolean(r.custo_confiavel),
  }
}
