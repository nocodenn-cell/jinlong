import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { test, expect } from '@playwright/test'
import { assertFase5bGoldenFlowEnvInCi, caixaOperadorEmail, hasFase5bGoldenFlowEnv } from './helpers/env'
import { round2 } from './helpers/caixaPagamento'

// Teste E2E (API, sem browser) para `finalizar_venda_transacional_canonica_v4`:
// validações de saldo pendente (pagamentos < total).
//
// T4 (auditoria Jinlong 2026-09-27): este arquivo testava a criação
// automática de `contas_receber` quando a venda tinha `cliente_id` e saldo
// pendente > 0 — um fiado informal que sobrevivia mesmo com o módulo fiado
// formalmente removido do PDV (migration 246). Era possível finalizar uma
// venda com pagamento menor que o total sempre que houvesse um cliente
// vinculado (por qualquer motivo, não necessariamente crédito), e um bug no
// caixa (Recebido desatualizado, corrigido em `useCaixaPagamentos.ts`) fazia
// isso acontecer por engano, sem o operador perceber. A migration
// `20260927120000_t4_bloqueia_pagamento_parcial_finalizar_venda.sql` fechou
// essa porta: saldo pendente > 0 agora rejeita SEMPRE, com ou sem
// cliente_id — `FINALIZAR_VENDA_CANONICA_PAGAMENTOS_INSUFICIENTES`. Os testes
// abaixo foram reescritos para validar o novo contrato. O subsistema de
// contas_receber em si (tabelas, telas, RPC de baixa) não foi tocado — a
// remoção completa é a Fase 5 de `Jinlong/decisoes/REMOVER_MODULO_FIADO.md`,
// fora do escopo desta correção.
//
// Histórico: este arquivo nunca rodou de fato antes de 2026-09 — `supabase`/
// `vendaId`/`clienteId`/etc. eram declarados e nunca inicializados
// (TypeError: Cannot read properties of undefined (reading 'rpc')), e os
// itens usavam `produto_id: 'prod-1'` — não é um uuid válido. Corrigido com
// fixtures reais via service_role (mesmo padrão de
// `caixa-fase5b-golden-flow-ui.spec.ts`), preço real do produto (para não
// colidir com a âncora de preço de catálogo) e dois clientes distintos.

