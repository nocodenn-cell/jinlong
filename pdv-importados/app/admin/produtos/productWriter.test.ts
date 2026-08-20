import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mensagemErroCriarProdutoRpc } from '@/lib/adapters/supabase/criarProdutoComEstoqueInicialRpc'

const { captureExceptionMock, captureMessageMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  captureMessageMock: vi.fn(),
}))
vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
  captureMessage: captureMessageMock,
}))
import {
  PRODUCT_ERROR_CODES,
  validateCreateProductCommand,
  type ProductCatalogBasics,
} from '@shared-core/src/products'
import { resolveProductMessage } from './productMessages'
import {
  MSG_RELOAD_POS_CREATE,
  codigoErroPermitido,
  createProductWriter,
  mapCreateProductInputToRpc,
  refAnonima,
} from './productWriter'

const catalogRow: ProductCatalogBasics = {
  id: 'prod-1',
  codigoBarras: '789',
  codigoInterno: 'SKU',
  nome: 'Produto A',
  lojaId: 'loja-1',
  ativo: false,
  statusPublicacao: 'DRAFT',
  precoVarejo: 10,
  precoAtacado: null,
  precoCusto: null,
  categoriaId: null,
  marcaId: null,
  fornecedorId: null,
  imagemUrl: null,
}

describe('productWriter — mapping', () => {
  it('mapCreateProductInputToRpc usa defaults de cadastro humano', () => {
    expect(
      mapCreateProductInputToRpc({
        nome: '  Camiseta  ',
        codigoBarras: ' 789 ',
        precoVarejo: 19.9,
        precoAtacado: 15,
        estoqueInicial: 5,
        clientRequestId: 'req-1',
        categoriaId: 'cat-1',
      }),
    ).toMatchObject({
      nome: 'Camiseta',
      codigo_barras: '789',
      preco_varejo: 19.9,
      preco_atacado: 15,
      estoque_inicial_quantidade: 5,
      client_request_id: 'req-1',
      categoria_id: 'cat-1',
      origem: 'china_manual',
      tem_nf: false,
    })
  })
})

describe('productWriter — validação (codes shared-core)', () => {
  it('rejeita nome curto com code NAME_INVALID', () => {
    expect(
      validateCreateProductCommand({
        input: { nome: 'A', precoVarejo: 1 },
        lojaId: 'l1',
        atorId: 'u1',
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.NAME_INVALID })
  })

  it('rejeita preço negativo com code PRICE_INVALID', () => {
    expect(
      validateCreateProductCommand({
        input: { nome: 'Ok', precoVarejo: -1 },
        lojaId: 'l1',
        atorId: 'u1',
      }),
    ).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.PRICE_INVALID })
  })

  it('rejeita ator ausente', () => {
    expect(
      validateCreateProductCommand({
        input: { nome: 'Ok', precoVarejo: 1 },
        lojaId: 'l1',
        atorId: '',
      }).ok,
    ).toBe(false)
  })
})

