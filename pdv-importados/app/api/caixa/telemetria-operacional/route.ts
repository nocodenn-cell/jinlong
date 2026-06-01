/**
 * POST /api/caixa/telemetria-operacional
 *
 * Recebe eventos operacionais do PDV (fire-and-forget do cliente)
 * e persiste na tabela operational_metrics.
 *
 * Autenticação: requer sessão válida (operador logado).
 * Rate limit: 120 req/min por IP.
 * Falha silenciosa do ponto de vista do cliente: sempre retorna 202.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

const TELEMETRY_EVENTS = [
  'finalize_started',
  'finalize_success',
  'finalize_error',
  'finalize_timeout',
  'finalize_retry',
  'double_click_blocked',
  'cross_tab_detected',
  'novo_cupom_blocked_during_flight',
  'venda_reconciled_after_timeout',
  'modal_opened',
  'product_search_started',
  'product_search_result',
  'cart_abandoned',
  'session_idle_logout',
  'caixa_aberto',
  'caixa_fechado',
] as const

const payloadSchema = z.object({
  event:       z.enum(TELEMETRY_EVENTS),
  duration_ms: z.number().int().min(0).max(300_000).optional(),
  caixa_id:    z.string().uuid().optional(),
  metadata:    z.record(z.unknown()).optional(),
})

// Aceita sempre 202 — telemetria não pode bloquear o PDV
const ACCEPTED = NextResponse.json({ ok: true }, { status: 202 })
const IGNORED   = NextResponse.json({ ok: true, ignored: true }, { status: 202 })

export async function POST(request: Request): Promise<NextResponse> {
  // Rate limit: 120 req/min por IP (6 PDVs ativos = ~2 req/s max)
  const { ok } = rateLimit(request, { limit: 120, windowMs: 60_000 })
  if (!ok) return IGNORED

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return IGNORED
  }

  const parsed = payloadSchema.safeParse(body)
  if (!parsed.success) return IGNORED

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return IGNORED // sessão expirada — descarta silenciosamente

  const { event, duration_ms, caixa_id, metadata } = parsed.data

  const { error } = await supabase.from('operational_metrics').insert({
    event,
    operador_id: user.id,
    caixa_id:    caixa_id ?? null,
    duration_ms: duration_ms ?? null,
    metadata:    metadata ?? {},
  })

  if (error) {
    // Não propaga o erro ao cliente — telemetria não pode quebrar o PDV
    console.warn('[telemetria-operacional] insert falhou:', error.message)
  }

  return ACCEPTED
}
