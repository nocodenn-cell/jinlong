/**
 * Adapter de leitura — ProductReader (Missão Products 3/10 / ADR-007).
 * Lê `produtos`; `listComFiltros` faz read-through de estoque (snapshot).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PRODUCT_ERROR_CODES,
  type ListProductsFilteredQuery,
  type ListProductsFilteredResult,
  type ListProductsQuery,
  type ListProductsResult,
  type ProductByIdResult,
  type ProductCatalogBasics,
  type ProductIdentity,
  type ProductIdentityResult,
  type ProductListFilteredRow,
  type ProductReader,
  type StatusPublicacao,
} from '@shared-core/src/products'
import {
  resolveStatusPublicacaoLeitura,
  statusFromAtivoLegacy,
} from '@/core/catalog/statusPublicacao'

export const PRODUTOS_PAGE_SIZE = 20

/** @deprecated Preferir PRODUCT_ERROR_CODES.NOT_FOUND + productMessages. */
export const MSG_PRODUTO_NAO_ENCONTRADO = 'Produto não encontrado.'

const PRODUTO_COLS =
  'id, nome, codigo_barras, codigo_interno, loja_id, ativo, status_publicacao, preco_varejo, preco_atacado, preco_custo, categoria_id, marca_id, fornecedor_id, imagem_url'

const EXTRA_PRODUTO_COLS =
  'id, codigo_interno, referencia_fornecedor, nome_reduzido_pdv, localizacao_prateleira, preco_custo, preco_custo_medio, permitir_abaixo_custo, status_publicacao'

/** Linha mínima de `produtos` para o map de domínio. */
export type ProdutoRow = {
  id: string
  nome: string
  codigo_barras: string | null
  codigo_interno: string | null
  loja_id: string
  ativo: boolean
  status_publicacao: string | null
  preco_varejo: number | string
  preco_atacado: number | string | null
  preco_custo: number | string | null
  categoria_id: string | null
  marca_id: string | null
  fornecedor_id: string | null
  imagem_url: string | null
}

type RpcProdutoFilteredRow = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number
  preco_atacado: number | null
  quantidade_gatilho_atacado: number | null
  origem: string
  tem_nf: boolean
  ativo: boolean
  categoria_id: string | null
  fornecedor_id: string | null
  marca_id: string | null
  unidade_medida: string | null
  observacao: string | null
  imagem_url: string | null
  tags: string[] | null
  total_count: number
  ncm: string | null
  cfop_produto: string | null
  csosn: string | null
  cest: string | null
  cst_pis: string | null
  cst_cofins: string | null
  icms_origem: string | null
}

type EstoqueSnap = { quantidade_atual: number; estoque_minimo: number }

type ExtraProdutoSnap = {
  codigo_interno: string | null
  referencia_fornecedor: string | null
  nome_reduzido_pdv: string | null
  localizacao_prateleira: string | null
  preco_custo: number | null
  preco_custo_medio: number
  permitir_abaixo_custo: boolean
  status_publicacao: StatusPublicacao | null
}

const STATUS_OK = new Set<StatusPublicacao>(['DRAFT', 'PUBLICADO', 'INATIVO'])

export function normalizeStatusPublicacao(raw: string | null | undefined): StatusPublicacao {
  if (raw && STATUS_OK.has(raw as StatusPublicacao)) return raw as StatusPublicacao
  return 'DRAFT'
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Mapeia linha SQL → identidade (sem preços de cadastro). */
export function mapProdutoIdentity(r: ProdutoRow): ProductIdentity {
  return {
    id: r.id,
    codigoBarras: r.codigo_barras,
    codigoInterno: r.codigo_interno,
    nome: r.nome,
    lojaId: r.loja_id,
    ativo: r.ativo === true,
    statusPublicacao: normalizeStatusPublicacao(r.status_publicacao),
  }
}

/** Mapeia linha SQL → catálogo básico (preços de cadastro; não efetivo). */
export function mapProdutoCatalog(r: ProdutoRow): ProductCatalogBasics {
  return {
    ...mapProdutoIdentity(r),
    precoVarejo: Number(r.preco_varejo ?? 0),
    precoAtacado: toNullableNumber(r.preco_atacado),
    precoCusto: toNullableNumber(r.preco_custo),
    categoriaId: r.categoria_id,
    marcaId: r.marca_id,
    fornecedorId: r.fornecedor_id,
    imagemUrl: r.imagem_url,
  }
}

function buildSearchOrFilter(termo: string): string {
  const t = termo.trim()
  const digits = t.replace(/\D/g, '')
  const ors = [`nome.ilike.%${t}%`, `codigo_interno.ilike.%${t}%`]
  if (digits) ors.push(`codigo_barras.like.%${digits}%`)
  return ors.join(',')
}

function slicePage(
  rows: ProductCatalogBasics[],
  pageSize: number,
): { products: ProductCatalogBasics[]; hasMore: boolean } {
  const hasMore = rows.length > pageSize
  return { products: hasMore ? rows.slice(0, pageSize) : rows, hasMore }
}

function isNotFoundError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === 'PGRST116') return true
  return (error.message ?? '').toLowerCase().includes('0 rows')
}

