import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * Conta produtos ativos com estoque abaixo do mínimo.
 * Comparação coluna-a-coluna feita no cliente JS (evita migração de função no banco).
 * Para catálogos maiores que ~5 000 produtos, adicionar view indexada no banco.
 */
export async function GET(req: Request) {
  const rl = rateLimit(req, { limit: 120, windowMs: 60_000 })
  if (!rl.ok) return NextResponse.json({ count: 0 }, { status: 429 })

  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('produtos')
      .select('quantidade_atual, estoque_minimo')
      .eq('ativo', true)
      .gt('estoque_minimo', 0)

    const count = (data ?? []).filter(
      (p) => Number(p.quantidade_atual) < Number(p.estoque_minimo),
    ).length

    return NextResponse.json({ count })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
