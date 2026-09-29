/**
 * Contrato de integração — cancelar_venda_transacional (RPC).
 *
 * Cenário (estado imediatamente antes do cancelamento):
 *   estoque 10 | caixa R$ 500 | venda R$ 50 (1 un.)
 *
 * Após cancelar:
 *   estoque 11 | caixa R$ 450 | venda CANCELADA | devolução registrada
 *
 * Rodar (Supabase local + sessão autenticada gerente/dono):
 *   npm run test:integration:cancelamento
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { cancelarVendaImpl, finalizarVendaCaixaImpl } from './caixaVendas.impl'

const LOJA_MATRIZ = 'a0000001-0000-4000-8000-000000000001'
const SALDO_CAIXA_ANTES_VENDA = 450
const SALDO_CAIXA_APOS_VENDA = 500
const ESTOQUE_APOS_VENDA = 10
const ESTOQUE_APOS_CANCELAMENTO = 11
const VALOR_VENDA = 50

describe('Contrato RPC cancelar_venda_transacional', () => {
  let supabase: Awaited<ReturnType<typeof createClient>>
  let caixaId: string
  let operadorId: string
  let produtoId: string
  let vendaId: string | null = null
  let vendaCancelada = false

  beforeEach(async () => {
    supabase = await createClient()
    vendaId = null
    vendaCancelada = false

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado — rode seed:dev-users e faça login')
    operadorId = user.id

    const { data: caixa, error: ce } = await supabase
      .from('caixas')
      .insert({
        operador_id: user.id,
        status: 'ABERTO',
        data_abertura: new Date().toISOString(),
        valor_inicial: SALDO_CAIXA_ANTES_VENDA,
      })
      .select('id')
      .single()
    if (ce || !caixa?.id) throw new Error(ce?.message ?? 'Falha ao criar caixa de teste')
    caixaId = caixa.id

    // `saldo_atual` não é mais gravável por `authenticated` (migration
    // 20260814012644_protect_cash_balance_authority). A abertura acima já
    // deixa o contador em `valor_inicial` via trigger, que é exatamente o
    // SALDO_CAIXA_ANTES_VENDA esperado por este contrato.

    const { data: produto, error: pe } = await supabase
      .from('produtos')
      .insert({
        nome: 'Produto contrato cancelamento',
        preco_varejo: VALOR_VENDA,
        origem: 'brasil_sem_nf',
        tem_nf: false,
      })
      .select('id')
      .single()
    if (pe || !produto) throw new Error(pe?.message ?? 'insert produto')
    produtoId = produto.id

    await supabase.from('estoque').insert({
      produto_id: produtoId,
      loja_id: LOJA_MATRIZ,
      quantidade_atual: ESTOQUE_APOS_CANCELAMENTO,
      estoque_minimo: 0,
    })
  })

  afterEach(async () => {
    if (vendaId && !vendaCancelada) {
      await cancelarVendaImpl(vendaId, 'Test cleanup')
    }
    if (caixaId) {
      // Fecha pelo caminho canônico (persiste data/valor/diferença de fechamento).
      // Um `UPDATE caixas SET status='FECHADO'` direto deixaria um turno FECHADO
      // sem dados de fechamento, estado que o produto não produz.
      const { data: esperado } = await supabase.rpc('calcular_valor_sistema_dinheiro_caixa', {
        p_caixa_id: caixaId,
      })
      await supabase.rpc('fechar_caixa_atomico', {
        p_operador_id: operadorId,
        p_valor_contado: Number(esperado ?? 0),
        p_motivo: 'teardown de teste de integração',
      })
    }
  })

  it('restaura estoque, estorna caixa e registra devolução', async () => {
    const resultadoVenda = await finalizarVendaCaixaImpl({
      idempotencyKey: crypto.randomUUID(),
      formaPagamento: 'DINHEIRO',
      totalBruto: VALOR_VENDA,
      totalDesconto: 0,
      totalLiquido: VALOR_VENDA,
      pagamentos: [{ formaPagamento: 'DINHEIRO', valor: VALOR_VENDA }],
      itens: [
        {
          produtoId,
          quantidade: 1,
          precoOriginal: VALOR_VENDA,
          precoUnitario: VALOR_VENDA,
          tipoPreco: 'VAREJO',
        },
      ],
    })

    expect(resultadoVenda.ok).toBe(true)
    if (!resultadoVenda.ok) return
    vendaId = resultadoVenda.vendaId

    const { data: estoqueAntes } = await supabase
      .from('estoque')
      .select('quantidade_atual')
      .eq('produto_id', produtoId)
      .eq('loja_id', LOJA_MATRIZ)
      .single()
    expect(Number(estoqueAntes?.quantidade_atual)).toBe(ESTOQUE_APOS_VENDA)

    const { data: caixaAntes } = await supabase
      .from('caixas')
      .select('saldo_atual')
      .eq('id', caixaId)
      .single()
    expect(Number(caixaAntes?.saldo_atual)).toBe(SALDO_CAIXA_APOS_VENDA)

    const { data: vendaAntes } = await supabase
      .from('vendas')
      .select('status, total_liquido')
      .eq('id', vendaId)
      .single()
    expect(vendaAntes?.status).toBe('CONCLUIDA')
    expect(Number(vendaAntes?.total_liquido)).toBe(VALOR_VENDA)

    const cancelamento = await cancelarVendaImpl(vendaId, 'Contrato integração cancelamento')
    expect(cancelamento.ok).toBe(true)
    vendaCancelada = true

    const { data: vendaDepois } = await supabase
      .from('vendas')
      .select('status')
      .eq('id', vendaId)
      .single()
    expect(vendaDepois?.status).toBe('CANCELADA')

    const { data: estoqueDepois } = await supabase
      .from('estoque')
      .select('quantidade_atual')
      .eq('produto_id', produtoId)
      .eq('loja_id', LOJA_MATRIZ)
      .single()
    expect(Number(estoqueDepois?.quantidade_atual)).toBe(ESTOQUE_APOS_CANCELAMENTO)

    const { data: caixaDepois } = await supabase
      .from('caixas')
      .select('saldo_atual')
      .eq('id', caixaId)
      .single()
    expect(Number(caixaDepois?.saldo_atual)).toBe(SALDO_CAIXA_ANTES_VENDA)

    const { data: devolucoes } = await supabase
      .from('devolucoes')
      .select('valor, forma_pagamento')
      .eq('venda_id', vendaId)
    expect(devolucoes?.length).toBeGreaterThanOrEqual(1)
    const devolucaoDinheiro = devolucoes?.find((d) => d.forma_pagamento === 'DINHEIRO')
    expect(devolucaoDinheiro).toBeTruthy()
    expect(Number(devolucaoDinheiro?.valor)).toBe(VALOR_VENDA)

    const { data: reposicoes } = await supabase
      .from('estoque_reposicoes_cancelamento')
      .select('quantidade')
      .eq('venda_id', vendaId)
      .eq('produto_id', produtoId)
      .maybeSingle()
    expect(Number(reposicoes?.quantidade)).toBe(1)
  })
})
