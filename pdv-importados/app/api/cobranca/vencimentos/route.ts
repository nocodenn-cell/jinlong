import { NextResponse } from 'next/server'
import { timingSafeEqual, createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAsaas } from '@/lib/cobranca/asaas'
import { conciliarComAsaas } from '@/lib/cobranca/conciliacao'

export const dynamic = 'force-dynamic'

/**
 * Job diário da cobrança (fim do trial, fim da carência, fim do acesso pós-cancelamento).
 * Chamado pelo Vercel Cron (header Authorization: Bearer $CRON_SECRET). Alternativa: pg_cron
 * chamando public.cobranca_processar_vencimentos() direto no banco (docs/cobranca/SETUP_ASAAS.md).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET_NAO_CONFIGURADO' }, { status: 503 })
  const got = req.headers.get('authorization') ?? ''
  const h = (s: string) => createHash('sha256').update(s).digest()
  if (!timingSafeEqual(h(got), h(`Bearer ${secret}`))) return NextResponse.json({ ok: false }, { status: 401 })
  const admin = createAdminClient() as unknown as {
    rpc: (fn: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  }
  // 1) conciliação com o Asaas (webhook perdido/fora de ordem). Falha do Asaas ⇒ só loga; nunca suspende por isso.
  const conciliacao = await conciliarComAsaas(admin, getAsaas())
  // 2) prazos (trial, carência com fatura VENCIDA confirmada, fim do acesso pós-cancelamento)
  const { data, error } = await admin.rpc('cobranca_processar_vencimentos')
  if (error) return NextResponse.json({ ok: false, error: 'FALHA', conciliacao }, { status: 500 })
  return NextResponse.json({ ok: true, conciliacao, resultado: data })
}
