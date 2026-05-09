import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { finalizarVendaCaixaImpl } from './caixaVendas.impl'
import { cancelarVendaImpl } from './caixaVendas.impl'

const LOJA_MATRIZ = 'a0000001-0000-4000-8000-000000000001'

describe('Consistência de Vendas - PDV', () => {
  let supabase: Awaited<ReturnType<typeof createClient>>
  let vendaId: string | null = null
  let caixaId: string

  beforeEach(async () => {
    supabase = await createClient()
    vendaId = null
    const {
      data: { user },
    } = await supabase.auth.getUser()
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

    if (!caixa?.id) throw new Error('Falha ao criar caixa de teste')
    caixaId = caixa.id
  })

  afterEach(async () => {
    if (vendaId) {
      await cancelarVendaImpl(vendaId, 'Test cleanup')
    }

    if (caixaId) {
      await supabase.from('caixas').update({ status: 'FECHADO' }).eq('id', caixaId)
    }
  })

  it('deve finalizar venda com consistência atômica', async () => {
    const { data: produto, error: pe } = await supabase
      .from('produtos')
      .insert({
        nome: 'Produto venda atômica',
        preco_varejo: 500,
        origem: 'brasil_sem_nf',
        tem_nf: false,
      })
      .select('id')
      .single()
    if (pe || !produto) throw new Error(pe?.message ?? 'insert produto')

    await supabase.from('estoque').insert({
      produto_id: produto.id,
      loja_id: LOJA_MATRIZ,
      quantidade_atual: 100,
      estoque_minimo: 0,
    })

    const vendaInput = {
      idempotencyKey: crypto.randomUUID(),
      formaPagamento: 'DINHEIRO' as const,
      totalBruto: 1000,
      totalDesconto: 0,
      totalLiquido: 1000,
      pagamentos: [
        {
          formaPagamento: 'DINHEIRO' as const,
          valor: 1000,
        },
      ],
      itens: [
        {
          produtoId: produto.id,
          quantidade: 2,
          precoOriginal: 500,
          precoUnitario: 500,
          tipoPreco: 'VAREJO' as const,
        },
      ],
    }

    const resultado = await finalizarVendaCaixaImpl(vendaInput)

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      vendaId = resultado.vendaId

      const { data: venda } = await supabase.from('vendas').select('*').eq('id', vendaId).single()

      expect(venda).toBeTruthy()
      expect(venda?.status).toBe('CONCLUIDA')

      const { data: itens } = await supabase.from('venda_itens').select('*').eq('venda_id', vendaId)

      expect(itens).toHaveLength(1)

      const { data: fiscal } = await supabase
        .from('fiscal_fila')
        .select('*')
        .eq('venda_id', vendaId)
        .maybeSingle()

      expect(fiscal).toBeTruthy()
      expect(fiscal?.status).toBe('PENDENTE')
    }
  })

  it('deve falhar de forma atômica se estoque insuficiente', async () => {
    const { data: produto, error: pe } = await supabase
      .from('produtos')
      .insert({
        nome: 'Produto Teste',
        preco_varejo: 500,
        origem: 'brasil_sem_nf',
        tem_nf: false,
      })
      .select('id')
      .single()
    if (pe || !produto) throw new Error(pe?.message ?? 'insert produto')

    await supabase.from('estoque').insert({
      produto_id: produto.id,
      loja_id: LOJA_MATRIZ,
      quantidade_atual: 0,
      estoque_minimo: 0,
    })

    const vendaInput = {
      idempotencyKey: crypto.randomUUID(),
      formaPagamento: 'DINHEIRO' as const,
      totalBruto: 500,
      totalDesconto: 0,
      totalLiquido: 500,
      pagamentos: [{ formaPagamento: 'DINHEIRO' as const, valor: 500 }],
      itens: [
        {
          produtoId: produto.id,
          quantidade: 1,
          precoOriginal: 500,
          precoUnitario: 500,
          tipoPreco: 'VAREJO' as const,
        },
      ],
    }

    const resultado = await finalizarVendaCaixaImpl(vendaInput)

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toContain('Estoque insuficiente')

    if (resultado.ok === false) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { data: vendas } = await supabase
        .from('vendas')
        .select('*')
        .eq('operador_id', user?.id ?? '')
        .eq('status', 'CONCLUIDA')

      expect(vendas?.length || 0).toBe(0)
    }
  })

  it('deve manter consistência em concorrência', async () => {
    const { data: produto, error: pe } = await supabase
      .from('produtos')
      .insert({
        nome: 'Produto Concorrência',
        preco_varejo: 100,
        origem: 'brasil_sem_nf',
        tem_nf: false,
      })
      .select('id')
      .single()
    if (pe || !produto) throw new Error(pe?.message ?? 'insert produto')

    await supabase.from('estoque').insert({
      produto_id: produto.id,
      loja_id: LOJA_MATRIZ,
      quantidade_atual: 1,
      estoque_minimo: 0,
    })

    const vendaInput = {
      idempotencyKey: crypto.randomUUID(),
      formaPagamento: 'DINHEIRO' as const,
      totalBruto: 100,
      totalDesconto: 0,
      totalLiquido: 100,
      pagamentos: [{ formaPagamento: 'DINHEIRO' as const, valor: 100 }],
      itens: [
        {
          produtoId: produto.id,
          quantidade: 1,
          precoOriginal: 100,
          precoUnitario: 100,
          tipoPreco: 'VAREJO' as const,
        },
      ],
    }

    const [resultado1, resultado2] = await Promise.all([
      finalizarVendaCaixaImpl(vendaInput),
      finalizarVendaCaixaImpl({
        ...vendaInput,
        idempotencyKey: crypto.randomUUID(),
      }),
    ])

    const sucessos = [resultado1, resultado2].filter((r) => r.ok).length
    const falhas = [resultado1, resultado2].filter((r) => !r.ok).length

    expect(sucessos).toBe(1)
    expect(falhas).toBe(1)

    const { data: estoque } = await supabase
      .from('estoque')
      .select('quantidade_atual')
      .eq('produto_id', produto.id)
      .single()

    expect(estoque?.quantidade_atual).toBe(0)
  })

  it('deve retornar dados completos em caso de sucesso', async () => {
    const { data: produto, error: pe } = await supabase
      .from('produtos')
      .insert({
        nome: 'Produto desconto manual teste',
        preco_varejo: 200,
        origem: 'brasil_sem_nf',
        tem_nf: false,
      })
      .select('id')
      .single()
    if (pe || !produto) throw new Error(pe?.message ?? 'insert produto')

    await supabase.from('estoque').insert({
      produto_id: produto.id,
      loja_id: LOJA_MATRIZ,
      quantidade_atual: 50,
      estoque_minimo: 0,
    })

    const vendaInput = {
      idempotencyKey: crypto.randomUUID(),
      formaPagamento: 'DINHEIRO' as const,
      totalBruto: 200,
      totalDesconto: 20,
      totalLiquido: 180,
      pagamentos: [{ formaPagamento: 'DINHEIRO' as const, valor: 180 }],
      itens: [
        {
          produtoId: produto.id,
          quantidade: 1,
          precoOriginal: 200,
          precoUnitario: 180,
          tipoPreco: 'MANUAL' as const,
        },
      ],
    }

    const resultado = await finalizarVendaCaixaImpl(vendaInput)

    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      vendaId = resultado.vendaId

      expect(resultado.documentoFiscal).toBeTruthy()
      expect(resultado.itensAtualizados).toBeTruthy()
      expect(resultado.estoqueBaixado).toBeTruthy()

      expect(resultado.documentoFiscal).toHaveProperty('documento_id')
      expect(resultado.documentoFiscal).toHaveProperty('status')
      expect(resultado.itensAtualizados).toHaveProperty('length')
      expect(resultado.estoqueBaixado).toHaveProperty('length')
    }
  })
})