function notFoundResult(): Extract<ProductByIdResult, { ok: false }> {
  return {
    ok: false,
    error: PRODUCT_ERROR_CODES.NOT_FOUND,
    code: PRODUCT_ERROR_CODES.NOT_FOUND,
    notFound: true,
  }
}

function listFailed(message?: string): Extract<ListProductsResult, { ok: false }> {
  return {
    ok: false,
    error: message || PRODUCT_ERROR_CODES.LIST_FAILED,
    code: PRODUCT_ERROR_CODES.LIST_FAILED,
  }
}

function filteredListFailed(
  message?: string,
): Extract<ListProductsFilteredResult, { ok: false }> {
  return {
    ok: false,
    error: message || PRODUCT_ERROR_CODES.LIST_FAILED,
    code: PRODUCT_ERROR_CODES.LIST_FAILED,
  }
}

function buildEstoqueMap(
  rows: { produto_id: string; quantidade_atual: number; estoque_minimo: number }[],
): Map<string, EstoqueSnap> {
  const map = new Map<string, EstoqueSnap>()
  for (const e of rows) {
    map.set(e.produto_id, {
      quantidade_atual: e.quantidade_atual,
      estoque_minimo: e.estoque_minimo,
    })
  }
  return map
}

function buildExtraMap(
  rows: {
    id: string
    codigo_interno?: string | null
    referencia_fornecedor?: string | null
    nome_reduzido_pdv?: string | null
    localizacao_prateleira?: string | null
    preco_custo?: number | null
    preco_custo_medio?: number | null
    permitir_abaixo_custo?: boolean
    status_publicacao?: StatusPublicacao | null
  }[],
): Map<string, ExtraProdutoSnap> {
  const map = new Map<string, ExtraProdutoSnap>()
  for (const p of rows) {
    map.set(p.id, {
      codigo_interno: p.codigo_interno ?? null,
      referencia_fornecedor: p.referencia_fornecedor ?? null,
      nome_reduzido_pdv: p.nome_reduzido_pdv ?? null,
      localizacao_prateleira: p.localizacao_prateleira ?? null,
      preco_custo: p.preco_custo != null ? Number(p.preco_custo) : null,
      preco_custo_medio: p.preco_custo_medio != null ? Number(p.preco_custo_medio) : 0,
      permitir_abaixo_custo: p.permitir_abaixo_custo ?? false,
      status_publicacao: p.status_publicacao ?? null,
    })
  }
  return map
}

