import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScanProcessContext } from '../../../../shared-core/src/pdv/scan-pipeline'
import { buscarProdutoParaCaixa } from '@/app/caixa/actions'
import { runWebCaixaScanProcess, type WebCaixaScanDeps } from './webCaixaScanProcess'

const scanStoreTest = vi.hoisted(() => {
  const itens: { id: string; produtoId: string; quantidade: number; resultado?: { tipoPreco: string } }[] = []
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
  buscarProdutoParaCaixa: vi.fn(),
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
  useCarrinhoStore: {
    getState: () => scanStoreTest.getState(),
  },
}))

function baseCtx(
  overrides: Partial<ScanProcessContext['scan']> = {},
  options?: { signal?: AbortSignal },
): ScanProcessContext {
  const now = Date.now()
  return {
    scan: {
      sequenceNumber: 1,
      event: {
        id: 'scan-test-1',
        codigo: '789',
        receivedAt: now,
        meta: { cupomSessionId: 'cupom-a', correlationId: 'cupom-a', source: 'form_submit' },
      },
      state: 'processing',
      timestamps: {},
      attempts: 1,
      ...overrides,
    },
    signal: options?.signal,
  }
}

function minimalDeps(overrides: Partial<WebCaixaScanDeps> = {}): WebCaixaScanDeps {
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
        resultado: item.resultado as { tipoPreco: string },
      })
    }),
    setCartOwnerForSession: vi.fn(),
    aplicarPrecoRpcParaLinha: vi.fn().mockResolvedValue(undefined),
    getActiveCupomSessionId: () => 'cupom-a',
    telemetry: { emitTelemetry: vi.fn() },
    ...overrides,
  }
}

describe('runWebCaixaScanProcess — golden / stale_cupom', () => {
  beforeEach(() => {
    vi.mocked(buscarProdutoParaCaixa).mockReset()
    scanStoreTest.itens.length = 0
    scanStoreTest.removerItem.mockClear()
  })

  it('stale_cupom: retorna sem toast e sem chamar busca quando cupom ativo difere do meta', async () => {
    const deps = minimalDeps({ getActiveCupomSessionId: () => 'cupom-b' })
    const r = await runWebCaixaScanProcess(baseCtx(), deps)
    expect(r).toEqual({ ok: false, reason: 'stale_cupom' })
    expect(buscarProdutoParaCaixa).not.toHaveBeenCalled()
    expect(deps.setCaixaMensagem).not.toHaveBeenCalled()
  })

  it('sem cupomSessionId no meta: não aplica guard stale (compat motor)', async () => {
    const now = Date.now()
    const ctx: ScanProcessContext = {
      scan: {
        sequenceNumber: 1,
        event: { id: 's2', codigo: '123', receivedAt: now, meta: { source: 'form_submit' } },
        state: 'processing',
        timestamps: {},
        attempts: 1,
      },
    }
    vi.mocked(buscarProdutoParaCaixa).mockResolvedValue({
      ok: false,
      error: 'net',
    } as Awaited<ReturnType<typeof buscarProdutoParaCaixa>>)
    const deps = minimalDeps({ getActiveCupomSessionId: () => 'qualquer' })
    const r = await runWebCaixaScanProcess(ctx, deps)
    expect(r.ok).toBe(false)
    expect(buscarProdutoParaCaixa).toHaveBeenCalled()
  })

  it('abort antes da busca: não chama buscarProdutoParaCaixa', async () => {
    const ac = new AbortController()
    ac.abort()
    const deps = minimalDeps()
    const r = await runWebCaixaScanProcess(baseCtx({}, { signal: ac.signal }), deps)
    expect(r).toEqual({ ok: false, reason: 'aborted' })
    expect(buscarProdutoParaCaixa).not.toHaveBeenCalled()
  })

  it('abort durante busca pendente: retorna aborted sem adicionar ao carrinho', async () => {
    let releaseBusca!: (v: Awaited<ReturnType<typeof buscarProdutoParaCaixa>>) => void
    const buscaPromise = new Promise<Awaited<ReturnType<typeof buscarProdutoParaCaixa>>>((resolve) => {
      releaseBusca = resolve
    })
    vi.mocked(buscarProdutoParaCaixa).mockImplementation(() => buscaPromise)

    const ac = new AbortController()
    const deps = minimalDeps()
    const p = runWebCaixaScanProcess(baseCtx({}, { signal: ac.signal }), deps)

    await Promise.resolve()
    await Promise.resolve()
    ac.abort()

    const r = await p
    expect(r).toEqual({ ok: false, reason: 'aborted' })
    expect(deps.adicionarItem).not.toHaveBeenCalled()

    releaseBusca({
      ok: true,
      status: 'encontrado',
      produto: {
        id: 'p1',
        nome: 'Produto teste',
        codigo_barras: '789',
        preco_varejo: 9.99,
        preco_atacado: null,
        categoria_id: null,
        origem: 'brasil_sem_nf',
        tem_nf: false,
        observacao: null,
        quantidade_estoque: 5,
        estoque_minimo: null,
      },
    })
  })

  it('stale_cupom após add: compensa removendo linha (P0 — carrinho alinhado ao scan)', async () => {
    let cupomCalls = 0
    vi.mocked(buscarProdutoParaCaixa).mockResolvedValue({
      ok: true,
      status: 'encontrado',
      produto: {
        id: 'p1',
        nome: 'Produto teste',
        codigo_barras: '789',
        preco_varejo: 9.99,
        preco_atacado: null,
        categoria_id: null,
        origem: 'brasil_sem_nf',
        tem_nf: false,
        observacao: null,
        quantidade_estoque: 5,
        estoque_minimo: null,
      },
    } as Awaited<ReturnType<typeof buscarProdutoParaCaixa>>)

    const deps = minimalDeps({
      getActiveCupomSessionId: () => {
        cupomCalls += 1
        return cupomCalls <= 4 ? 'cupom-a' : 'cupom-b'
      },
    })

    const r = await runWebCaixaScanProcess(baseCtx(), deps)
    expect(r).toEqual({ ok: false, reason: 'stale_cupom' })
    expect(deps.adicionarItem).toHaveBeenCalledTimes(1)
    expect(scanStoreTest.itens).toHaveLength(0)
    expect(scanStoreTest.removerItem).toHaveBeenCalled()
  })
})
