import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScanProcessContext } from '../../../../shared-core/src/pdv/scan-pipeline'
import { buscarProdutoComPrecoCaixa } from '@/app/caixa/actions'
import type { ProdutoCaixaResumoDTO } from '@/app/caixa/caixaActionTypes'
import { runWebCaixaScanProcess, type WebCaixaScanDeps } from './webCaixaScanProcess'

/**
 * Contrato de `status: 'multiplos'` — busca por nome/categoria com vários
 * acertos entrega candidatos para o operador escolher.
 *
 * Invariante central: enquanto há escolha pendente, o carrinho NÃO é mutado.
 * Antes desta mudança o caminho caía em `ambiguo` e morria numa mensagem.
 */

const scanStoreTest = vi.hoisted(() => {
  const itens: { id: string; produtoId: string; quantidade: number }[] = []
  const removerItem = vi.fn((id: string) => {
    const ix = itens.findIndex((x) => x.id === id)
    if (ix >= 0) itens.splice(ix, 1)
  })
  return {
    itens,
    removerItem,
    getState() {
      return { itens: [...itens], removerItem }
    },
  }
})

vi.mock('@/app/caixa/actions', () => ({
  buscarProdutoComPrecoCaixa: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'test-user' } } },
        error: null,
      }),
    },
  }),
}))

vi.mock('@/stores/carrinhoStore', () => ({
  useCarrinhoStore: { getState: () => scanStoreTest.getState() },
}))

const CANDIDATOS: ProdutoCaixaResumoDTO[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    nome: 'Fone Bluetooth Preto',
    codigo_barras: '7891111111111',
    preco_varejo: 49.9,
    quantidade_estoque: 12,
    estoque_minimo: 3,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    nome: 'Fone Bluetooth Branco',
    codigo_barras: null,
    preco_varejo: 49.9,
    quantidade_estoque: 0,
    estoque_minimo: 3,
  },
]

function ctxComTermo(codigo: string): ScanProcessContext {
  return {
    scan: {
      sequenceNumber: 1,
      event: {
        id: 'scan-multi-1',
        codigo,
        receivedAt: Date.now(),
        meta: { cupomSessionId: 'cupom-a', correlationId: 'cupom-a', source: 'form_submit' },
      },
      state: 'processing',
      timestamps: {},
      attempts: 1,
    },
  }
}

function deps(overrides: Partial<WebCaixaScanDeps> = {}): WebCaixaScanDeps {
  const m = {
    caixa: {
      msg_produto_nao_encontrado_acao: 'não encontrado',
      item_adicionado: 'ok',
      estoque_baixo: 'baixo',
      estoque_abaixo_minimo: 'min',
      msg_item_adicionado_toast: 'adicionado',
      falha_busca: 'falha',
    },
  } as unknown as WebCaixaScanDeps['m']

  return {
    m,
    setCaixaMensagem: vi.fn(),
    setCodigo: vi.fn(),
    tocarFeedback: vi.fn(),
    focarCampoBusca: vi.fn(),
    adicionarItem: vi.fn((item) => {
      scanStoreTest.itens.push({
        id: item.id,
        produtoId: item.produtoId,
        quantidade: item.quantidade,
      })
    }),
    setCartOwnerForSession: vi.fn(),
    getActiveCupomSessionId: () => 'cupom-a',
    telemetry: { emitTelemetry: vi.fn() },
    ...overrides,
  }
}

describe('runWebCaixaScanProcess — status multiplos', () => {
  beforeEach(() => {
    vi.mocked(buscarProdutoComPrecoCaixa).mockReset()
    scanStoreTest.itens.length = 0
    scanStoreTest.removerItem.mockClear()
  })

  it('entrega os candidatos à UI sem tocar no carrinho', async () => {
    vi.mocked(buscarProdutoComPrecoCaixa).mockResolvedValue({
      ok: true,
      status: 'multiplos',
      produtos: CANDIDATOS,
    })
    const onMultiplosResultados = vi.fn()
    const d = deps({ onMultiplosResultados })

    const r = await runWebCaixaScanProcess(ctxComTermo('fone'), d)

    expect(onMultiplosResultados).toHaveBeenCalledWith(CANDIDATOS)
    expect(d.adicionarItem).not.toHaveBeenCalled()
    expect(scanStoreTest.itens).toHaveLength(0)
    expect(r.ok).toBe(false)
  })

  it('não emite som de erro nem apaga o termo digitado (escolha pendente ≠ falha)', async () => {
    vi.mocked(buscarProdutoComPrecoCaixa).mockResolvedValue({
      ok: true,
      status: 'multiplos',
      produtos: CANDIDATOS,
    })
    const d = deps({ onMultiplosResultados: vi.fn() })

    await runWebCaixaScanProcess(ctxComTermo('fone'), d)

    expect(d.tocarFeedback).not.toHaveBeenCalled()
    expect(d.setCodigo).not.toHaveBeenCalled()
  })

  it('código de barras duplicado continua sendo ambiguo (erro de cadastro, não escolha)', async () => {
    vi.mocked(buscarProdutoComPrecoCaixa).mockResolvedValue({
      ok: true,
      status: 'ambiguo',
      mensagem: 'Vários produtos batem com o código lido.',
    })
    const onMultiplosResultados = vi.fn()
    const d = deps({ onMultiplosResultados })

    const r = await runWebCaixaScanProcess(ctxComTermo('7891111111111'), d)

    expect(onMultiplosResultados).not.toHaveBeenCalled()
    expect(d.tocarFeedback).toHaveBeenCalledWith('erro')
    expect(r).toEqual({ ok: false, reason: 'ambiguous' })
  })

  it('escolha confirmada (id do produto) entra no carrinho pelo caminho normal', async () => {
    const escolhido = CANDIDATOS[0]
    vi.mocked(buscarProdutoComPrecoCaixa).mockResolvedValue({
      ok: true,
      status: 'encontrado',
      produto: {
        id: escolhido.id,
        nome: escolhido.nome,
        codigo_barras: escolhido.codigo_barras,
        preco_varejo: escolhido.preco_varejo,
        preco_atacado: null,
        categoria_id: null,
        origem: 'china_manual',
        tem_nf: false,
        observacao: null,
        quantidade_estoque: escolhido.quantidade_estoque,
        estoque_minimo: escolhido.estoque_minimo,
      },
      precoCalculado: 44.9,
      tipoPrecoCalculado: 'ATACADO',
    })
    const onLimparResultados = vi.fn()
    const d = deps({ onLimparResultados })

    const r = await runWebCaixaScanProcess(ctxComTermo(escolhido.id), d)

    expect(r).toEqual({ ok: true })
    expect(onLimparResultados).toHaveBeenCalled()
    expect(scanStoreTest.itens).toHaveLength(1)
    expect(scanStoreTest.itens[0].produtoId).toBe(escolhido.id)
    // Preço vem do servidor após a escolha — a lista de candidatos não decide preço.
    expect(d.adicionarItem).toHaveBeenCalledWith(
      expect.objectContaining({ precoUnitario: 44.9 }),
    )
  })
})
