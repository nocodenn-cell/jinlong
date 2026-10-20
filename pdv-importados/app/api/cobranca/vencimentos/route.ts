import { NextResponse } from 'next/server'
import { timingSafeEqual, createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

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
  const admin = createAdminClient()
  const { data, error } = await (admin as unknown as {
    rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>
  }).rpc('cobranca_processar_vencimentos')
  if (error) return NextResponse.json({ ok: false, error: 'FALHA' }, { status: 500 })
  return NextResponse.json({ ok: true, resultado: data })
}
