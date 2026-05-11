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

export type DashboardSerieHora = {
  hora: number
  faturamento: number
  vendas: number
}

export type DashboardEstoqueCritico = {
  id: string
  nome: string
  sku: string | null
  quantidade_atual: number
  estoque_minimo: number
  deficit: number
}

export type DashboardAtividadeTipo = 'VENDA' | 'ESTOQUE' | 'CAIXA'

export type DashboardAtividadeRecente = {
  data_hora: string
  tipo: DashboardAtividadeTipo
  descricao: string
}

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
  /** 24 buckets fixos (hora 0..23) com faturamento e nº vendas no dia. */
  serie_horaria_hoje: DashboardSerieHora[]
  /** Top 5 produtos com `quantidade_atual <= estoque_minimo` na loja. */
  estoque_critico: DashboardEstoqueCritico[]
  /** Top 5 atividades das últimas 48h (vendas, estoque, caixa). */
  atividades_recentes: DashboardAtividadeRecente[]
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
    serie_horaria_hoje: parseSerieHoraria(r.serie_horaria_hoje),
    estoque_critico: parseEstoqueCritico(r.estoque_critico),
    atividades_recentes: parseAtividades(r.atividades_recentes),
  }
}

function parseSerieHoraria(raw: unknown): DashboardSerieHora[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      hora: Number(x.hora ?? 0),
      faturamento: Number(x.faturamento ?? 0),
      vendas: Number(x.vendas ?? 0),
    }))
}

function parseEstoqueCritico(raw: unknown): DashboardEstoqueCritico[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      id: String(x.id ?? ''),
      nome: String(x.nome ?? ''),
      sku: x.sku === null || x.sku === undefined ? null : String(x.sku),
      quantidade_atual: Number(x.quantidade_atual ?? 0),
      estoque_minimo: Number(x.estoque_minimo ?? 0),
      deficit: Number(x.deficit ?? 0),
    }))
}

function parseAtividades(raw: unknown): DashboardAtividadeRecente[] {
  if (!Array.isArray(raw)) return []
  const tiposPermitidos: DashboardAtividadeTipo[] = ['VENDA', 'ESTOQUE', 'CAIXA']
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => {
      const tipoRaw = String(x.tipo ?? '')
      const tipo = (tiposPermitidos as string[]).includes(tipoRaw)
        ? (tipoRaw as DashboardAtividadeTipo)
        : 'VENDA'
      return {
        data_hora: String(x.data_hora ?? ''),
        tipo,
        descricao: String(x.descricao ?? ''),
      }
    })
}
