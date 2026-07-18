import { describe, expect, it, expectTypeOf } from 'vitest'
import type {
  CreateProductCommand,
  CreateProductInput,
  ProductCatalogBasics,
  ProductExclusionFacts,
  ProductExclusionService,
  ProductId,
  ProductIdentity,
  ProductPriceReader,
  ProductReader,
  ProductUpdater,
  ProductWriter,
  ResolveProductPriceQuery,
  ResolveProductPriceResult,
  StatusPublicacao,
  UpdateProductCommand,
  UpdateProductInput,
} from './index'
import {
  decideProductExclusion,
  PRODUCT_ERROR_CODES,
  validateCreateProductCommand,
} from './index'

describe('products scaffold — types (Products 2)', () => {
  it('ProductIdentity exige id, códigos e status', () => {
    const identity: ProductIdentity = {
      id: 'p1',
      codigoBarras: '789',
      codigoInterno: null,
      nome: 'Item',
      lojaId: 'l1',
      ativo: true,
      statusPublicacao: 'PUBLICADO',
    }
    expect(identity.id).toBe('p1')
    expectTypeOf(identity.id).toEqualTypeOf<ProductId>()
    expectTypeOf(identity.statusPublicacao).toEqualTypeOf<StatusPublicacao>()
  })

  it('ProductCatalogBasics estende identidade com preços de cadastro', () => {
    const row: ProductCatalogBasics = {
      id: 'p1',
      codigoBarras: null,
      codigoInterno: 'SKU-1',
      nome: 'Item',
      lojaId: 'l1',
      ativo: true,
      statusPublicacao: 'DRAFT',
      precoVarejo: 10,
      precoAtacado: 8,
      precoCusto: 5,
      categoriaId: null,
      marcaId: null,
      fornecedorId: null,
      imagemUrl: null,
    }
    expect(row.precoVarejo).toBe(10)
    expectTypeOf(row).toExtend<ProductIdentity>()
  })

  it('CreateProductInput aceita estoqueInicial sem impor cálculo de preço', () => {
    const input: CreateProductInput = {
      nome: 'Novo',
      precoVarejo: 1,
      estoqueInicial: 3,
      clientRequestId: 'req-1',
    }
    expect(input.estoqueInicial).toBe(3)
  })

  it('UpdateProductInput é catálogo — sem estoqueInicial', () => {
    const input: UpdateProductInput = {
      nome: 'Editado',
      precoVarejo: 12,
      statusPublicacao: 'PUBLICADO',
    }
    expect(input.nome).toBe('Editado')
    expect(input).not.toHaveProperty('estoqueInicial')
    expectTypeOf(input.statusPublicacao).toEqualTypeOf<StatusPublicacao | undefined>()
  })
})

describe('products scaffold — contracts (Products 2)', () => {
  it('ProductReader expõe getById, getIdentityById, listPaginados e listComFiltros', () => {
    const reader: ProductReader = {
      async getById() {
        return { ok: false, error: 'not wired', notFound: true }
      },
      async getIdentityById() {
        return { ok: false, error: 'not wired', notFound: true }
      },
      async listPaginados() {
        return { ok: true, products: [], hasMore: false }
      },
      async listComFiltros() {
        return { ok: true, rows: [], total: 0 }
      },
    }
    expectTypeOf(reader.getById).toBeFunction()
    expectTypeOf(reader.getIdentityById).toBeFunction()
    expectTypeOf(reader.listPaginados).toBeFunction()
    expectTypeOf(reader.listComFiltros).toBeFunction()
  })

  it('ProductPriceReader só consulta — sem método de cálculo', async () => {
    const query: ResolveProductPriceQuery = {
      produtoId: 'p1',
      quantidade: 2,
      lojaId: 'l1',
    }
    const priceReader: ProductPriceReader = {
      async resolveEffectivePrice(): Promise<ResolveProductPriceResult> {
        return {
          ok: true,
          price: { preco: 9.9, tipo: 'VAREJO', fonte: 'varejo' },
        }
      },
    }
    const r = await priceReader.resolveEffectivePrice(query)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.price.fonte).toBe('varejo')
    }
    // Port surface: apenas resolveEffectivePrice (consulta).
    expect(Object.keys(priceReader)).toEqual(['resolveEffectivePrice'])
  })

  it('ProductWriter.create tipa comando e resultado (RPC 270 na borda)', async () => {
    const command: CreateProductCommand = {
      input: { nome: 'X', precoVarejo: 1 },
      lojaId: 'l1',
      atorId: 'u1',
    }
    const writer: ProductWriter = {
      async create() {
        return { ok: false, error: 'not wired' }
      },
    }
    await expect(writer.create(command)).resolves.toEqual({
      ok: false,
      error: 'not wired',
    })
  })

  it('ProductUpdater.update tipa comando e ProductCatalogBasics', async () => {
    const command: UpdateProductCommand = {
      id: 'p1',
      lojaId: 'l1',
      input: { nome: 'Y', precoVarejo: 2 },
    }
    const updater: ProductUpdater = {
      async update() {
        return { ok: false, error: 'not wired', notFound: true }
      },
      async updateCategoriaLote() {
        return { ok: true, atualizados: 0 }
      },
    }
    await expect(updater.update(command)).resolves.toEqual({
      ok: false,
      error: 'not wired',
      notFound: true,
    })
  })

  it('ProductExclusionService.exclude tipa outcome e NOT_FOUND', async () => {
    const svc: ProductExclusionService = {
      async exclude() {
        return {
          ok: false,
          error: 'Produto não encontrado.',
          code: PRODUCT_ERROR_CODES.NOT_FOUND,
          notFound: true,
        }
      },
    }
    await expect(svc.exclude('x')).resolves.toMatchObject({
      ok: false,
      code: PRODUCT_ERROR_CODES.NOT_FOUND,
    })
  })

  it('decideProductExclusion exportado no barrel — delete quando limpo', () => {
    const f: ProductExclusionFacts = {
      ativo: true,
      temItensVenda: false,
      temRemessaItens: false,
      temMovimentosEstoque: false,
      temReposicoesCancelamento: false,
      temSaldoEstoque: false,
    }
    expect(decideProductExclusion(f)).toEqual({ action: 'delete' })
  })

  it('validateCreateProductCommand emite só code (sem PT)', () => {
    const r = validateCreateProductCommand({
      input: { nome: 'X', precoVarejo: 1 },
      lojaId: 'l1',
      atorId: 'u1',
    })
    expect(r).toEqual({ ok: false, code: PRODUCT_ERROR_CODES.NAME_INVALID })
    expect(r).not.toHaveProperty('error')
  })
})

describe('products scaffold — barrel exports', () => {
  it('reexporta policy/codes sem side effects de Supabase', async () => {
    const mod = await import('./index')
    expect(mod).toBeDefined()
    expect(mod.decideProductExclusion).toBeTypeOf('function')
    expect(mod.PRODUCT_ERROR_CODES.NOT_FOUND).toBe('PRODUCT_NOT_FOUND')
  })
})
