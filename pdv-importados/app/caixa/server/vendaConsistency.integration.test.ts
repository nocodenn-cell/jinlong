// Achado do gate de revisão pós-CI (PR #363, comentário Codex + investigação
// própria): este arquivo, mesmo corrigido (nome do arquivo, nomes de tabela,
// AUTO_ENQUEUE_FISCAL_ON_SALE), NÃO EXECUTA sob `vitest.integration.config.ts`
// quando chama `finalizarVendaCaixaImpl` — essa função (e as que ela chama:
// `getUsuarioIdioma`, `getLojaIdUsuario` etc.) usa `createClient()` de
// `@/lib/supabase/server`, que chama `cookies()` do Next.js — uma API que só
// existe dentro de um request scope real do App Router. Fora dele, toda
// chamada falha com `cookies was called outside a request scope` antes de
// qualquer lógica de negócio rodar — comprovado ao rodar este arquivo (antes
// desta reescrita) com as dependências instaladas: as 4 suítes falhavam
// nesse erro, não nas asserções.
//
// `finalizarVendaCaixaImpl` (a camada TS: validação, resolução de
// idioma/loja, mapeamento de erro) já tem cobertura própria via mocks em
// `finalizarVendaCaixa.integration.test.ts`. O que faltava — e é o propósito
// original deste arquivo, "Consistência de Vendas" — é provar a RPC
// `finalizar_venda_transacional_canonica_v4` contra um Postgres real:
// atomicidade de itens/estoque/pagamento, rollback em falta de estoque,
// exatamente um vencedor sob concorrência real. Reescrito para chamar a RPC
// diretamente via `@supabase/supabase-js` (service_role — mesmo papel usado
// pelas suítes SQL deste gate), sem depender de `cookies()`/Next.js request
// scope. Não duplica os testes SQL deste gate (que provam idempotência de
// retry) nem os mocks de `finalizarVendaCaixa.integration.test.ts` (que
// provam a camada TS) — prova a terceira coisa que nenhum dos dois cobre:
// o contrato de retorno e a atomicidade da RPC contra dados reais.

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const LOJA_MATRIZ = 'a0000001-0000-4000-8000-000000000001'

type RpcRow = {
  venda_id: string
  status: string
  mensagem: string | null
  dados_fiscais: { documento_fiscal_id: string; status: string; tipo_doc: string } | null
  itens_atualizados: unknown
  estoque_baixado: unknown
  event_id: string
  contas_receber_id: string | null
}

/** Chama a RPC canônica direto, com o mesmo payload que caixaVendas.impl.ts monta. */
async function finalizarVenda(
  supabase: SupabaseClient,
  params: {
    vendaId: string
    caixaId: string
    operadorId: string
    lojaId: string
    totalBruto: number
    totalDesconto: number
    totalLiquido: number
    itens: Array<{ produtoId: string; quantidade: number; precoOriginal: number; precoUnitario: number; tipoPreco: 'VAREJO' | 'MANUAL' }>
  },
) {
  return supabase.rpc('finalizar_venda_transacional_canonica_v4', {
    p_venda_id: params.vendaId,
    p_caixa_id: params.caixaId,
    p_operador_id: params.operadorId,
    p_loja_id: params.lojaId,
    p_forma_pagamento: 'DINHEIRO',
    p_total_bruto: params.totalBruto,
    p_total_desconto: params.totalDesconto,
    p_total_liquido: params.totalLiquido,
    p_pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: params.totalLiquido }],
    p_itens: params.itens.map((i) => ({
      item_id: randomUUID(),
      produto_id: i.produtoId,
      quantidade: i.quantidade,
      preco_original: i.precoOriginal,
      preco_unitario: i.precoUnitario,
      tipo_preco: i.tipoPreco,
    })),
    p_fiscal_auto_enqueue: true,
  })
}

