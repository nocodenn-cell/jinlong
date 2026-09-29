import { describe, expect, it, vi } from 'vitest'
import { PRODUCT_ERROR_CODES } from '@shared-core/src/products'
import {
  MSG_PRODUTO_NAO_ENCONTRADO,
  PRODUTOS_PAGE_SIZE,
  createProductReader,
  mapProdutoCatalog,
  mapProdutoIdentity,
  normalizeStatusPublicacao,
  type ProdutoRow,
} from './productReader'

function baseRow(over: Partial<ProdutoRow> = {}): ProdutoRow {
  return {
    id: 'p1',
    nome: 'Camiseta',
    codigo_barras: '789100',
    codigo_interno: 'SKU-1',
    loja_id: 'loja-1',
    ativo: true,
    status_publicacao: 'PUBLICADO',
    preco_varejo: '19.90',
    preco_atacado: '15',
    preco_custo: null,
    categoria_id: 'cat-1',
    marca_id: null,
    fornecedor_id: 'for-1',
    imagem_url: 'https://img/x.png',
    ...over,
  }
}

/** Mock mínimo de query builder encadeável. */
function mockQuery(result: { data: unknown; error: unknown }) {
  const qb: Record<string, unknown> = {}
  const self = () => qb
  qb.select = vi.fn(self)
  qb.eq = vi.fn(self)
  qb.order = vi.fn(self)
  qb.range = vi.fn(self)
  qb.or = vi.fn(self)
  qb.in = vi.fn(self)
  qb.maybeSingle = vi.fn(async () => result)
  qb.then = undefined
  // Thenable para `await qb` em listPaginados
  Object.assign(qb, {
    then(onFulfilled: (v: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled)
    },
  })
  return qb
}

const baseFilteredQuery = {
  lojaId: 'loja-1',
  situacao: 'todos' as const,
  origem: 'all' as const,
  nf: 'all' as const,
  estoque: 'todos' as const,
  imagens: 'todos' as const,
  tags: [] as string[],
  busca: '',
  page: 1,
  pageSize: 20,
}

describe('productReader — mapping', () => {
  it('mantém page size padrão', () => {
    expect(PRODUTOS_PAGE_SIZE).toBe(20)
  })

  it('exporta MSG_PRODUTO_NAO_ENCONTRADO para compat', () => {
    expect(MSG_PRODUTO_NAO_ENCONTRADO).toBe('Produto não encontrado.')
  })

  it('normalizeStatusPublicacao aceita enums e fallback DRAFT', () => {
    expect(normalizeStatusPublicacao('PUBLICADO')).toBe('PUBLICADO')
    expect(normalizeStatusPublicacao('INATIVO')).toBe('INATIVO')
    expect(normalizeStatusPublicacao('DRAFT')).toBe('DRAFT')
    expect(normalizeStatusPublicacao('lixo')).toBe('DRAFT')
    expect(normalizeStatusPublicacao(null)).toBe('DRAFT')
  })

  it('mapProdutoIdentity não inclui preços nem estoque', () => {
    expect(mapProdutoIdentity(baseRow())).toEqual({
      id: 'p1',
      codigoBarras: '789100',
      codigoInterno: 'SKU-1',
      nome: 'Camiseta',
      lojaId: 'loja-1',
      ativo: true,
      statusPublicacao: 'PUBLICADO',
    })
  })

  it('mapProdutoCatalog mapeia preços de cadastro (não efetivo)', () => {
    expect(mapProdutoCatalog(baseRow())).toEqual({
      id: 'p1',
      codigoBarras: '789100',
      codigoInterno: 'SKU-1',
      nome: 'Camiseta',
      lojaId: 'loja-1',
      ativo: true,
      statusPublicacao: 'PUBLICADO',
      precoVarejo: 19.9,
      precoAtacado: 15,
      precoCusto: null,
      categoriaId: 'cat-1',
      marcaId: null,
      fornecedorId: 'for-1',
      imagemUrl: 'https://img/x.png',
    })
  })
})

describe('productReader — getById inexistente', () => {
  it('retorna NOT_FOUND quando maybeSingle não acha linha', async () => {
    const qb = mockQuery({ data: null, error: null })
    const supabase = { from: vi.fn(() => qb) } as never
    const reader = createProductReader(supabase)

    await expect(reader.getById('missing')).resolves.toEqual({
      ok: false,
      error: PRODUCT_ERROR_CODES.NOT_FOUND,
      code: PRODUCT_ERROR_CODES.NOT_FOUND,
      notFound: true,
    })
  })

  it('marca notFound + code em erro PGRST116', async () => {
    const qb = mockQuery({
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    })
    const supabase = { from: vi.fn(() => qb) } as never
    const reader = createProductReader(supabase)

    const r = await reader.getById('x')
    expect(r).toEqual({
      ok: false,
      error: PRODUCT_ERROR_CODES.NOT_FOUND,
      code: PRODUCT_ERROR_CODES.NOT_FOUND,
      notFound: true,
    })
  })
})

