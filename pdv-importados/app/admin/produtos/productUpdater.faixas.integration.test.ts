import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createProductUpdater } from './productUpdater'

// Opt-in: usa somente conta e banco locais; nunca credenciais de produção.
describe.skipIf(process.env.QA_LOCAL_PRICING !== '1')('faixas reais após salvar catálogo', () => {
  let client: SupabaseClient
  let lojaId: string
  let produtoCriado = false
  const produtoId = randomUUID()

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url)) throw Error('Banco local obrigatório')
    client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const auth = await client.auth.signInWithPassword({
      email: 'e2e-dono@localhost.test', password: process.env.SEED_DEV_PASSWORD!,
    })
    if (auth.error) throw Error('Autenticação QA local indisponível')
    const perfil = await client.from('usuarios').select('loja_id').eq('id', auth.data.user!.id).single()
    if (perfil.error) throw perfil.error
    lojaId = perfil.data.loja_id
    const created = await client.from('produtos').insert({ id: produtoId, loja_id: lojaId,
      nome: 'QA regressão faixas', preco_varejo: 100, preco_atacado: 80,
      quantidade_gatilho_atacado: 5, origem: 'china_manual', tem_nf: false, unidade_medida: 'UN', ativo: true,
    })
    if (created.error) throw created.error
    produtoCriado = true
  }, 30_000)

  afterAll(async () => {
    if (!produtoCriado) return
    const faixas = await client.from('precos_atacado').delete().eq('produto_id', produtoId)
    const produto = await client.from('produtos').delete().eq('id', produtoId)
    await client.auth.signOut({ scope: 'local' })
    if (faixas.error) throw faixas.error
    if (produto.error) throw produto.error
  })

  async function salvar() {
    const result = await createProductUpdater(client).update({ id: produtoId, lojaId, input: {
      nome: 'QA regressão faixas', precoVarejo: 100, precoAtacado: 80, quantidadeGatilhoAtacado: 5,
    } })
    expect(result.ok, JSON.stringify(result)).toBe(true)
  }

  async function faixas() {
    const result = await client.from('precos_atacado').select('quantidade_minima,preco_unitario,ativo')
      .eq('produto_id', produtoId).order('quantidade_minima')
    if (result.error) throw result.error
    return result.data
  }

  it('edição, múltiplas faixas e remoção sobrevivem ao salvamento', async () => {
    const initial = await client.from('precos_atacado').insert({ produto_id: produtoId, quantidade_minima: 5, preco_unitario: 80, ativo: true })
    if (initial.error) throw initial.error
    const edited = await client.from('precos_atacado').update({ quantidade_minima: 8, preco_unitario: 75 }).eq('produto_id', produtoId)
    if (edited.error) throw edited.error
    await salvar()
    expect(await faixas()).toEqual([{ quantidade_minima: 8, preco_unitario: 75, ativo: true }])
    const added = await client.from('precos_atacado').insert({ produto_id: produtoId, quantidade_minima: 10, preco_unitario: 70, ativo: true })
    if (added.error) throw added.error
    const duas = await faixas()
    await salvar()
    await salvar()
    expect(await faixas()).toEqual(duas)
    const removed = await client.from('precos_atacado').update({ ativo: false }).eq('produto_id', produtoId).eq('quantidade_minima', 8)
    if (removed.error) throw removed.error
    const removida = await faixas()
    await salvar()
    expect(await faixas()).toEqual(removida)
  }, 30_000)
})