function mapFilteredRow(
  r: RpcProdutoFilteredRow,
  extra: ExtraProdutoSnap | undefined,
  estoque: EstoqueSnap | undefined,
): ProductListFilteredRow {
  const statusPublicacao = resolveStatusPublicacaoLeitura(
    extra?.status_publicacao ?? statusFromAtivoLegacy(r.ativo),
    r.ativo,
  )
  return {
    id: r.id,
    nome: r.nome,
    codigoBarras: r.codigo_barras,
    codigoInterno: extra?.codigo_interno ?? null,
    referenciaFornecedor: extra?.referencia_fornecedor ?? null,
    nomeReduzidoPdv: extra?.nome_reduzido_pdv ?? null,
    localizacaoPrateleira: extra?.localizacao_prateleira ?? null,
    precoVarejo: Number(r.preco_varejo),
    precoAtacado: r.preco_atacado != null ? Number(r.preco_atacado) : null,
    precoCusto: extra?.preco_custo ?? null,
    precoCustoMedio: extra?.preco_custo_medio ?? 0,
    estoqueMinimo: estoque?.estoque_minimo ?? null,
    permitirAbaixoCusto: extra?.permitir_abaixo_custo ?? false,
    quantidadeGatilhoAtacado:
      r.quantidade_gatilho_atacado != null ? Number(r.quantidade_gatilho_atacado) : null,
    quantidadeAtual: estoque?.quantidade_atual ?? null,
    origem: r.origem,
    temNf: r.tem_nf,
    ativo: r.ativo,
    statusPublicacao,
    imagemUrl: r.imagem_url ?? null,
    categoriaId: r.categoria_id ?? null,
    marcaId: r.marca_id ?? null,
    fornecedorId: r.fornecedor_id ?? null,
    unidadeMedida: r.unidade_medida ?? 'UN',
    observacao: r.observacao ?? null,
    tags: r.tags ?? null,
    ncm: r.ncm ?? null,
    cfopProduto: r.cfop_produto ?? null,
    csosn: r.csosn ?? null,
    cest: r.cest ?? null,
    cstPis: r.cst_pis ?? null,
    cstCofins: r.cst_cofins ?? null,
    // Onda C2.6 / Hotfix C2.8 (20260902150000): a RPC list_produtos_gerente_filtrados
    // já devolve os 7 campos fiscais no RETURNS TABLE — gap antigo fechado.
    icmsOrigem: r.icms_origem ?? null,
  }
}

