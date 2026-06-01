import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Conta produtos ativos com estoque abaixo do mínimo.
 * Requer sessão autenticada com perfil GERENTE, DONO ou ADMIN.
 * Usa a view v_estoque_baixo (p.ativo = true AND e.quantidade_atual <= e.estoque_minimo),
 * mesma definição da tela de relatórios. A comparação é feita no banco (RLS por loja via
 * security_invoker), evitando trazer o catálogo inteiro para o cliente.
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
    // v_estoque_baixo já aplica ativo = true e quantidade_atual <= estoque_minimo.
    const { data } = await supabase
      .from('v_estoque_baixo')
      .select('id')

    const count = (data ?? []).length

    return NextResponse.json({ count })
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
