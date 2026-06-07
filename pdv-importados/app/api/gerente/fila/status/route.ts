import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdminSessionApi } from '@/lib/admin/auth/requireAdminSessionApi'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export type FilaStatusPayload = {
  fiscal: { pendente: number; erro: number }
  aprovacoes: number
}

export async function GET() {
  try {
    const auth = await requireAdminSessionApi()
    if (auth instanceof NextResponse) return auth

    const supabase = await createClient()

    const [fiscalRes, aprovRes] = await Promise.all([
      supabase
        .from('documentos_fiscais_pendentes')
        .select('status')
        .in('status', ['PENDENTE', 'ERRO'])
        .is('deleted_at', null),
      supabase
        .from('movimentacoes_caixa')
        .select('id')
        .eq('status', 'pendente')
        .is('deleted_at', null),
    ])

    const fiscalRows = fiscalRes.data ?? []
    const pendente = fiscalRows.filter((r) => r.status === 'PENDENTE').length
    const erro     = fiscalRows.filter((r) => r.status === 'ERRO').length
    const aprovacoes = (aprovRes.data ?? []).length

    return NextResponse.json({ fiscal: { pendente, erro }, aprovacoes } satisfies FilaStatusPayload)
  } catch {
    return NextResponse.json({ fiscal: { pendente: 0, erro: 0 }, aprovacoes: 0 } satisfies FilaStatusPayload)
  }
}