async function loadFilteredSupplements(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<{
  estoqueMap: Map<string, EstoqueSnap>
  extraMap: Map<string, ExtraProdutoSnap>
}> {
  if (productIds.length === 0) {
    return { estoqueMap: new Map(), extraMap: new Map() }
  }
  const [estoqueRes, extraRes] = await Promise.all([
    supabase
      .from('estoque')
      .select('produto_id, quantidade_atual, estoque_minimo')
      .in('produto_id', productIds),
    supabase.from('produtos').select(EXTRA_PRODUTO_COLS).in('id', productIds),
  ])
  return {
    estoqueMap: buildEstoqueMap(
      (estoqueRes.data ?? []) as {
        produto_id: string
        quantidade_atual: number
        estoque_minimo: number
      }[],
    ),
    extraMap: buildExtraMap((extraRes.data ?? []) as Parameters<typeof buildExtraMap>[0]),
  }
}

async function listComFiltrosImpl(
  supabase: SupabaseClient,
  query: ListProductsFilteredQuery,
): Promise<ListProductsFilteredResult> {
  try {
    const { data, error } = await supabase.rpc('list_produtos_gerente_filtrados', {
      p_loja_id: query.lojaId,
      p_situacao: query.situacao,
      p_origem_filtro: query.origem,
      p_nf_filtro: query.nf,
      p_estoque_filtro: query.estoque,
      p_imagens_filtro: query.imagens,
      p_tags_filtro: query.tags.length ? query.tags : null,
      p_categoria_id: query.categoriaId ?? null,
      p_marca_id: query.marcaId ?? null,
      p_fornecedor_id: query.fornecedorId ?? null,
      p_busca: query.busca?.trim() || null,
      p_page: query.page,
      p_page_size: query.pageSize,
    })

    if (error) return filteredListFailed(error.message)

    const list = (data ?? []) as RpcProdutoFilteredRow[]
    const total = list.length > 0 ? Number(list[0].total_count) : 0
    const { estoqueMap, extraMap } = await loadFilteredSupplements(
      supabase,
      list.map((r) => r.id),
    )
    const rows = list.map((r) => mapFilteredRow(r, extraMap.get(r.id), estoqueMap.get(r.id)))
    return { ok: true, rows, total }
  } catch (e) {
    return filteredListFailed(e instanceof Error ? e.message : undefined)
  }
}

const PRODUTO_FILTRADO_COLS =
  'id, nome, codigo_barras, preco_varejo, preco_atacado, quantidade_gatilho_atacado, origem, tem_nf, ativo, categoria_id, fornecedor_id, marca_id, unidade_medida, observacao, imagem_url, tags, ncm, cfop_produto, csosn, cest, cst_pis, cst_cofins, icms_origem'

/**
 * Busca um produto por id no MESMO formato que `listComFiltros` devolve
 * (`ProductListFilteredRow`) — reaproveita `mapFilteredRow`/
 * `loadFilteredSupplements` em vez de duplicar o mapeamento.
 *
 * `list_produtos_gerente_filtrados` (a RPC por trás de `listComFiltros`) não
 * aceita busca por id — só paginação/filtro. Sem alterar a RPC, o caminho
 * correto para "1 produto completo" é ler `produtos` direto com as MESMAS
 * colunas que a RPC devolve e reaproveitar o mapeador existente, não recriar
 * um segundo mapeamento de campo a campo. Usada pela página de Cadastro
 * Completo (`/admin/catalogo/[id]/completo`) para hidratar o formulário.
 */
export async function buscarProdutoFiltradoPorId(
  supabase: SupabaseClient,
  id: string,
  lojaId: string,
): Promise<ProductListFilteredRow | null> {
  const { data, error } = await supabase
    .from('produtos')
    .select(PRODUTO_FILTRADO_COLS)
    .eq('id', id)
    .eq('loja_id', lojaId)
    .maybeSingle()

  if (error || !data) return null

  const row = data as unknown as Omit<RpcProdutoFilteredRow, 'total_count'>
  const { estoqueMap, extraMap } = await loadFilteredSupplements(supabase, [id])
  return mapFilteredRow({ ...row, total_count: 0 }, extraMap.get(id), estoqueMap.get(id))
}

/**
 * Factory — implementa `ProductReader` contra tabela `produtos`.
 */
export function createProductReader(supabase: SupabaseClient): ProductReader {
  return {
    async getById(id): Promise<ProductByIdResult> {
      try {
        const { data, error } = await supabase
          .from('produtos')
          .select(PRODUTO_COLS)
          .eq('id', id)
          .maybeSingle()

        if (error) {
          if (isNotFoundError(error)) return notFoundResult()
          return { ok: false, error: error.message }
        }
        if (!data) return notFoundResult()
        return { ok: true, product: mapProdutoCatalog(data as ProdutoRow) }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : PRODUCT_ERROR_CODES.UNKNOWN,
          code: PRODUCT_ERROR_CODES.UNKNOWN,
        }
      }
    },

    async getIdentityById(id): Promise<ProductIdentityResult> {
      try {
        const { data, error } = await supabase
          .from('produtos')
          .select(
            'id, nome, codigo_barras, codigo_interno, loja_id, ativo, status_publicacao',
          )
          .eq('id', id)
          .maybeSingle()

        if (error) {
          if (isNotFoundError(error)) return notFoundResult()
          return { ok: false, error: error.message }
        }
        if (!data) return notFoundResult()
        const row = data as Pick<
          ProdutoRow,
          | 'id'
          | 'nome'
          | 'codigo_barras'
          | 'codigo_interno'
          | 'loja_id'
          | 'ativo'
          | 'status_publicacao'
        >
        return {
          ok: true,
          identity: mapProdutoIdentity({
            ...row,
            preco_varejo: 0,
            preco_atacado: null,
            preco_custo: null,
            categoria_id: null,
            marca_id: null,
            fornecedor_id: null,
            imagem_url: null,
          }),
        }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : PRODUCT_ERROR_CODES.UNKNOWN,
          code: PRODUCT_ERROR_CODES.UNKNOWN,
        }
      }
    },

    async listPaginados(query: ListProductsQuery): Promise<ListProductsResult> {
      try {
        const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : PRODUTOS_PAGE_SIZE
        const page = Math.max(1, query.page)
        const from = (page - 1) * pageSize
        const to = from + pageSize

        let qb = supabase
          .from('produtos')
          .select(PRODUTO_COLS)
          .eq('loja_id', query.lojaId)
          .order('nome', { ascending: true })
          .range(from, to)

        const termo = query.termo?.trim()
        if (termo) qb = qb.or(buildSearchOrFilter(termo))

        const { data, error } = await qb
        if (error) return listFailed(error.message)

        const rows = ((data ?? []) as ProdutoRow[]).map(mapProdutoCatalog)
        return { ok: true, ...slicePage(rows, pageSize) }
      } catch (e) {
        return listFailed(e instanceof Error ? e.message : undefined)
      }
    },

    listComFiltros(query) {
      return listComFiltrosImpl(supabase, query)
    },
  }
}
