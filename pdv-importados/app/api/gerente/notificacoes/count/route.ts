import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdminSessionApi } from '@/lib/admin/auth/requireAdminSessionApi'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Conta produtos ativos com estoque abaixo do mínimo.
 * Requer sessão admin (GERENTE, DONO ou ADMIN).
 */
export async function GET() {
  try {
    const auth = await requireAdminSessionApi('api:gerente:notificacoes:count')
    if (auth instanceof NextResponse) return auth

    const supabase = await createClient()

    const { data } = await supabase.from('v_estoque_baixo').select('id')

    const count = (data ?? []).length

    return NextResponse.json({ count })
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
