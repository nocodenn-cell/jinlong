import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScanProcessContext } from '../../../../shared-core/src/pdv/scan-pipeline'
import { buscarProdutoComPrecoCaixa } from '@/app/caixa/actions'
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
    getActiveCupomSessionId: () => 'cupom-a',
    telemetry: { emitTelemetry: vi.fn() },
    ...overrides,
  }
}

describe('runWebCaixaScanProcess — golden / stale_cupom', () => {
  beforeEach(() => {
    vi.mocked(buscarProdutoComPrecoCaixa).mockReset()
    scanStoreTest.itens.length = 0
    scanStoreTest.removerItem.mockClear()
  })

  it('stale_cupom: retorna sem toast e sem chamar busca quando cupom ativo difere do meta', async () => {
    const deps = minimalDeps({ getActiveCupomSessionId: () => 'cupom-b' })
    const r = await runWebCaixaScanProcess(baseCtx(), deps)
    expect(r).toEqual({ ok: false, reason: 'stale_cupom' })
    expect(buscarProdutoComPrecoCaixa).not.toHaveBeenCalled()
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
    vi.mocked(buscarProdutoComPrecoCaixa).mockResolvedValue({
      ok: false,
      error: 'net',
    } as Awaited<ReturnType<typeof buscarProdutoComPrecoCaixa>>)
    const deps = minimalDeps({ getActiveCupomSessionId: () => 'qualquer' })
    const r = await runWebCaixaScanProcess(ctx, deps)
    expect(r.ok).toBe(false)
    expect(buscarProdutoComPrecoCaixa).toHaveBeenCalled()
  })

  it('abort antes da busca: não chama buscarProdutoComPrecoCaixa', async () => {
    const ac = new AbortController()
    ac.abort()
    const deps = minimalDeps()
    const r = await runWebCaixaScanProcess(baseCtx({}, { signal: ac.signal }), deps)
    expect(r).toEqual({ ok: false, reason: 'aborted' })
    expect(buscarProdutoComPrecoCaixa).not.toHaveBeenCalled()
  })

  it('abort durante busca pendente: retorna aborted sem adicionar ao carrinho', async () => {
    let releaseBusca!: (v: Awaited<ReturnType<typeof buscarProdutoComPrecoCaixa>>) => void
    const buscaPromise = new Promise<Awaited<ReturnType<typeof buscarProdutoComPrecoCaixa>>>((resolve) => {
      releaseBusca = resolve
    })
    vi.mocked(buscarProdutoComPrecoCaixa).mockImplementation(() => buscaPromise)

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
      precoCalculado: 9.99,
      tipoPrecoCalculado: 'VAREJO',
    })
  })

  it('stale_cupom após add: compensa removendo linha (P0 — carrinho alinhado ao scan)', async () => {
    let cupomCalls = 0
    vi.mocked(buscarProdutoComPrecoCaixa).mockResolvedValue({
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
      precoCalculado: 9.99,
      tipoPrecoCalculado: 'VAREJO',
    } as Awaited<ReturnType<typeof buscarProdutoComPrecoCaixa>>)

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

  it('nao_encontrado: avisa o operador e para — o PDV não cadastra produto', async () => {
    vi.mocked(buscarProdutoComPrecoCaixa).mockResolvedValue({
      ok: true,
      status: 'nao_encontrado',
    } as Awaited<ReturnType<typeof buscarProdutoComPrecoCaixa>>)
    const deps = minimalDeps()
    const r = await runWebCaixaScanProcess(baseCtx(), deps)

    expect(r).toEqual({ ok: false, reason: 'not_found' })
    // Informa e orienta; nada de abrir cadastro (removido do caixa).
    expect(deps.setCaixaMensagem).toHaveBeenCalledWith('não encontrado', {
      kind: 'warning',
    })
    expect(deps.tocarFeedback).toHaveBeenCalledWith('erro')
    // Não adiciona item nem mexe no cupom.
    expect(deps.adicionarItem).not.toHaveBeenCalled()
    expect(scanStoreTest.itens).toHaveLength(0)
  })

  // Onda 2 · Bloco 1 — ambiguidade por nome expõe candidatos em vez de só bloquear.
  const CANDIDATOS_CADEIRA = [
    {
      id: 'p-verm',
      nome: 'Cadeira Vermelha',
      codigo_barras: null,
      codigo_interno: null,
      preco_varejo: 150,
      preco_atacado: null,
      categoria_id: null,
      origem: 'brasil_nf' as const,
      tem_nf: true,
      observacao: null,
      quantidade_estoque: 5,
      estoque_minimo: 1,
    },
    {
      id: 'p-vg',
      nome: 'Cadeira Vermelha Grande',
      codigo_barras: null,
      codigo_interno: 'CAD-VERM-G',
      preco_varejo: 220,
      preco_atacado: null,
      categoria_id: null,
      origem: 'brasil_nf' as const,
      tem_nf: true,
      observacao: null,
      quantidade_estoque: 2,
      estoque_minimo: 1,
    },
  ]

  it('ambiguo com candidatos: expõe a lista via setCandidatosAmbiguos, sem bloquear com toast', async () => {
    vi.mocked(buscarProdutoComPrecoCaixa).mockResolvedValue({
      ok: true,
      status: 'ambiguo',
      mensagem: 'Vários produtos batem com "cadeira verm".',
      candidatos: CANDIDATOS_CADEIRA,
    } as Awaited<ReturnType<typeof buscarProdutoComPrecoCaixa>>)
    const setCandidatosAmbiguos = vi.fn()
    const deps = minimalDeps({ setCandidatosAmbiguos })
    const r = await runWebCaixaScanProcess(baseCtx(), deps)

    expect(r).toEqual({ ok: false, reason: 'ambiguous' })
    expect(setCandidatosAmbiguos).toHaveBeenCalledWith({
      mensagem: 'Vários produtos batem com "cadeira verm".',
      itens: CANDIDATOS_CADEIRA,
    })
    // Não usa o toast bloqueante quando há lista de candidatos pra escolher.
    expect(deps.setCaixaMensagem).not.toHaveBeenCalledWith(
      'Vários produtos batem com "cadeira verm".',
      { kind: 'warning' },
    )
    expect(deps.adicionarItem).not.toHaveBeenCalled()
  })

  it('ambiguo sem candidatos (colisão de código de barras): mantém o toast bloqueante de sempre', async () => {
    vi.mocked(buscarProdutoComPrecoCaixa).mockResolvedValue({
      ok: true,
      status: 'ambiguo',
      mensagem: 'Vários produtos batem com o código lido.',
      candidatos: [],
    } as Awaited<ReturnType<typeof buscarProdutoComPrecoCaixa>>)
    const setCandidatosAmbiguos = vi.fn()
    const deps = minimalDeps({ setCandidatosAmbiguos })
    const r = await runWebCaixaScanProcess(baseCtx(), deps)

    expect(r).toEqual({ ok: false, reason: 'ambiguous' })
    expect(setCandidatosAmbiguos).not.toHaveBeenCalledWith(
      expect.objectContaining({ itens: expect.anything() }),
    )
    expect(deps.setCaixaMensagem).toHaveBeenCalledWith('Vários produtos batem com o código lido.', {
      kind: 'warning',
    })
  })

  it('ambiguo com candidatos mas sem dep setCandidatosAmbiguos: cai no toast (compat)', async () => {
    vi.mocked(buscarProdutoComPrecoCaixa).mockResolvedValue({
      ok: true,
      status: 'ambiguo',
      mensagem: 'Vários produtos batem com "cadeira".',
      candidatos: CANDIDATOS_CADEIRA,
    } as Awaited<ReturnType<typeof buscarProdutoComPrecoCaixa>>)
    const deps = minimalDeps() // sem setCandidatosAmbiguos
    const r = await runWebCaixaScanProcess(baseCtx(), deps)

    expect(r).toEqual({ ok: false, reason: 'ambiguous' })
    expect(deps.setCaixaMensagem).toHaveBeenCalledWith('Vários produtos batem com "cadeira".', {
      kind: 'warning',
    })
  })
})
