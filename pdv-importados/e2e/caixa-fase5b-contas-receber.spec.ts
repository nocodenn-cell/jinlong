import { test, expect } from '@playwright/test'

/**
 * Scaffolding incompleto: importava `@/lib/supabase/server` e nunca inicializava o client.
 * Quarentena até haver fixture autenticada + seeds; cobertura unitária equivalente em
 * Reativar com fixture autenticada + seeds (RPC v4 parcial). Por ora evita falso-vermelho no CI.
 */
test.describe.skip('Fase 5b: Contas Receber Automático (quarantine — stub sem fixture)', () => {
  let supabase: any
  let vendaId: string
  let clienteId: string
  let caixaId: string
  let operadorId: string
  let lojaId: string

  test.beforeAll(async () => {
    // Setup inicial: criar cliente, caixa e vendedor para testes
    // Isso é preparação e pode usar seed/fixtures
  })

  test('01. Validação Pré-Transação V7: Saldo pendente exige cliente_id', async () => {
    // Cenário: Venda com pagamento parcial (50% do total)
    // Sem cliente informado → RPC deve retornar erro FINALIZAR_VENDA_CANONICA_SALDO_PENDENTE_EXIGE_CLIENTE

    const vendaComParcial = {
      p_venda_id: vendaId,
      p_caixa_id: caixaId,
      p_operador_id: operadorId,
      p_loja_id: lojaId,
      p_total_liquido: 100,
      p_pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: 50 }],
      p_cliente_id: null, // ❌ Sem cliente
      p_itens: [
        {
          item_id: crypto.randomUUID(),
          produto_id: 'prod-1',
          quantidade: 1,
          preco_original: 100,
          preco_unitario: 100,
          desconto_unitario: 0,
          tipo_preco: 'VAREJO',
        },
      ],
    }

    // A RPC v4 deve validar em V7 e rejeitar
    const { data, error } = await supabase.rpc('finalizar_venda_transacional_canonica_v4', vendaComParcial)

    expect(error?.message).toContain('SALDO_PENDENTE_EXIGE_CLIENTE')
    expect(data).toBeNull()
  })

  test('02. Validação Pré-Transação V8: Cliente RLS check', async () => {
    // Cenário: Cliente existe mas pertence a loja diferente
    // RPC deve rejeitar em V8 (RLS validation)

    const outraLoja = 'different-loja-uuid'
    const vendaComClienteOutraLoja = {
      p_venda_id: vendaId,
      p_caixa_id: caixaId,
      p_operador_id: operadorId,
      p_loja_id: lojaId,
      p_total_liquido: 100,
      p_pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: 50 }],
      p_cliente_id: clienteId, // Cliente válido
      // Mas operador tenta finalizar em loja diferente
      p_itens: [
        {
          item_id: crypto.randomUUID(),
          produto_id: 'prod-1',
          quantidade: 1,
          preco_original: 100,
          preco_unitario: 100,
          desconto_unitario: 0,
          tipo_preco: 'VAREJO',
        },
      ],
    }

    // Dependendo da implementação de RLS, pode rejeitar em V8
    // ou quando tentar inserir contas_receber (multi-tenant check)
    const { error } = await supabase.rpc('finalizar_venda_transacional_canonica_v4', vendaComClienteOutraLoja)

    if (error) {
      expect(error.message).toMatch(/RLS|permission|cliente|loja/i)
    }
  })

  test('03. Idempotência: Retry com mesma venda_id cria apenas 1 contas_receber', async () => {
    // Cenário: 2ª execução da mesma RPC com mesmo venda_id
    // ON CONFLICT (venda_id) DO UPDATE garante que não duplica

    const vendaComParcial = {
      p_venda_id: vendaId,
      p_caixa_id: caixaId,
      p_operador_id: operadorId,
      p_loja_id: lojaId,
      p_total_liquido: 100,
      p_pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: 50 }],
      p_cliente_id: clienteId,
      p_itens: [
        {
          item_id: crypto.randomUUID(),
          produto_id: 'prod-1',
          quantidade: 1,
          preco_original: 100,
          preco_unitario: 100,
          desconto_unitario: 0,
          tipo_preco: 'VAREJO',
        },
      ],
    }

    // 1ª execução
    const { data: data1, error: error1 } = await supabase.rpc('finalizar_venda_transacional_canonica_v4', vendaComParcial)
    expect(error1).toBeNull()
    expect(data1[0]?.contas_receber_id).toBeDefined()
    const crId1 = data1[0]?.contas_receber_id

    // 2ª execução (retry) com MESMO venda_id
    const { data: data2, error: error2 } = await supabase.rpc('finalizar_venda_transacional_canonica_v4', vendaComParcial)
    expect(error2).toBeNull()
    expect(data2[0]?.contas_receber_id).toBeDefined()
    const crId2 = data2[0]?.contas_receber_id

    // Deve ser o MESMO título (idempotência via ON CONFLICT)
    expect(crId1).toBe(crId2)

    // Verificar BD: apenas 1 contas_receber para venda_id
    const { data: crs, error: crErr } = await supabase
      .from('contas_receber')
      .select('id')
      .eq('venda_id', vendaId)

    expect(crErr).toBeNull()
    expect(crs?.length).toBe(1)
  })

  test('04. Validação 2ª Linha: Saldo divergente rejeita', async () => {
    // Cenário: Saldo mudou entre pré-transação e dentro-transação (race condition)
    // Exemplo: outro cliente pagou parte enquanto processando
    // RPC deve calcular saldo novamente e rejeitar se divergiu > 0.01

    // Este teste é complexo de simular sem injetar delays/races
    // Por enquanto, validamos que a validação existe no código
    // Em um teste de integração real, seria feito com threads paralelas

    // Manter como placeholder comentado:
    // TODO: Implementar teste de race condition real com promises paralelas
  })

  test('05. Happy Path: Pagamento parcial + cliente válido = contas_receber criado', async () => {
    // Cenário: Venda normal com pagamento parcial (60% de R$100 = R$60 no caixa, R$40 em crédito)

    const vendaHappyPath = {
      p_venda_id: vendaId,
      p_caixa_id: caixaId,
      p_operador_id: operadorId,
      p_loja_id: lojaId,
      p_total_liquido: 100,
      p_pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: 60 }],
      p_cliente_id: clienteId,
      p_itens: [
        {
          item_id: crypto.randomUUID(),
          produto_id: 'prod-1',
          quantidade: 1,
          preco_original: 100,
          preco_unitario: 100,
          desconto_unitario: 0,
          tipo_preco: 'VAREJO',
        },
      ],
    }

    const { data, error } = await supabase.rpc('finalizar_venda_transacional_canonica_v4', vendaHappyPath)

    // Sucesso
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
    expect(data[0]?.status).toBe('CONCLUIDA')
    expect(data[0]?.contas_receber_id).toBeDefined()

    const contasRecebeId = data[0]?.contas_receber_id

    // Validar contas_receber criado
    const { data: cr, error: crErr } = await supabase
      .from('contas_receber')
      .select('*')
      .eq('id', contasRecebeId)
      .single()

    expect(crErr).toBeNull()
    expect(cr).toBeDefined()
    expect(cr?.cliente_id).toBe(clienteId)
    expect(cr?.venda_id).toBe(vendaId)
    expect(cr?.valor_total).toBe(40) // Saldo pendente
    expect(cr?.valor_aberto).toBe(40)
    expect(cr?.status).toBe('ABERTO')

    // Validar venda está CONCLUIDA
    const { data: venda, error: vendaErr } = await supabase
      .from('vendas')
      .select('*')
      .eq('id', vendaId)
      .single()

    expect(vendaErr).toBeNull()
    expect(venda?.status).toBe('CONCLUIDA')
    expect(venda?.total_liquido).toBe(100)

    // Validar vendas_pagamentos: apenas R$60 registrado
    const { data: pagamentos, error: pagErr } = await supabase
      .from('vendas_pagamentos')
      .select('valor')
      .eq('venda_id', vendaId)

    expect(pagErr).toBeNull()
    expect(pagamentos?.length).toBeGreaterThan(0)
    const totalPago = pagamentos?.reduce((s: number, p: any) => s + p.valor, 0)
    expect(totalPago).toBe(60)
  })

  test('06. Validação: Pagamento 100% NÃO cria contas_receber', async () => {
    // Cenário: Se pagamento = 100%, contas_receber não deve ser criado

    const vendaPagamentoTotal = {
      p_venda_id: vendaId,
      p_caixa_id: caixaId,
      p_operador_id: operadorId,
      p_loja_id: lojaId,
      p_total_liquido: 100,
      p_pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: 100 }],
      p_cliente_id: null, // Não precisa de cliente se pagamento é 100%
      p_itens: [
        {
          item_id: crypto.randomUUID(),
          produto_id: 'prod-1',
          quantidade: 1,
          preco_original: 100,
          preco_unitario: 100,
          desconto_unitario: 0,
          tipo_preco: 'VAREJO',
        },
      ],
    }

    const { data, error } = await supabase.rpc('finalizar_venda_transacional_canonica_v4', vendaPagamentoTotal)

    expect(error).toBeNull()
    expect(data[0]?.status).toBe('CONCLUIDA')
    expect(data[0]?.contas_receber_id).toBeNull() // Sem contas_receber
  })
})
