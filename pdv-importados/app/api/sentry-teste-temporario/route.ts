// TEMPORÁRIO (2026-10-22): valida o envio ao Sentry em produção. Remover logo após o teste.
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const eventId = Sentry.captureException(new Error('Sentry teste temporario Jinlong 2026-10-22'))
  await Sentry.flush(5000)
  return NextResponse.json({ ok: true, eventId })
}
