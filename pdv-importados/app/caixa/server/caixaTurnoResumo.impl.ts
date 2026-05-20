import { createClient } from '@/lib/supabase/server'
import { mensagemErroComSecao, mensagemErroDeExcecao } from '@/lib/errors/mensagemErroUsuario'

export type TurnoResumoResult =
  | { ok: true; quantidadeVendas: number; totalLiquido: number; caixaId: string }
  | { ok: false; error: string }

export async function obterResumoVendasTurnoImpl(): Promise<TurnoResumoResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada.' }

    const { data: caixa, error: caixaErr } = await supabase
      .from('caixas')
      .select('id')
      .eq('operador_id', user.id)
      .eq('status', 'ABERTO')
      .order('data_abertura', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (caixaErr) return { ok: false, error: mensagemErroComSecao('Caixa', caixaErr.message) }
    if (!caixa) return { ok: true, quantidadeVendas: 0, totalLiquido: 0, caixaId: '' }

    const { data: rows, error: vendasErr } = await supabase
      .from('vendas')
      .select('total_liquido')
      .eq('caixa_id', caixa.id)
      .eq('status', 'CONCLUIDA')

    if (vendasErr) return { ok: false, error: mensagemErroComSecao('Vendas', vendasErr.message) }

    const total = (rows ?? []).reduce((sum, r) => sum + Number(r.total_liquido ?? 0), 0)
    return { ok: true, quantidadeVendas: (rows ?? []).length, totalLiquido: total, caixaId: caixa.id }
  } catch (e) {
    return { ok: false, error: mensagemErroDeExcecao(e, 'Não foi possível carregar o resumo do turno.') }
  }
}