describe.skipIf(!SERVICE_ROLE_KEY)('Consistência de Vendas - PDV (RPC real, Postgres local)', () => {
  let supabase: SupabaseClient
  let operadorId: string
  let caixaId: string

  beforeAll(async () => {
    if (!SERVICE_ROLE_KEY) return
    supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

    // usuarios.id referencia auth.users.id — precisa de um auth user real
    // primeiro (não um uuid arbitrário). Um novo por execução: mais simples
    // e seguro que reconciliar um id fixo com a API admin do GoTrue.
    const email = `venda-consistency-${randomUUID()}@example.invalid`
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      password: randomUUID(),
    })
    if (authErr || !authUser?.user) throw new Error(`setup auth.users: ${authErr?.message}`)
    operadorId = authUser.user.id

    const { error: usrErr } = await supabase
      .from('usuarios')
      .upsert(
        { id: operadorId, nome: 'VendaConsistency Operador', perfil: 'OPERADOR', ativo: true, loja_id: LOJA_MATRIZ },
        { onConflict: 'id' },
      )
    if (usrErr) throw new Error(`setup usuario: ${usrErr.message}`)
  })

  // Caixa é recriado por teste (não por suíte) via abrirCaixa(), chamado no
  // início de cada `it`.

  afterEach(async () => {
    if (!SERVICE_ROLE_KEY) return
    if (caixaId) {
      await supabase.from('caixas').update({ status: 'FECHADO' }).eq('id', caixaId)
    }
  })

  async function abrirCaixa() {
    const { data, error } = await supabase
      .from('caixas')
      .insert({ operador_id: operadorId, status: 'ABERTO', data_abertura: new Date().toISOString(), valor_inicial: 1000, loja_id: LOJA_MATRIZ })
      .select('id')
      .single()
    if (error || !data) throw new Error(`abrir caixa: ${error?.message}`)
    caixaId = data.id
    return data.id as string
  }

  async function criarProduto(nome: string, precoVarejo: number, quantidadeEstoque: number) {
    const { data: produto, error: pErr } = await supabase
      .from('produtos')
      .insert({ nome, preco_varejo: precoVarejo, origem: 'brasil_sem_nf', tem_nf: false, loja_id: LOJA_MATRIZ })
      .select('id')
      .single()
    if (pErr || !produto) throw new Error(`criar produto: ${pErr?.message}`)
    const { error: eErr } = await supabase
      .from('estoque')
      .insert({ produto_id: produto.id, loja_id: LOJA_MATRIZ, quantidade_atual: quantidadeEstoque, estoque_minimo: 0 })
    if (eErr) throw new Error(`criar estoque: ${eErr.message}`)
    return produto.id as string
  }

  it('deve finalizar venda com consistência atômica', async () => {
    const caixa = await abrirCaixa()
    const produtoId = await criarProduto('Produto venda atômica', 500, 100)
    const vendaId = randomUUID()

    const { data, error } = await finalizarVenda(supabase, {
      vendaId,
      caixaId: caixa,
      operadorId,
      lojaId: LOJA_MATRIZ,
      totalBruto: 1000,
      totalDesconto: 0,
      totalLiquido: 1000,
      itens: [{ produtoId, quantidade: 2, precoOriginal: 500, precoUnitario: 500, tipoPreco: 'VAREJO' }],
    })
    expect(error).toBeNull()
    const row = (Array.isArray(data) ? data[0] : data) as RpcRow | undefined
    expect(row?.status).toBe('CONCLUIDA')

    const { data: venda } = await supabase.from('vendas').select('*').eq('id', vendaId).single()
    expect(venda).toBeTruthy()
    expect(venda?.status).toBe('CONCLUIDA')

    const { data: itens } = await supabase.from('itens_venda').select('*').eq('venda_id', vendaId)
    expect(itens).toHaveLength(1)

    const { data: fiscal } = await supabase
      .from('documentos_fiscais_pendentes')
      .select('*')
      .eq('venda_id', vendaId)
      .maybeSingle()
    expect(fiscal).toBeTruthy()
    expect(fiscal?.status).toBe('PENDENTE')

    // Contrato de retorno da RPC (achado Codex): dados_fiscais usa a chave
    // `documento_fiscal_id`, não `documento_id`; itens_atualizados e
    // estoque_baixado são sempre NULL — nenhum caminho de código no corpo
    // da RPC os preenche. Afirmar isso documenta o contrato real; afirmar
    // truthy/length testaria uma premissa falsa.
    expect(row?.dados_fiscais).toBeTruthy()
    expect(row?.dados_fiscais).toHaveProperty('documento_fiscal_id')
    expect(row?.dados_fiscais).toHaveProperty('status')
    expect(row?.itens_atualizados).toBeNull()
    expect(row?.estoque_baixado).toBeNull()
  })

  it('deve falhar de forma atômica se estoque insuficiente', async () => {
    const caixa = await abrirCaixa()
    const produtoId = await criarProduto('Produto estoque zero', 500, 0)
    const vendaId = randomUUID()

    const { error } = await finalizarVenda(supabase, {
      vendaId,
      caixaId: caixa,
      operadorId,
      lojaId: LOJA_MATRIZ,
      totalBruto: 500,
      totalDesconto: 0,
      totalLiquido: 500,
      itens: [{ produtoId, quantidade: 1, precoOriginal: 500, precoUnitario: 500, tipoPreco: 'VAREJO' }],
    })
    expect(error).toBeTruthy()
    expect(error?.message).toContain('FINALIZAR_VENDA_CANONICA_ESTOQUE')

    const { data: venda } = await supabase.from('vendas').select('id').eq('id', vendaId).maybeSingle()
    expect(venda).toBeNull() // transação inteira desfeita — nem o cabeçalho da venda persiste

    const { data: itens } = await supabase.from('itens_venda').select('id').eq('venda_id', vendaId)
    expect(itens ?? []).toHaveLength(0)
  })

  it('deve manter consistência em concorrência (exatamente um vencedor)', async () => {
    const caixa = await abrirCaixa()
    const produtoId = await criarProduto('Produto concorrência', 100, 1)
    const vendaIdA = randomUUID()
    const vendaIdB = randomUUID()

    const payload = {
      caixaId: caixa,
      operadorId,
      lojaId: LOJA_MATRIZ,
      totalBruto: 100,
      totalDesconto: 0,
      totalLiquido: 100,
      itens: [{ produtoId, quantidade: 1, precoOriginal: 100, precoUnitario: 100, tipoPreco: 'VAREJO' as const }],
    }

    const [r1, r2] = await Promise.all([
      finalizarVenda(supabase, { ...payload, vendaId: vendaIdA }),
      finalizarVenda(supabase, { ...payload, vendaId: vendaIdB }),
    ])

    const sucessos = [r1, r2].filter((r) => !r.error).length
    const falhas = [r1, r2].filter((r) => r.error).length
    expect(sucessos).toBe(1)
    expect(falhas).toBe(1)

    const { data: estoque } = await supabase
      .from('estoque')
      .select('quantidade_atual')
      .eq('produto_id', produtoId)
      .eq('loja_id', LOJA_MATRIZ)
      .single()
    expect(estoque?.quantidade_atual).toBe(0)
  })
})
