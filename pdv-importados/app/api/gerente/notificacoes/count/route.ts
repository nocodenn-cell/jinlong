import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Conta produtos ativos com estoque abaixo do mínimo.
 * Requer sessão autenticada com perfil GERENTE, DONO ou ADMIN.
 * Comparação coluna-a-coluna feita no cliente JS (evita migração de função no banco).
 * Para catálogos maiores que ~5 000 produtos, adicionar view indexada no banco.
 */
export async function GET() {
  try {
    const supabase = await createClient()

    // ── Autenticação ──────────────────────────────────────────────
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Autorização: apenas painel gerencial ──────────────────────
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('perfil')
      .eq('id', user.id)
      .single()

    if (!usuario || !isPerfilPainelGerencial(usuario.perfil)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // ── Lógica de negócio ─────────────────────────────────────────
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
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