test.describe('finalizar_venda_transacional_canonica_v4: saldo pendente sempre rejeita (RPC)', () => {
  test.skip(
    !hasFase5bGoldenFlowEnv(),
    'Requer PLAYWRIGHT_CAIXA_TEST_EMAIL/PASSWORD + SUPABASE_SERVICE_ROLE_KEY (ver docs/SEED_DEV_E2E.md).',
  )

  test.beforeAll(() => {
    assertFase5bGoldenFlowEnvInCi()
  })

  let supabase: SupabaseClient
  let operadorId: string
  let lojaId: string
  let caixaId: string
  let produtoId: string
  let precoUnitario: number
  let clienteId: string // cliente válido, MESMA loja do caixa/venda
  let clienteOutraLojaId: string // cliente de OUTRA loja — só para o teste V8 (RLS)

  test.beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim()
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
    supabase = createClient(url, serviceRole)

    const email = caixaOperadorEmail()
    const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    })
    if (authErr) throw new Error(`Fixture ausente: admin.listUsers falhou (${authErr.message})`)
    const user = authUsers.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (!user) {
      throw new Error(
        `Fixture ausente: operador ${email} não existe no Auth local (rode scripts/seed-dev-users.mjs).`,
      )
    }
    operadorId = user.id

    const { data: usuarioRow, error: usuarioErr } = await supabase
      .from('usuarios')
      .select('loja_id')
      .eq('id', operadorId)
      .maybeSingle()
    if (usuarioErr || !usuarioRow?.loja_id) {
      throw new Error(
        `Fixture ausente: usuarios.loja_id para ${operadorId} (${usuarioErr?.message ?? 'sem linha'}).`,
      )
    }
    lojaId = String(usuarioRow.loja_id)

    // Caixa ABERTO real: este spec é API-only (sem `page`), então não passa por
    // `ensureCaixaAberto` (fluxo de UI). Reaproveita um caixa já aberto do
    // operador se outro spec deixou um; senão abre um direto via service_role
    // (bypassa RLS — legítimo aqui, é o mesmo papel que a Edge/RPC usa).
    const { data: caixaAberto, error: caixaSelectErr } = await supabase
      .from('caixas')
      .select('id')
      .eq('operador_id', operadorId)
      .eq('status', 'ABERTO')
      .maybeSingle()
    if (caixaSelectErr) {
      throw new Error(`Fixture ausente: select caixas (${caixaSelectErr.message}).`)
    }
    if (caixaAberto?.id) {
      caixaId = String(caixaAberto.id)
    } else {
      const { data: novoCaixa, error: caixaErr } = await supabase
        .from('caixas')
        .insert({ operador_id: operadorId, loja_id: lojaId, valor_inicial: 100, status: 'ABERTO' })
        .select('id')
        .single()
      if (caixaErr || !novoCaixa) {
        throw new Error(`Fixture ausente: não foi possível abrir caixa (${caixaErr?.message}).`)
      }
      caixaId = String(novoCaixa.id)
    }

    // Produto real e ativo da própria loja, com preço de tabela lido do banco —
    // usar o preço real evita esbarrar em `internal.validar_precos_venda`
    // (âncora de preço de catálogo), que um valor hardcoded arbitrário violaria.
    const { data: produtoRow, error: produtoErr } = await supabase
      .from('produtos')
      .select('id, preco_varejo')
      .eq('loja_id', lojaId)
      .eq('ativo', true)
      .limit(1)
      .maybeSingle()
    if (produtoErr || !produtoRow?.id) {
      throw new Error(
        `Fixture ausente: nenhum produto ativo na loja ${lojaId} (${produtoErr?.message ?? 'sem linha'}).`,
      )
    }
    produtoId = String(produtoRow.id)
    precoUnitario = Number(produtoRow.preco_varejo)

    const sufixo = Date.now()
    const { data: clienteRow, error: clienteErr } = await supabase
      .from('clientes')
      .insert({
        nome: `E2E Fase5b RPC ${sufixo}`,
        documento: `8${String(sufixo).slice(-10)}`,
        loja_id: lojaId,
        ativo: true,
        tipo: 'PF',
        limite_credito: 9999,
      })
      .select('id')
      .single()
    if (clienteErr || !clienteRow) {
      throw new Error(`Fixture ausente: insert cliente (${clienteErr?.message}).`)
    }
    clienteId = String(clienteRow.id)

    // Segunda loja + cliente vinculado a ela, exclusivamente para o teste V8
    // (cliente existe mas pertence a loja diferente da venda).
    const { data: outraLoja, error: outraLojaErr } = await supabase
      .from('lojas')
      .insert({ nome: `E2E Fase5b Outra Loja ${sufixo}`, codigo: `E2E${sufixo}` })
      .select('id')
      .single()
    if (outraLojaErr || !outraLoja) {
      throw new Error(`Fixture ausente: insert loja secundária (${outraLojaErr?.message}).`)
    }

    const { data: clienteOutraLoja, error: clienteOutraLojaErr } = await supabase
      .from('clientes')
      .insert({
        nome: `E2E Fase5b Outra Loja Cliente ${sufixo}`,
        documento: `7${String(sufixo).slice(-10)}`,
        loja_id: outraLoja.id,
        ativo: true,
        tipo: 'PF',
        limite_credito: 9999,
      })
      .select('id')
      .single()
    if (clienteOutraLojaErr || !clienteOutraLoja) {
      throw new Error(`Fixture ausente: insert cliente de outra loja (${clienteOutraLojaErr?.message}).`)
    }
    clienteOutraLojaId = String(clienteOutraLoja.id)
  })

  function itemPadrao() {
    return {
      item_id: crypto.randomUUID(),
      produto_id: produtoId,
      quantidade: 1,
      preco_original: precoUnitario,
      preco_unitario: precoUnitario,
      desconto_unitario: 0,
      tipo_preco: 'VAREJO',
    }
  }

  function chamarRpc(overrides: {
    p_venda_id: string
    p_pagamentos: Array<{ forma_pagamento: string; valor: number }>
    p_cliente_id: string | null
    /**
     * Um retry IDEMPOTENTE precisa reenviar o item_id EXATAMENTE igual: a RPC
     * detecta retry por `ON CONFLICT (id) DO NOTHING` em `itens_venda`
     * (chave = item_id), não por venda_id sozinho. Gerar um item_id novo a
     * cada chamada (como este helper fazia antes) faz a 2ª chamada inserir um
     * SEGUNDO item na mesma venda em vez de reconhecer o retry — foi assim que
     * o teste 03 quebrou (contas_receber_id diferente entre as duas
     * chamadas). Passe o MESMO array de itens nas duas chamadas para testar
     * idempotência de verdade.
     */
    p_itens?: Array<ReturnType<typeof itemPadrao>>
  }) {
    // A versão vigente de `finalizar_venda_transacional_canonica_v4` (live no
    // banco, diferente da versão mais antiga documentada em
    // `20260710212320_24702_...sql`) EXIGE p_total_bruto/p_total_desconto/
    // p_total_liquido não-nulos e batendo exatamente com
    // `internal.calcular_totais_venda(p_itens, ...)` — omiti-los levanta
    // FINALIZAR_VENDA_CANONICA_TOTAIS_DIVERGENTES (comprovado via psql direto,
    // sem PostgREST/JS no meio). Sem desconto por item nem desconto de
    // gerente, bruto = líquido = precoUnitario e desconto = 0.
    return supabase.rpc('finalizar_venda_transacional_canonica_v4', {
      p_venda_id: overrides.p_venda_id,
      p_caixa_id: caixaId,
      p_operador_id: operadorId,
      p_loja_id: lojaId,
      p_total_bruto: precoUnitario,
      p_total_desconto: 0,
      p_total_liquido: precoUnitario,
      p_pagamentos: overrides.p_pagamentos,
      p_cliente_id: overrides.p_cliente_id,
      p_itens: overrides.p_itens ?? [itemPadrao()],
    })
  }

  test('01. Pagamento parcial sem cliente_id é rejeitado', async () => {
    const vendaId = crypto.randomUUID()
    const { data, error } = await chamarRpc({
      p_venda_id: vendaId,
      p_pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: round2(precoUnitario * 0.5) }],
      p_cliente_id: null,
    })

    expect(error?.message).toContain('PAGAMENTOS_INSUFICIENTES')
    expect(data).toBeNull()

    const { data: venda } = await supabase.from('vendas').select('id').eq('id', vendaId).maybeSingle()
    expect(venda).toBeNull()
  })

  test('02. Pagamento parcial COM cliente_id também é rejeitado (fiado removido — T4)', async () => {
    // Antes de T4: cliente válido (mesma loja) bastava para a RPC aceitar o
    // pagamento parcial e criar contas_receber — era o "fiado informal" que
    // o bug do caixa disparava sem o operador perceber. Agora rejeita antes
    // de sequer olhar para cliente_id, então o caminho de RLS
    // (CLIENTE_LOJA_INVALIDO, cliente de outra loja) fica inalcançável por
    // aqui: qualquer pagamento parcial já rejeita primeiro.
    const vendaId = crypto.randomUUID()
    const { data, error } = await chamarRpc({
      p_venda_id: vendaId,
      p_pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: round2(precoUnitario * 0.6) }],
      p_cliente_id: clienteId,
    })

    expect(error?.message).toContain('PAGAMENTOS_INSUFICIENTES')
    expect(data).toBeNull()

    const { data: venda } = await supabase.from('vendas').select('id').eq('id', vendaId).maybeSingle()
    expect(venda).toBeNull()
    const { data: crs } = await supabase.from('contas_receber').select('id').eq('venda_id', vendaId)
    expect(crs?.length ?? 0).toBe(0)
  })

  test('02b. Pagamento parcial com cliente de outra loja também é rejeitado', async () => {
    // clienteOutraLojaId existe só para este cenário (era o teste "V8 RLS"):
    // com o pagamento parcial já bloqueado por si só, o resultado é o mesmo
    // erro de saldo insuficiente, não mais um erro de RLS/loja.
    const { data, error } = await chamarRpc({
      p_venda_id: crypto.randomUUID(),
      p_pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: round2(precoUnitario * 0.5) }],
      p_cliente_id: clienteOutraLojaId,
    })

    expect(error?.message).toContain('PAGAMENTOS_INSUFICIENTES')
    expect(data).toBeNull()
  })

  test('03. Retry de venda rejeitada não persiste nada e permanece rejeitando', async () => {
    // Idempotência do caminho de ERRO: como a exceção acontece antes de
    // qualquer INSERT (vendas/itens_venda/estoque/contas_receber), repetir a
    // mesma venda_id depois de uma rejeição não "destrava" nada nem deixa
    // resíduo — cada tentativa é avaliada do zero.
    const vendaId = crypto.randomUUID()
    const pagamentos = [{ forma_pagamento: 'DINHEIRO', valor: round2(precoUnitario * 0.5) }]
    const itens = [itemPadrao()]

    const { error: error1 } = await chamarRpc({
      p_venda_id: vendaId,
      p_pagamentos: pagamentos,
      p_cliente_id: clienteId,
      p_itens: itens,
    })
    expect(error1?.message).toContain('PAGAMENTOS_INSUFICIENTES')

    const { error: error2 } = await chamarRpc({
      p_venda_id: vendaId,
      p_pagamentos: pagamentos,
      p_cliente_id: clienteId,
      p_itens: itens,
    })
    expect(error2?.message).toContain('PAGAMENTOS_INSUFICIENTES')

    const { data: venda } = await supabase.from('vendas').select('id').eq('id', vendaId).maybeSingle()
    expect(venda).toBeNull()
    const { data: crs } = await supabase.from('contas_receber').select('id').eq('venda_id', vendaId)
    expect(crs?.length ?? 0).toBe(0)
  })

  test('04. Validação 2ª Linha: Saldo divergente rejeita', async () => {
    // Requer simular uma corrida (saldo muda entre pré-transação e dentro da
    // transação) com duas conexões concorrentes — não reproduzível de forma
    // determinística com uma única chamada RPC. Mantido como pendência
    // conhecida, documentada aqui (não é uma alegação de teste passando).
    test.skip(true, 'Requer simulação de corrida com 2 conexões concorrentes — não implementado ainda.')
  })

  test('05. Happy path: pagamento dividido somando exatamente o total é aceito e não cria contas_receber', async () => {
    const vendaId = crypto.randomUUID()
    const metade = round2(precoUnitario / 2)
    const resto = round2(precoUnitario - metade)

    const { data, error } = await chamarRpc({
      p_venda_id: vendaId,
      p_pagamentos: [
        { forma_pagamento: 'DINHEIRO', valor: metade },
        { forma_pagamento: 'PIX', valor: resto },
      ],
      p_cliente_id: null,
    })

    expect(error).toBeNull()
    expect(data?.[0]?.status).toBe('CONCLUIDA')
    expect(data?.[0]?.contas_receber_id).toBeNull()

    const { data: venda, error: vendaErr } = await supabase
      .from('vendas')
      .select('status, total_liquido')
      .eq('id', vendaId)
      .single()

    expect(vendaErr).toBeNull()
    expect(venda?.status).toBe('CONCLUIDA')
    expect(round2(Number(venda?.total_liquido))).toBe(precoUnitario)

    const { data: pagamentos, error: pagErr } = await supabase
      .from('vendas_pagamentos')
      .select('valor')
      .eq('venda_id', vendaId)

    expect(pagErr).toBeNull()
    const totalPago = pagamentos?.reduce((s: number, p: { valor: number }) => s + Number(p.valor), 0) ?? 0
    expect(round2(totalPago)).toBe(precoUnitario)

    const { data: crs } = await supabase.from('contas_receber').select('id').eq('venda_id', vendaId)
    expect(crs?.length ?? 0).toBe(0)
  })

  test('06. Validação: Pagamento 100% NÃO cria contas_receber', async () => {
    const { data, error } = await chamarRpc({
      p_venda_id: crypto.randomUUID(),
      p_pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: precoUnitario }],
      p_cliente_id: null, // não precisa de cliente se o pagamento é 100%
    })

    expect(error).toBeNull()
    expect(data?.[0]?.status).toBe('CONCLUIDA')
    expect(data?.[0]?.contas_receber_id).toBeNull()
  })
})
