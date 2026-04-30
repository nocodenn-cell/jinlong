import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { finalizarVendaCaixaImpl } from './caixaVendas.impl'
import { cancelarVendaImpl } from './caixaVendas.impl'

describe('Consistência de Vendas - PDV', () => {
  let supabase: Awaited<ReturnType<typeof createClient>>
  let vendaId: string
  let caixaId: string

  beforeEach(async () => {
    supabase = await createClient()
    // Setup: Criar caixa de teste
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { data: caixa } = await supabase
      .from('caixas')
      .insert({
        operador_id: user.id,
        status: 'ABERTO',
        data_abertura: new Date().toISOString(),
        valor_inicial: 1000,
      })
      .select('id')
      .single()
    
    caixaId = caixa.id
  })

  afterEach(async () => {
    // Cleanup: Cancelar venda se existir
    if (vendaId) {
      await cancelarVendaImpl(vendaId, 'Test cleanup')
    }
    
    // Cleanup: Fechar caixa
    if (caixaId) {
      await supabase
        .from('caixas')
        .update({ status: 'FECHADO' })
        .eq('id', caixaId)
    }
  })

  it('deve finalizar venda com consistência atômica', async () => {
    const vendaInput = {
      idempotencyKey: crypto.randomUUID(),
      formaPagamento: 'DINHEIRO',
      totalBruto: 1000,
      totalDesconto: 0,
      totalLiquido: 1000,
      pagamentos: [{
        formaPagamento: 'DINHEIRO',
        valor: 1000,
      }],
      itens: [{
        produtoId: 'test-produto-id',
        quantidade: 2,
      }],
    }

    const resultado = await finalizarVendaCaixaImpl(vendaInput)
    
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      vendaId = resultado.vendaId
      
      // Verificar se venda foi registrada
      const { data: venda } = await supabase
        .from('vendas')
        .select('*')
        .eq('id', vendaId)
        .single()
      
      expect(venda).toBeTruthy()
      expect(venda.status).toBe('CONCLUIDA')
      
      // Verificar se itens foram registrados
      const { data: itens } = await supabase
        .from('venda_itens')
        .select('*')
        .eq('venda_id', vendaId)
      
      expect(itens).toHaveLength(1)
      
      // Verificar se documento fiscal foi enfileirado
      const { data: fiscal } = await supabase
        .from('fiscal_fila')
        .select('*')
        .eq('venda_id', vendaId)
        .maybeSingle()
      
      expect(fiscal).toBeTruthy()
      expect(fiscal.status).toBe('PENDENTE')
    }
  })

  it('deve falhar de forma atômica se estoque insuficiente', async () => {
    // Criar produto com estoque zero
    const { data: produto } = await supabase
      .from('produtos')
      .insert({
        nome: 'Produto Teste',
        preco_base: 500,
      })
      .select('id')
      .single()

    // Configurar estoque zero
    await supabase
      .from('estoque')
      .insert({
        produto_id: produto.id,
        loja_id: 'a0000001-0000-4000-8000-000000000001',
        quantidade_atual: 0,
      })

    const vendaInput = {
      idempotencyKey: crypto.randomUUID(),
      formaPagamento: 'DINHEIRO',
      totalBruto: 500,
      totalDesconto: 0,
      totalLiquido: 500,
      pagamentos: [{
        formaPagamento: 'DINHEIRO',
        valor: 500,
      }],
      itens: [{
        produtoId: produto.id,
        quantidade: 1,
      }],
    }

    const resultado = await finalizarVendaCaixaImpl(vendaInput)
    
    expect(resultado.ok).toBe(false)
    expect(resultado.error).toContain('Estoque insuficiente')
    
    // Verificar que nada foi registrado (rollback)
    if (resultado.ok === false) {
      const { data: vendas } = await supabase
        .from('vendas')
        .select('*')
        .eq('operador_id', (await supabase.auth.getUser()).data.user?.id)
        .eq('status', 'CONCLUIDA')
      
      // Não deve ter vendas registradas
      expect(vendas?.length || 0).toBe(0)
    }
  })

  it('deve manter consistência em concorrência', async () => {
    // Criar produto com estoque limitado
    const { data: produto } = await supabase
      .from('produtos')
      .insert({
        nome: 'Produto Concorrência',
        preco_base: 100,
      })
      .select('id')
      .single()

    await supabase
      .from('estoque')
      .insert({
        produto_id: produto.id,
        loja_id: 'a0000001-0000-4000-8000-000000000001',
        quantidade_atual: 1,
      })

    const vendaInput = {
      idempotencyKey: crypto.randomUUID(),
      formaPagamento: 'DINHEIRO',
      totalBruto: 100,
      totalDesconto: 0,
      totalLiquido: 100,
      pagamentos: [{
        formaPagamento: 'DINHEIRO',
        valor: 100,
      }],
      itens: [{
        produtoId: produto.id,
        quantidade: 1,
      }],
    }

    // Simular duas vendas concorrentes
    const [resultado1, resultado2] = await Promise.all([
      finalizarVendaCaixaImpl(vendaInput),
      finalizarVendaCaixaImpl({
        ...vendaInput,
        idempotencyKey: crypto.randomUUID(),
      }),
    ])

    // Apenas uma deve ter sucesso
    const sucessos = [resultado1, resultado2].filter(r => r.ok).length
    const falhas = [resultado1, resultado2].filter(r => !r.ok).length

    expect(sucessos).toBe(1)
    expect(falhas).toBe(1)
    
    // Verificar que o estoque está consistente
    const { data: estoque } = await supabase
      .from('estoque')
      .select('quantidade_atual')
      .eq('produto_id', produto.id)
      .single()
    
    expect(estoque?.quantidade_atual).toBe(0)
  })

  it('deve retornar dados completos em caso de sucesso', async () => {
    const vendaInput = {
      idempotencyKey: crypto.randomUUID(),
      formaPagamento: 'DINHEIRO',
      totalBruto: 200,
      totalDesconto: 20,
      totalLiquido: 180,
      pagamentos: [{
        formaPagamento: 'DINHEIRO',
        valor: 180,
      }],
      itens: [{
        produtoId: 'test-produto-id',
        quantidade: 1,
      }],
    }

    const resultado = await finalizarVendaCaixaImpl(vendaInput)
    
    if (resultado.ok) {
      vendaId = resultado.vendaId
      
      expect(resultado.documentoFiscal).toBeTruthy()
      expect(resultado.itensAtualizados).toBeTruthy()
      expect(resultado.estoqueBaixado).toBeTruthy()
      
      // Verificar estrutura dos dados retornados
      expect(resultado.documentoFiscal).toHaveProperty('documento_id')
      expect(resultado.documentoFiscal).toHaveProperty('status')
      expect(resultado.itensAtualizados).toHaveProperty('length')
      expect(resultado.estoqueBaixado).toHaveProperty('length')
    }
  })
})