describe('createProductWriter', () => {
  beforeEach(() => {
    captureExceptionMock.mockClear()
    captureMessageMock.mockClear()
  })

  it('criação válida: RPC + reload → ProductCatalogBasics', async () => {
    const createRpc = vi.fn(async () => ({
      ok: true as const,
      id: 'prod-1',
      replayed: false,
      estoqueAplicado: true,
    }))
    const getById = vi.fn(async () => ({ ok: true as const, product: catalogRow }))
    const writer = createProductWriter({} as never, { createRpc, reader: { getById } })

    const r = await writer.create({
      input: { nome: 'Produto A', precoVarejo: 10, estoqueInicial: 2 },
      lojaId: 'loja-1',
      atorId: 'user-1',
    })

    expect(r).toEqual({ ok: true, product: catalogRow })
    expect(createRpc).toHaveBeenCalledWith({
      input: expect.objectContaining({
        nome: 'Produto A',
        preco_varejo: 10,
        estoque_inicial_quantidade: 2,
      }),
      atorId: 'user-1',
    })
    expect(getById).toHaveBeenCalledWith('prod-1')
  })

  it('criação válida grava criado_por via UPDATE de acompanhamento, sem reportar ao Sentry', async () => {
    const updateEqMock = vi.fn(async () => ({ error: null }))
    const fromSpy = vi.fn((table: string) => {
      expect(table).toBe('produtos')
      return {
        update: (values: Record<string, unknown>) => ({
          eq: (col: string, val: string) => ({
            is: (guardCol: string, guardVal: null) =>
              updateEqMock(values, col, val, guardCol, guardVal),
          }),
        }),
      }
    })
    const fakeSupabase = { from: fromSpy }
    const createRpc = vi.fn(async () => ({ ok: true as const, id: 'prod-1', replayed: false, estoqueAplicado: true }))
    const getById = vi.fn(async () => ({ ok: true as const, product: catalogRow }))
    const writer = createProductWriter(fakeSupabase as never, { createRpc, reader: { getById } })

    const r = await writer.create({
      input: { nome: 'Produto A', precoVarejo: 10 },
      lojaId: 'loja-1',
      atorId: 'user-1',
    })

    expect(r.ok).toBe(true)
    // A guarda `.is('criado_por', null)` faz parte do contrato: sem ela, um
    // replay reescreveria a autoria original.
    expect(updateEqMock).toHaveBeenCalledWith(
      { criado_por: 'user-1' },
      'id',
      'prod-1',
      'criado_por',
      null,
    )
    expect(captureExceptionMock).not.toHaveBeenCalled()
    expect(captureMessageMock).not.toHaveBeenCalled()
  })

  it('replay (replayed=true) NÃO reescreve criado_por — nenhum UPDATE é emitido', async () => {
    const fromSpy = vi.fn()
    const fakeSupabase = { from: fromSpy }
    // Mesmo client_request_id reenviado, agora por um ator DIFERENTE.
    const createRpc = vi.fn(async () => ({
      ok: true as const,
      id: 'prod-1',
      replayed: true,
      estoqueAplicado: false,
    }))
    const getById = vi.fn(async () => ({ ok: true as const, product: catalogRow }))
    const writer = createProductWriter(fakeSupabase as never, { createRpc, reader: { getById } })

    const r = await writer.create({
      input: { nome: 'Produto A', precoVarejo: 10, clientRequestId: 'req-1' },
      lojaId: 'loja-1',
      atorId: 'outro-usuario',
    })

    expect(r.ok).toBe(true)
    // Nenhuma tentativa de tocar em `produtos`: a autoria original é preservada.
    expect(fromSpy).not.toHaveBeenCalled()
    expect(captureExceptionMock).not.toHaveBeenCalled()
    expect(captureMessageMock).not.toHaveBeenCalled()
  })

  it('UPDATE de acompanhamento falha (erro de banco, ex.: RLS) → cadastro segue ok, mas reporta ao Sentry (não é perda silenciosa)', async () => {
    const fakeSupabase = {
      from: () => ({
        update: () => ({
          eq: () => ({
            is: async () => ({ error: { message: 'permission denied', code: '42501' } }),
          }),
        }),
      }),
    }
    const createRpc = vi.fn(async () => ({ ok: true as const, id: 'prod-1', replayed: false, estoqueAplicado: true }))
    const getById = vi.fn(async () => ({ ok: true as const, product: catalogRow }))
    const writer = createProductWriter(fakeSupabase as never, { createRpc, reader: { getById } })

    const r = await writer.create({
      input: { nome: 'Produto A', precoVarejo: 10 },
      lojaId: 'loja-1',
      atorId: 'user-1',
    })

    expect(r.ok).toBe(true) // create não falha por causa da auditoria
    expect(captureMessageMock).toHaveBeenCalledTimes(1)
    expect(captureMessageMock.mock.calls[0]![0]).toContain('criado_por')

    // ── Payload REDIGIDO ────────────────────────────────────────────────────
    // O evento não pode levar identificadores crus nem a mensagem do banco.
    const payload = captureMessageMock.mock.calls[0]![1] as {
      level: string
      tags: Record<string, unknown>
      extra: Record<string, unknown>
    }
    const serializado = JSON.stringify(payload)

    expect(payload.level).toBe('warning')
    expect(payload.tags.modulo).toBe('produtos-autoria')

    // Identificadores reais NÃO aparecem em lugar nenhum do payload.
    expect(serializado).not.toContain('prod-1')
    expect(serializado).not.toContain('user-1')
    // A mensagem crua do Postgres também não.
    expect(serializado).not.toContain('permission denied')

    // O que aparece é a referência anônima — estável, para correlacionar.
    expect(payload.tags.produto_ref).toBe(refAnonima('prod-1'))
    expect(payload.extra.ator_ref).toBe(refAnonima('user-1'))
    // Código de erro conhecido passa como está; desconhecido vira rótulo.
    expect(payload.extra.dbErrorCode).toBe('42501')
    expect(payload.extra).not.toHaveProperty('dbErrorMessage')
    expect(payload.extra).not.toHaveProperty('atorId')
  })

  it('refAnonima é estável e não vaza o identificador', () => {
    expect(refAnonima('prod-1')).toBe(refAnonima('prod-1'))
    expect(refAnonima('prod-1')).not.toBe(refAnonima('prod-2'))
    expect(refAnonima('prod-1')).not.toContain('prod-1')
    expect(refAnonima(null)).toBe('nulo')
  })

  it('código de erro fora do catálogo não é propagado', () => {
    expect(codigoErroPermitido('23505')).toBe('23505')
    expect(codigoErroPermitido('XX999')).toBe('nao_catalogado')
    expect(codigoErroPermitido(undefined)).toBe('desconhecido')
  })

  it('UPDATE de acompanhamento lança exceção (ex.: rede) → cadastro segue ok, mas reporta ao Sentry', async () => {
    const fakeSupabase = {
      from: () => {
        throw new Error('fetch failed')
      },
    }
    const createRpc = vi.fn(async () => ({ ok: true as const, id: 'prod-1', replayed: false, estoqueAplicado: true }))
    const getById = vi.fn(async () => ({ ok: true as const, product: catalogRow }))
    const writer = createProductWriter(fakeSupabase as never, { createRpc, reader: { getById } })

    const r = await writer.create({
      input: { nome: 'Produto A', precoVarejo: 10 },
      lojaId: 'loja-1',
      atorId: 'user-1',
    })

    expect(r.ok).toBe(true)
    expect(captureExceptionMock).toHaveBeenCalledTimes(1)
  })

  it('erro de validação não chama RPC e emite code', async () => {
    const createRpc = vi.fn()
    const writer = createProductWriter({} as never, {
      createRpc,
      reader: { getById: vi.fn() },
    })

    const r = await writer.create({
      input: { nome: 'X', precoVarejo: 1 },
      lojaId: 'l1',
      atorId: 'u1',
    })

    expect(r).toEqual({
      ok: false,
      code: PRODUCT_ERROR_CODES.NAME_INVALID,
      error: resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.NAME_INVALID),
    })
    expect(createRpc).not.toHaveBeenCalled()
  })

  it('RPC failure preserva mensagem existente', async () => {
    const createRpc = vi.fn(async () => ({
      ok: false as const,
      message: mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO'),
    }))
    const writer = createProductWriter({} as never, {
      createRpc,
      reader: { getById: vi.fn() },
    })

    await expect(
      writer.create({
        input: { nome: 'Dup', precoVarejo: 1, codigoBarras: '111' },
        lojaId: 'l1',
        atorId: 'u1',
      }),
    ).resolves.toEqual({
      ok: false,
      error: mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO'),
    })
  })

  it('falha no reload pós-criação', async () => {
    const createRpc = vi.fn(async () => ({
      ok: true as const,
      id: 'prod-1',
      replayed: false,
      estoqueAplicado: false,
    }))
    const getById = vi.fn(async () => ({
      ok: false as const,
      error: 'not found',
      notFound: true,
    }))
    const writer = createProductWriter({} as never, { createRpc, reader: { getById } })

    await expect(
      writer.create({
        input: { nome: 'Ok', precoVarejo: 1 },
        lojaId: 'l1',
        atorId: 'u1',
      }),
    ).resolves.toEqual({
      ok: false,
      error: MSG_RELOAD_POS_CREATE,
      code: PRODUCT_ERROR_CODES.RELOAD_AFTER_CREATE_FAILED,
    })
  })

  it('exceção da RPC preserva mensagens existentes', async () => {
    const createRpc = vi.fn(async () => {
      throw new Error('CRIAR_PRODUTO_PRECO')
    })
    const writer = createProductWriter({} as never, {
      createRpc,
      reader: { getById: vi.fn() },
    })

    await expect(
      writer.create({
        input: { nome: 'Ok', precoVarejo: 1 },
        lojaId: 'l1',
        atorId: 'u1',
      }),
    ).resolves.toEqual({
      ok: false,
      error: mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_PRECO'),
    })
  })

  it('retorno pós-criação inclui identidade + preços de cadastro', async () => {
    const createRpc = vi.fn(async () => ({
      ok: true as const,
      id: 'prod-1',
      replayed: false,
      estoqueAplicado: false,
    }))
    const getById = vi.fn(async () => ({ ok: true as const, product: catalogRow }))
    const writer = createProductWriter({} as never, { createRpc, reader: { getById } })

    const r = await writer.create({
      input: { nome: 'Produto A', precoVarejo: 10 },
      lojaId: 'loja-1',
      atorId: 'user-1',
    })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.product.id).toBe('prod-1')
    expect(r.product.lojaId).toBe('loja-1')
    expect(r.product.nome).toBe('Produto A')
    expect(r.product.precoVarejo).toBe(10)
    expect(r.product.statusPublicacao).toBe('DRAFT')
  })
})
