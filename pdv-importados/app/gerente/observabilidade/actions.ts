'use server'

import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'

export type MetricaAgregada = {
  event: string
  total: number
  ultima_hora: number
  p50_ms: number | null
  p95_ms: number | null
  p99_ms: number | null
  operadores_unicos: number
  ultimo_evento: string | null
}

export type ObservabilidadeSummary = {
  metricas: MetricaAgregada[]
  // Derivados calculados no servidor para simplificar a UI
  finalize_p95_ms: number | null
  finalize_total_hoje: number
  finalize_timeout_hoje: number
  finalize_error_hoje: number
  finalize_retry_hoje: number
  double_click_blocked_hoje: number
  cross_tab_detected_hoje: number
  venda_reconciled_hoje: number
  timeout_rate_pct: number | null
  retry_rate_pct: number | null
}

export async function obterObservabilidadeSummary(): Promise<
  { ok: true; data: ObservabilidadeSummary } | { ok: false; error: string }
> {
  const { perfil } = await getUsuarioIdioma()
  if (!['GERENTE', 'DONO', 'ADMIN'].includes(perfil ?? '')) {
    return { ok: false, error: 'Acesso negado.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('vw_opmetrics_hoje')
    .select('*')
    .order('total', { ascending: false })

  if (error) return { ok: false, error: error.message }

  const rows = (data ?? []) as MetricaAgregada[]

  const find = (event: string) => rows.find((r) => r.event === event)

  const success   = find('finalize_success')
  const timeout   = find('finalize_timeout')
  const errEvt    = find('finalize_error')
  const retry     = find('finalize_retry')
  const dblClick  = find('double_click_blocked')
  const crossTab  = find('cross_tab_detected')
  const reconcile = find('venda_reconciled_after_timeout')

  const totalFinalizado = (success?.total ?? 0) + (timeout?.total ?? 0) + (errEvt?.total ?? 0)
  const timeoutRate = totalFinalizado > 0
    ? Math.round(((timeout?.total ?? 0) / totalFinalizado) * 100 * 10) / 10
    : null
  const retryRate = totalFinalizado > 0
    ? Math.round(((retry?.total ?? 0) / totalFinalizado) * 100 * 10) / 10
    : null

  return {
    ok: true,
    data: {
      metricas: rows,
      finalize_p95_ms:            success?.p95_ms ?? null,
      finalize_total_hoje:        success?.total ?? 0,
      finalize_timeout_hoje:      timeout?.total ?? 0,
      finalize_error_hoje:        errEvt?.total ?? 0,
      finalize_retry_hoje:        retry?.total ?? 0,
      double_click_blocked_hoje:  dblClick?.total ?? 0,
      cross_tab_detected_hoje:    crossTab?.total ?? 0,
      venda_reconciled_hoje:      reconcile?.total ?? 0,
      timeout_rate_pct:           timeoutRate,
      retry_rate_pct:             retryRate,
    },
  }
}
