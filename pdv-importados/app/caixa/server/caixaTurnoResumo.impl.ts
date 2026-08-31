import { createClient } from '@/lib/supabase/server'
import { mensagemErroComSecao, mensagemErroDeExcecao } from '@/lib/errors/mensagemErroUsuario'
import { idiomaOperadorParaErro } from '@/app/caixa/server/caixaErroOperador'
import { caixaMsgOperador, caixaMsgServidor } from '@/app/caixa/server/caixaMensagensServidor'

export type TurnoResumoResult =
  | {
      ok: true
      quantidadeVendas: number
      totalRecebido: number  // ✅ NOVO (Fase 6): Valor efetivamente recebido em caixa
      totalAReceber: number  // ✅ NOVO (Fase 6): Valor em crédito (contas_receber)
      caixaId: string
    }
  | { ok: false; error: string }

export async function obterResumoVendasTurnoImpl(): Promise<TurnoResumoResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: await caixaMsgOperador( 'err_srv_sessao_curta') }
    const idioma = await idiomaOperadorParaErro()

    const { data: caixa, error: caixaErr } = await supabase
      .from('caixas')
      .select('id')
      .eq('operador_id', user.id)
      .eq('status', 'ABERTO')
      .order('data_abertura', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (caixaErr) return { ok: false, error: mensagemErroComSecao('Caixa', caixaErr.message, idioma) }
    if (!caixa) return { ok: true, quantidadeVendas: 0, totalRecebido: 0, totalAReceber: 0, caixaId: '' }

    // ✅ FASE 6: Reconciliação corrigida para pagamento parcial
    // 1. Obter vendas concluídas
    const { data: vendas, error: vendasErr } = await supabase
      .from('vendas')
      .select('id')
      .eq('caixa_id', caixa.id)
      .eq('status', 'CONCLUIDA')

    if (vendasErr) return { ok: false, error: mensagemErroComSecao('Vendas', vendasErr.message, idioma) }

    if (!vendas || vendas.length === 0) {
      return { ok: true, quantidadeVendas: 0, totalRecebido: 0, totalAReceber: 0, caixaId: caixa.id }
    }

    const vendaIds = vendas.map((v) => v.id)

    // 2. Somar pagamentos recebidos (verdadeiro valor em caixa)
    const { data: pagamentos, error: pagErr } = await supabase
      .from('vendas_pagamentos')
      .select('valor')
      .in('venda_id', vendaIds)

    if (pagErr) return { ok: false, error: mensagemErroComSecao('Pagamentos', pagErr.message, idioma) }

    const totalRecebido = (pagamentos ?? []).reduce((sum, p) => sum + Number(p.valor ?? 0), 0)

    // 3. Somar títulos em aberto (contas_receber)
    const { data: contasReceber, error: crErr } = await supabase
      .from('contas_receber')
      .select('valor_aberto')
      .in('venda_id', vendaIds)
      .eq('status', 'ABERTO')

    if (crErr) return { ok: false, error: mensagemErroComSecao('Contas a Receber', crErr.message, idioma) }

    const totalAReceber = (contasReceber ?? []).reduce((sum, cr) => sum + Number(cr.valor_aberto ?? 0), 0)

    return {
      ok: true,
      quantidadeVendas: vendas.length,
      totalRecebido,
      totalAReceber,
      caixaId: caixa.id,
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, caixaMsgServidor(await idiomaOperadorParaErro(), 'err_srv_resumo_turno'), await idiomaOperadorParaErro()),
    }
  }
}