describe('productReader — paginação', () => {
  it('listPaginados sinaliza hasMore quando há pageSize+1 linhas', async () => {
    const rows = Array.from({ length: PRODUTOS_PAGE_SIZE + 1 }, (_, i) =>
      baseRow({ id: `p${i}`, nome: `Item ${i}` }),
    )
    const qb = mockQuery({ data: rows, error: null })
    const supabase = { from: vi.fn(() => qb) } as never
    const reader = createProductReader(supabase)

    const r = await reader.listPaginados({ lojaId: 'loja-1', page: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.hasMore).toBe(true)
    expect(r.products).toHaveLength(PRODUTOS_PAGE_SIZE)
    expect(r.products[0]).not.toHaveProperty('saldo')
    expect(r.products[0]).not.toHaveProperty('quantidade_atual')
  })

  it('listPaginados hasMore=false na última página', async () => {
    const qb = mockQuery({ data: [baseRow()], error: null })
    const supabase = { from: vi.fn(() => qb) } as never
    const reader = createProductReader(supabase)

    const r = await reader.listPaginados({ lojaId: 'loja-1', page: 1, pageSize: 20 })
    expect(r).toEqual({
      ok: true,
      hasMore: false,
      products: [mapProdutoCatalog(baseRow())],
    })
  })

  it('listPaginados retorna LIST_FAILED em erro de query', async () => {
    const qb = mockQuery({ data: null, error: { message: 'db down' } })
    const supabase = { from: vi.fn(() => qb) } as never
    const reader = createProductReader(supabase)

    await expect(reader.listPaginados({ lojaId: 'loja-1', page: 1 })).resolves.toEqual({
      ok: false,
      error: 'db down',
      code: PRODUCT_ERROR_CODES.LIST_FAILED,
    })
  })
})

describe('productReader — listComFiltros', () => {
  it('RPC sucesso mapeia rows camelCase + total com estoque', async () => {
    const rpcRow = {
      id: 'p1',
      nome: 'Camiseta',
      codigo_barras: '789100',
      preco_varejo: 19.9,
      // Colunas LEGADO de `produtos`: divergem de propósito das faixas — a listagem
      // não pode usá-las (a autoridade do atacado é `precos_atacado`).
      preco_atacado: 99,
      quantidade_gatilho_atacado: 3,
      origem: 'china_manual',
      tem_nf: false,
      ativo: true,
      categoria_id: 'cat-1',
      fornecedor_id: 'for-1',
      marca_id: null,
      unidade_medida: 'UN',
      observacao: null,
      imagem_url: 'https://img/x.png',
      tags: ['promo'],
      total_count: 42,
      ncm: '61091000',
      cfop_produto: null,
      csosn: null,
      cest: null,
      cst_pis: null,
      cst_cofins: null,
    }
    const estoqueQb = mockQuery({
      data: [{ produto_id: 'p1', quantidade_atual: 5, estoque_minimo: 2 }],
      error: null,
    })
    const extraQb = mockQuery({
      data: [
        {
          id: 'p1',
          codigo_interno: 'SKU-1',
          referencia_fornecedor: 'REF-9',
          nome_reduzido_pdv: 'Camis',
          localizacao_prateleira: 'A1',
          preco_custo: 8,
          preco_custo_medio: 8.5,
          permitir_abaixo_custo: false,
          status_publicacao: 'PUBLICADO',
        },
      ],
      error: null,
    })
    const faixasQb = mockQuery({
      data: [
        { produto_id: 'p1', quantidade_minima: 30, preco_unitario: 12, loja_id: null },
        { produto_id: 'p1', quantidade_minima: 10, preco_unitario: 15, loja_id: null },
        // faixa de outra loja e faixa de outro produto não entram
        { produto_id: 'p1', quantidade_minima: 5, preco_unitario: 17, loja_id: 'loja-2' },
        { produto_id: 'p9', quantidade_minima: 2, preco_unitario: 1, loja_id: null },
      ],
      error: null,
    })
    const from = vi.fn((table: string) =>
      table === 'estoque' ? estoqueQb : table === 'precos_atacado' ? faixasQb : extraQb,
    )
    const rpc = vi.fn(async () => ({ data: [rpcRow], error: null }))
    const supabase = { from, rpc } as never
    const reader = createProductReader(supabase)

    const r = await reader.listComFiltros(baseFilteredQuery)
    expect(rpc).toHaveBeenCalledWith(
      'list_produtos_gerente_filtrados',
      expect.objectContaining({
        p_loja_id: 'loja-1',
        p_page: 1,
        p_page_size: 20,
      }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.total).toBe(42)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({
      id: 'p1',
      nome: 'Camiseta',
      codigoBarras: '789100',
      codigoInterno: 'SKU-1',
      referenciaFornecedor: 'REF-9',
      nomeReduzidoPdv: 'Camis',
      localizacaoPrateleira: 'A1',
      precoVarejo: 19.9,
      precoAtacado: 15,
      precoCusto: 8,
      precoCustoMedio: 8.5,
      quantidadeAtual: 5,
      estoqueMinimo: 2,
      quantidadeGatilhoAtacado: 10,
      atacadoFaixasAdicionais: 1,
      origem: 'china_manual',
      temNf: false,
      ativo: true,
      statusPublicacao: 'PUBLICADO',
      imagemUrl: 'https://img/x.png',
      categoriaId: 'cat-1',
      fornecedorId: 'for-1',
      unidadeMedida: 'UN',
      tags: ['promo'],
      ncm: '61091000',
      cfopProduto: null,
      cstPis: null,
      cstCofins: null,
    })
    expect(r.rows[0]).not.toHaveProperty('codigo_barras')
    expect(r.rows[0]).not.toHaveProperty('quantidade_atual')
  })

  it('RPC erro retorna LIST_FAILED', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'function missing' },
    }))
    const supabase = { from: vi.fn(), rpc } as never
    const reader = createProductReader(supabase)

    await expect(reader.listComFiltros(baseFilteredQuery)).resolves.toEqual({
      ok: false,
      error: 'function missing',
      code: PRODUCT_ERROR_CODES.LIST_FAILED,
    })
  })
})
