/**
 * Contrato de integração — cancelar_venda_transacional (RPC).
 *
 * Cenário (estado imediatamente antes do cancelamento):
 *   estoque 10 | caixa R$ 500 | venda R$ 50 (1 un.)
 *
 * Após cancelar:
 *   estoque 11 | caixa R$ 450 | venda CANCELADA | devolução registrada
 *
 * Rodar (Supabase LOCAL; `supabase status -o env` exportado como SUPABASE_URL/ANON/SERVICE_ROLE):
 *   npm run test:integration:cancelamento
 *
 * O impl é server-only e lê `cookies()`/`headers()`; fora do Next não há request scope. O teste cria um
 * GERENTE sintético (e-mail único), faz login real no GoTrue local e injeta esse client como o
 * `createClient` do servidor. Sem env local: skip. Nunca aponta para host remoto.
 */
import { randomUUID } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

const estado = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => estado.client }))

import { cancelarVendaImpl, finalizarVendaCaixaImpl } from './caixaVendas.impl'

const URL_BASE = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const habilitado = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_BASE) && !!ANON && !!SERVICE

const LOJA_MATRIZ = 'a0000001-0000-4000-8000-000000000001'
const SALDO_CAIXA_ANTES_VENDA = 450
const SALDO_CAIXA_APOS_VENDA = 500
const ESTOQUE_APOS_VENDA = 10
const ESTOQUE_APOS_CANCELAMENTO = 11
const VALOR_VENDA = 50

describe.skipIf(!habilitado)('Contrato RPC cancelar_venda_transacional', () => {
  let supabase: SupabaseClient
  // Fixture de catálogo/estoque via service role: o app cria produto pela RPC criar_produto_com_estoque_inicial;
  // INSERT direto de `authenticated` em produtos é barrado pelo tenant_guard (fase 5), por desenho.
  let admin: SupabaseClient

  beforeAll(async () => {
    admin = createSupabaseClient(URL_BASE, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
    const email = `contrato-cancelamento.${randomUUID().slice(0, 8)}@integracao.test`
    const senha = `Int-${randomUUID()}`
    const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true })
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
    const ins = await admin.from('usuarios').insert({
      id: data.user.id, nome: 'Gerente contrato cancelamento', perfil: 'GERENTE', loja_id: LOJA_MATRIZ, ativo: true,
    })
    if (ins.error) throw new Error(`usuarios: ${ins.error.message}`)
    const c = createSupabaseClient(URL_BASE, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
    const login = await c.auth.signInWithPassword({ email, password: senha })
    if (login.error) throw new Error(`login: ${login.error.message}`)
    estado.client = c
  }, 30_000)
  let caixaId: string
  let operadorId: string
  let produtoId: string
  let vendaId: string | null = null
  let vendaCancelada = false

  beforeEach(async () => {
    supabase = estado.client as SupabaseClient
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
        loja_id: LOJA_MATRIZ,
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

    const { data: produto, error: pe } = await admin
      .from('produtos')
      .insert({
        nome: 'Produto contrato cancelamento',
        preco_varejo: VALOR_VENDA,
        origem: 'brasil_sem_nf',
        tem_nf: false,
        loja_id: LOJA_MATRIZ,
      })
      .select('id')
      .single()
    if (pe || !produto) throw new Error(pe?.message ?? 'insert produto')
    produtoId = produto.id

    const est = await admin.from('estoque').upsert({
      produto_id: produtoId,
      loja_id: LOJA_MATRIZ,
      quantidade_atual: ESTOQUE_APOS_CANCELAMENTO,
      estoque_minimo: 0,
    }, { onConflict: 'loja_id,produto_id' })
    if (est.error) throw new Error(`estoque: ${est.error.message}`)
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
