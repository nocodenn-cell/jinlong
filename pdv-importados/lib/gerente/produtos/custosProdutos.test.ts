import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anexarCustosProdutos, carregarCustosProdutos } from './custosProdutos'

/** Cliente falso: registra as consultas à view e devolve `rows`/`error`. */
function clienteFalso(rows: unknown[], error: { message: string } | null = null) {
  const consultas: { tabela: string; colunas: string; ids: string[] }[] = []
  const client = {
    rpc: async (tabela: string, args: { p_produto_ids: string[] }) => {
      consultas.push({ tabela, colunas: '*', ids: args.p_produto_ids })
      return { data: error ? null : rows, error }
    },
  } as unknown as SupabaseClient
  return { client, consultas }
}

describe('custosProdutos (N1)', () => {
  it('lê o custo SOMENTE da RPC produtos_custos_autorizados, nunca de produtos', async () => {
    const { client, consultas } = clienteFalso([{ produto_id: 'p1', preco_custo: '12.5', preco_custo_medio: 0 }])
    const mapa = await carregarCustosProdutos(client, ['p1'])
    expect(consultas).toHaveLength(1)
    expect(consultas[0].tabela).toBe('produtos_custos_autorizados')
    expect(mapa.get('p1')).toEqual({ preco_custo: 12.5, preco_custo_medio: 0 })
  })

  it('OPERADOR (view sem linhas) → custo nulo, sem erro', async () => {
    const { client } = clienteFalso([])
    const [linha] = await anexarCustosProdutos(client, [{ id: 'p1', nome: 'Garrafa' }])
    expect(linha).toEqual({ id: 'p1', nome: 'Garrafa', preco_custo: null, preco_custo_medio: null })
  })

  it('erro de leitura LANÇA (custo nulo por falha não pode virar "sem custo")', async () => {
    const { client } = clienteFalso([], { message: 'permission denied' })
    await expect(carregarCustosProdutos(client, ['p1'])).rejects.toThrow(/custo_produtos_indisponivel/)
  })

  it('divide em lotes e ignora ids repetidos/vazios', async () => {
    const { client, consultas } = clienteFalso([])
    const ids = Array.from({ length: 320 }, (_, i) => `p${i}`)
    await carregarCustosProdutos(client, [...ids, 'p1', '', 'p2'])
    expect(consultas.length).toBe(3)
    expect(consultas.flatMap((c) => c.ids)).toHaveLength(320)
  })

  it('sem ids não consulta', async () => {
    const { client, consultas } = clienteFalso([])
    const mapa = await carregarCustosProdutos(client, [])
    expect(mapa.size).toBe(0)
    expect(consultas).toHaveLength(0)
  })

  it('valor não numérico vira nulo', async () => {
    const { client } = clienteFalso([{ produto_id: 'p1', preco_custo: 'abc', preco_custo_medio: null }])
    const mapa = await carregarCustosProdutos(client, ['p1'])
    expect(mapa.get('p1')).toEqual({ preco_custo: null, preco_custo_medio: null })
    vi.restoreAllMocks()
  })
})
