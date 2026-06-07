import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdminSessionApi } from '@/lib/admin/auth/requireAdminSessionApi'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export type HealthPayload = {
  status: 'online' | 'degraded' | 'offline'
  latency: number
  fiscal_erro: number
  fiscal_fila: number
}

export async function GET() {
  const t0 = Date.now()
  try {
    const auth = await requireAdminSessionApi()
    if (auth instanceof NextResponse) return auth

    const supabase = await createClient()

    const [pingRes, fiscalRes] = await Promise.all([
      supabase.from('lojas').select('id').limit(1),
      supabase
        .from('documentos_fiscais_pendentes')
        .select('status')
        .in('status', ['PENDENTE', 'ERRO'])
        .is('deleted_at', null),
    ])

    const latency = Date.now() - t0
    const fiscalRows = fiscalRes.data ?? []
    const fiscal_erro  = fiscalRows.filter((r) => r.status === 'ERRO').length
    const fiscal_fila  = fiscalRows.filter((r) => r.status === 'PENDENTE').length

    if (pingRes.error) {
      return NextResponse.json({ status: 'degraded', latency, fiscal_erro, fiscal_fila } satisfies HealthPayload)
    }
    return NextResponse.json({ status: 'online', latency, fiscal_erro, fiscal_fila } satisfies HealthPayload)
  } catch {
    return NextResponse.json({ status: 'offline', latency: Date.now() - t0, fiscal_erro: 0, fiscal_fila: 0 } satisfies HealthPayload)
  }
}
