import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * P1 — "usar valor aduaneiro calculado": gate de servidor, recálculo no servidor a partir do banco,
 * nunca sobrescreve VA informado, grava pelo mesmo RPC do salvarItemAction (import_salvar_item).
 */
const rpc = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => ({ data: 'x', error: null as { message: string } | null })))
const eqDocs = vi.hoisted(() => vi.fn())
const from = vi.hoisted(() => vi.fn(() => ({ select: () => ({ eq: eqDocs }) })))
const actionImportacoes = vi.hoisted(() => vi.fn())
const carregarOperacao = vi.hoisted(() => vi.fn())
const revalidatePath = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/import/hub/gateImportacoes', () => ({ actionImportacoes }))
vi.mock('@/lib/import/hub/dadosImportacoes', () => ({ carregarOperacao }))

import { preencherValoresAduaneirosAction } from './actions-valor-aduaneiro'

const OP = '11111111-1111-4111-8111-111111111111'
const item = (id: string, usd: string, va: string | null = null) => ({
  id, descricao: `Item ${id}`, codigo_fornecedor: '000123', ncm: '85161000', produto_id: null, moeda: 'USD', valor_mercadoria_moeda: usd,
  valor_aduaneiro_brl: va, quantidade_comercial: '10.000', unidade_comercial: 'UN', fator_para_estoque: '1.000000', quantidade_estoque: '10.000',
  peso_liquido_kg: '1.500', peso_bruto_kg: null, volume_m3: null,
})
const desp = (id: string, tipo: string, valor: string) => ({ id, tipo, moeda: 'USD', valor, incorporavel: 'SIM', atribuicao_modo: 'RATEIO',
  item_id: null, criterio: null, justificativa: '', status_conferencia: 'PENDENTE', documento_id: null })
const dados = (itens: ReturnType<typeof item>[], cambios = [{ id: 'c', moeda: 'USD', taxa: '5.0277', fonte: 'PTAX', data: '2026-10-21' }]) => ({
  operacao: { id: OP }, itens, cambios,
  despesas: [desp('f', 'Frete internacional', '2500'), desp('s', 'Seguro', '150'), desp('a', 'AFRMM (8% do frete)', '200')],
})

describe('preencherValoresAduaneirosAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eqDocs.mockResolvedValue({ data: [{ id: 'i3', documento_id: 'doc-3' }], error: null })
  })

  it('sem permissão: erro_nao_autorizado, sem leitura nem RPC', async () => {
    actionImportacoes.mockResolvedValue({ ok: false, erro: 'NAO_AUTORIZADO' })
    expect(await preencherValoresAduaneirosAction(OP)).toMatchObject({ ok: false, erro: 'erro_nao_autorizado' })
    expect(carregarOperacao).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('id inválido: recusa antes do banco', async () => {
    actionImportacoes.mockResolvedValue({ ok: true, ctx: { client: { rpc, from } } })
    expect(await preencherValoresAduaneirosAction('x')).toMatchObject({ ok: false, erro: 'erro_valor_invalido' })
    expect(carregarOperacao).not.toHaveBeenCalled()
  })

  it('cenário real: preenche só os itens sem VA, recalculado no servidor, pelo import_salvar_item; preserva documento', async () => {
    actionImportacoes.mockResolvedValue({ ok: true, ctx: { client: { rpc, from } } })
    carregarOperacao.mockResolvedValue(dados([item('i1', '2000', '11931.94'), item('i2', '9000'), item('i3', '3200')]))
    // argumento extra forjado pelo navegador é ignorado (assinatura só aceita o id)
    const r = await (preencherValoresAduaneirosAction as (op: string, x?: unknown) => Promise<unknown>)(OP, { valores: { i2: '1' } })
    expect(r).toEqual({ ok: true, data: { preenchidos: 2 } })
    expect(rpc).toHaveBeenCalledTimes(2)
    const enviados = rpc.mock.calls.map((c) => c as unknown as [string, { p_operacao: string; p_item: Record<string, unknown> }])
    expect(enviados.every(([fn, a]) => fn === 'import_salvar_item' && a.p_operacao === OP)).toBe(true)
    expect(enviados[0][1].p_item).toEqual({
      id: 'i2', descricao: 'Item i2', codigo_fornecedor: '000123', ncm: '85161000', produto_id: null, moeda: 'USD', unidade_comercial: 'UN',
      valor_mercadoria_moeda: '9000', valor_aduaneiro_brl: '53693.711619', quantidade_comercial: '10.000', fator_para_estoque: '1.000000',
      quantidade_estoque: '10.000', peso_liquido_kg: '1.500', peso_bruto_kg: null, volume_m3: null, documento_id: null,
    })
    expect(enviados[1][1].p_item).toMatchObject({ id: 'i3', valor_aduaneiro_brl: '19091.097465', documento_id: 'doc-3' })
    expect(enviados.some(([, a]) => a.p_item.id === 'i1')).toBe(false)
    expect(revalidatePath).toHaveBeenCalledWith(expect.stringContaining(OP))
  })

  it('pendência (item sem câmbio): não grava nada parcialmente', async () => {
    actionImportacoes.mockResolvedValue({ ok: true, ctx: { client: { rpc, from } } })
    carregarOperacao.mockResolvedValue(dados([item('i1', '2000'), { ...item('i2', '9000'), moeda: 'CNY' }]))
    expect(await preencherValoresAduaneirosAction(OP)).toMatchObject({ ok: false, erro: 'erro_va_pendencias' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('nada a preencher: ok com 0 e nenhuma RPC', async () => {
    actionImportacoes.mockResolvedValue({ ok: true, ctx: { client: { rpc, from } } })
    carregarOperacao.mockResolvedValue(dados([item('i1', '2000', '1')]))
    expect(await preencherValoresAduaneirosAction(OP)).toEqual({ ok: true, data: { preenchidos: 0 } })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('erro do banco: propaga a chave e para', async () => {
    actionImportacoes.mockResolvedValue({ ok: true, ctx: { client: { rpc, from } } })
    carregarOperacao.mockResolvedValue(dados([item('i2', '9000'), item('i3', '3200')]))
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'IMPORT_OPERACAO_NAO_EDITAVEL' } })
    const r = await preencherValoresAduaneirosAction(OP)
    expect(r).toMatchObject({ ok: false })
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
