import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cenário 4 (F5): usuário sem permissão (sem licença, sem vínculo/papel, perfil fora da policy)
 * não executa NENHUMA action do hub — o gate de servidor nega antes de qualquer RPC, e a
 * aprovação exige DONO no próprio gate (além do banco).
 */

const rpc = vi.hoisted(() => vi.fn(async () => ({ data: 'x', error: null })))
const actionImportacoes = vi.hoisted(() => vi.fn())
const aprovarApuracao = vi.hoisted(() => vi.fn())
const apurarOperacao = vi.hoisted(() => vi.fn())
const createAdminClient = vi.hoisted(() => vi.fn(() => ({ rpc })))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/import/hub/gateImportacoes', () => ({ actionImportacoes }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/import/importIntelligence', () => ({ aprovarApuracao, apurarOperacao }))

import * as acoes from './actions'

const OP = '11111111-1111-4111-8111-111111111111'
const ID = '22222222-2222-4222-8222-222222222222'

const chamadas: [string, () => Promise<{ ok: boolean; erro?: string }>][] = [
  ['criar', () => acoes.criarImportacaoAction({ loja_importadora_id: ID, referencia: 'X' })],
  ['cabecalho', () => acoes.salvarCabecalhoAction(OP, { referencia: 'X' })],
  ['item', () => acoes.salvarItemAction(OP, { descricao: 'a', moeda: 'USD', valor_mercadoria_moeda: '1', quantidade_comercial: '1', unidade_comercial: 'UN', fator_para_estoque: '1', quantidade_estoque: '1' })],
  ['lancamento', () => acoes.salvarLancamentoAction(OP, 'CAMBIO', { moeda: 'USD', taxa: '5', fonte: 'MANUAL', data: '2026-10-01' })],
  ['remover', () => acoes.removerRascunhoAction(OP, 'ITEM', ID)],
  ['conferir', () => acoes.conferirLancamentoAction(OP, 'DESPESA', ID, 'CONFERIDO')],
  ['documento', () => acoes.registrarDocumentoAction(OP, { tipo: 'INVOICE' })],
  ['apurar', () => acoes.apurarAction(OP, 'APURACAO')],
  ['aprovar', () => acoes.aprovarAction(OP, ID, 'motivo suficiente')],
  ['estado', () => acoes.mudarEstadoAction(OP, 'CANCELAR', 'motivo suficiente')],
  ['buscarProdutos', () => acoes.buscarProdutosAction('parafuso')],
]

describe('actions do hub — gate de servidor', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(chamadas)('%s: sem permissão → erro_nao_autorizado e nenhuma RPC', async (_nome, chamar) => {
    actionImportacoes.mockResolvedValue({ ok: false, erro: 'NAO_AUTORIZADO' })
    const r = await chamar()
    expect(r).toMatchObject({ ok: false, erro: 'erro_nao_autorizado' })
    expect(rpc).not.toHaveBeenCalled()
    expect(apurarOperacao).not.toHaveBeenCalled()
    expect(aprovarApuracao).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('aprovar e reabrir pedem o gate somenteDono', async () => {
    actionImportacoes.mockResolvedValue({ ok: false, erro: 'NAO_AUTORIZADO' })
    await acoes.aprovarAction(OP, ID, 'motivo suficiente')
    await acoes.mudarEstadoAction(OP, 'REABRIR', 'motivo suficiente')
    expect(actionImportacoes).toHaveBeenNthCalledWith(1, { somenteDono: true })
    expect(actionImportacoes).toHaveBeenNthCalledWith(2, { somenteDono: true })
  })

  it('com permissão, o tenant nunca vem do navegador: só a loja é enviada e o banco deriva a empresa', async () => {
    actionImportacoes.mockResolvedValue({ ok: true, ctx: { client: { rpc } } })
    await acoes.criarImportacaoAction({
      loja_importadora_id: ID,
      referencia: 'INV-1',
      // campo forjado: ignorado pelo schema
      ...({ empresa_id: '33333333-3333-4333-8333-333333333333' } as object),
    })
    expect(rpc).toHaveBeenNthCalledWith(1, 'import_criar_operacao', { p_loja_importadora: ID, p_referencia: 'INV-1', p_descricao: null })
    const dados = (rpc.mock.calls[1] as unknown[])[1] as { p_dados: Record<string, unknown> }
    expect(dados.p_dados).not.toHaveProperty('empresa_id')
  })

  it('valores inválidos são recusados antes do banco; código do fornecedor mantém zeros', async () => {
    actionImportacoes.mockResolvedValue({ ok: true, ctx: { client: { rpc } } })
    const ruim = await acoes.salvarItemAction(OP, { descricao: 'a', moeda: 'USD', valor_mercadoria_moeda: '1e3', quantidade_comercial: '1', unidade_comercial: 'UN', fator_para_estoque: '1', quantidade_estoque: '1' })
    expect(ruim).toMatchObject({ ok: false, erro: 'erro_valor_invalido' })
    expect(rpc).not.toHaveBeenCalled()
    await acoes.salvarItemAction(OP, { descricao: 'a', codigo_fornecedor: ' 000123 ', moeda: 'usd', valor_mercadoria_moeda: '1.234,56', quantidade_comercial: '1', unidade_comercial: 'UN', fator_para_estoque: '1', quantidade_estoque: '1' })
    const item = ((rpc.mock.calls[0] as unknown[])[1] as { p_item: Record<string, unknown> }).p_item
    expect(item).toMatchObject({ codigo_fornecedor: '000123', moeda: 'USD', valor_mercadoria_moeda: '1234.56' })
  })
})
