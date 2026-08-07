import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regressão da Onda 1 — contrato de busca do PDV no SERVIDOR.
 *
 * O teste do pipeline (`webCaixaScanMultiplos.test.ts`) mocka a server action,
 * então valida a reação da UI, não a decisão. Estas asserções são sobre a
 * decisão em si:
 *
 *  1. código de barras duplicado continua `ambiguo` (erro de cadastro);
 *  2. nome com vários acertos vira `multiplos` (escolha do operador);
 *  3. escolha por id resolve o produto sem passar por busca textual;
 *  4. o estoque exibido sai da MESMA fonte que a finalização usa —
 *     `estoque.quantidade_atual` filtrado por (produto_id, loja_id).
 */

const LOJA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PROD_A = '11111111-1111-4111-8111-111111111111'
const PROD_B = '22222222-2222-4222-8222-222222222222'

type ProdutoRow = Record<string, unknown>

/** Estado que cada teste configura antes de exercitar a busca. */
const cenario = {
  produtosPorCodigo: [] as ProdutoRow[],
  produtosPorNome: [] as ProdutoRow[],
  produtosPorId: [] as ProdutoRow[],
  categorias: [] as { id: string }[],
  produtosPorCategoria: [] as ProdutoRow[],
  /** Chamadas registradas contra a tabela `estoque`, para provar a fonte. */
  leiturasEstoque: [] as { colunas: string; filtros: Record<string, unknown> }[],
  estoque: new Map<string, { quantidade_atual: number; estoque_minimo: number }>(),
}

function produto(id: string, nome: string, codigo: string | null): ProdutoRow {
  return {
    id,
    nome,
    codigo_barras: codigo,
    preco_varejo: 49.9,
    preco_atacado: null,
    categoria_id: null,
    origem: 'china_manual',
    tem_nf: false,
    observacao: null,
    ativo: true,
    status_publicacao: 'PUBLICADO',
  }
}

/**
 * Builder mínimo que imita o encadeamento do supabase-js usado pela impl.
 * Cada `from()` devolve um builder que acumula filtros e resolve conforme a
 * tabela — assim o teste consegue afirmar QUAIS filtros bateram em `estoque`.
 */
function makeBuilder(tabela: string) {
  const filtros: Record<string, unknown> = {}
  let colunas = '*'

  const resolver = () => {
    if (tabela === 'produtos') {
      if ('id' in filtros) return { data: cenario.produtosPorId, error: null }
      if ('codigo_barras' in filtros) return { data: cenario.produtosPorCodigo, error: null }
      if ('categoria_id' in filtros) return { data: cenario.produtosPorCategoria, error: null }
      if ('nome' in filtros) return { data: cenario.produtosPorNome, error: null }
      return { data: [], error: null }
    }
    if (tabela === 'categorias') return { data: cenario.categorias, error: null }
    if (tabela === 'estoque') {
      cenario.leiturasEstoque.push({ colunas, filtros: { ...filtros } })
      const ids = Array.isArray(filtros.produto_id)
        ? (filtros.produto_id as string[])
        : [filtros.produto_id as string]
      const linhas = ids
        .filter((id) => cenario.estoque.has(id))
        .map((id) => ({ produto_id: id, ...cenario.estoque.get(id)! }))
      return { data: linhas, error: null }
    }
    return { data: [], error: null }
  }

  const builder: Record<string, unknown> = {
    select(cols: string) {
      colunas = cols
      return builder
    },
    eq(col: string, val: unknown) {
      filtros[col] = val
      return builder
    },
    in(col: string, val: unknown) {
      filtros[col] = val
      return builder
    },
    ilike(col: string, val: unknown) {
      filtros[col] = val
      return builder
    },
    or() {
      return builder
    },
    limit() {
      return Promise.resolve(resolver())
    },
    maybeSingle() {
      const r = resolver()
      const linhas = (r.data ?? []) as unknown[]
      return Promise.resolve({ data: linhas[0] ?? null, error: null })
    },
    then(onFulfilled: (v: unknown) => unknown) {
      // `estoqueResumoLoteParaCaixa` aguarda direto, sem `.limit()`.
      return Promise.resolve(resolver()).then(onFulfilled)
    },
  }
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: (tabela: string) => makeBuilder(tabela) }),
}))

vi.mock('@/lib/auth/usuarioAtual', () => ({
  getUsuarioAtual: async () => ({
    userId: 'op-1',
    perfil: 'OPERADOR',
    idioma: 'pt',
    lojaId: LOJA,
  }),
}))

vi.mock('@/app/caixa/server/caixaPrecoProduto.impl', () => ({
  calcularPrecoProdutoCaixaImpl: async () => ({ ok: true, preco: 44.9, tipo: 'ATACADO' }),
}))

const { buscarProdutoParaCaixaImpl } = await import('@/app/caixa/server/caixaCatalogo.impl')

beforeEach(() => {
  cenario.produtosPorCodigo = []
  cenario.produtosPorNome = []
  cenario.produtosPorId = []
  cenario.categorias = []
  cenario.produtosPorCategoria = []
  cenario.leiturasEstoque = []
  cenario.estoque = new Map()
})

describe('busca do PDV — separação ambiguo × multiplos', () => {
  it('código de barras batendo em 2 produtos continua ambiguo (NÃO vira seletor)', async () => {
    cenario.produtosPorCodigo = [
      produto(PROD_A, 'Fone Preto', '7891111111111'),
      produto(PROD_B, 'Fone Branco', '7891111111111'),
    ]

    const r = await buscarProdutoParaCaixaImpl('7891111111111')

    expect(r).toMatchObject({ ok: true, status: 'ambiguo' })
    // Regressão do erro de cadastro: se virasse `multiplos`, o operador
    // escolheria um dos dois e o código duplicado nunca seria corrigido.
    expect(r).not.toHaveProperty('produtos')
  })

  it('código de barras único segue resolvendo direto, sem seletor', async () => {
    cenario.produtosPorCodigo = [produto(PROD_A, 'Fone Preto', '7891111111111')]
    cenario.estoque.set(PROD_A, { quantidade_atual: 12, estoque_minimo: 3 })

    const r = await buscarProdutoParaCaixaImpl('7891111111111')

    expect(r).toMatchObject({ ok: true, status: 'encontrado' })
  })

  it('nome batendo em 2 produtos vira multiplos com os candidatos', async () => {
    cenario.produtosPorNome = [
      produto(PROD_A, 'Fone Bluetooth Preto', '789A'),
      produto(PROD_B, 'Fone Bluetooth Branco', null),
    ]
    cenario.estoque.set(PROD_A, { quantidade_atual: 12, estoque_minimo: 3 })

    const r = await buscarProdutoParaCaixaImpl('fone')

    expect(r).toMatchObject({ ok: true, status: 'multiplos' })
    const produtos = (r as { produtos: { id: string }[] }).produtos
    expect(produtos.map((p) => p.id)).toEqual([PROD_A, PROD_B])
  })

  it('escolha por id resolve o produto sem cair na busca textual', async () => {
    cenario.produtosPorId = [produto(PROD_A, 'Fone Bluetooth Preto', '789A')]
    cenario.estoque.set(PROD_A, { quantidade_atual: 7, estoque_minimo: 2 })
    // Se a impl caísse na busca por nome, encontraria estes dois e devolveria
    // `multiplos` — o que deixaria a escolha do operador em loop.
    cenario.produtosPorNome = [
      produto(PROD_A, 'Fone Bluetooth Preto', '789A'),
      produto(PROD_B, 'Fone Bluetooth Branco', null),
    ]

    const r = await buscarProdutoParaCaixaImpl(PROD_A)

    expect(r).toMatchObject({ ok: true, status: 'encontrado' })
    expect((r as { produto: { id: string } }).produto.id).toBe(PROD_A)
  })
})

describe('busca do PDV — fonte do estoque', () => {
  it('candidato e produto único leem a MESMA tabela/coluna/filtro de loja', async () => {
    cenario.produtosPorCodigo = [produto(PROD_A, 'Fone Preto', '789A')]
    cenario.estoque.set(PROD_A, { quantidade_atual: 12, estoque_minimo: 3 })
    await buscarProdutoParaCaixaImpl('789A')
    const leituraUnitaria = cenario.leiturasEstoque.at(-1)!

    cenario.leiturasEstoque = []
    cenario.produtosPorCodigo = []
    cenario.produtosPorNome = [
      produto(PROD_A, 'Fone Bluetooth Preto', '789A'),
      produto(PROD_B, 'Fone Bluetooth Branco', null),
    ]
    await buscarProdutoParaCaixaImpl('fone')
    const leituraLote = cenario.leiturasEstoque.at(-1)!

    // Mesma coluna de saldo e mesmo escopo de loja nos dois caminhos — e é essa
    // a coluna que `decrementar_estoque_seguro` trava com FOR UPDATE.
    expect(leituraUnitaria.colunas).toContain('quantidade_atual')
    expect(leituraLote.colunas).toContain('quantidade_atual')
    expect(leituraUnitaria.filtros.loja_id).toBe(LOJA)
    expect(leituraLote.filtros.loja_id).toBe(LOJA)
  })

  it('estoque do candidato é o saldo real do produto, não do vizinho da lista', async () => {
    cenario.produtosPorNome = [
      produto(PROD_A, 'Fone Bluetooth Preto', '789A'),
      produto(PROD_B, 'Fone Bluetooth Branco', null),
    ]
    cenario.estoque.set(PROD_A, { quantidade_atual: 12, estoque_minimo: 3 })
    cenario.estoque.set(PROD_B, { quantidade_atual: 0, estoque_minimo: 3 })

    const r = await buscarProdutoParaCaixaImpl('fone')
    const produtos = (r as { produtos: { id: string; quantidade_estoque: number | null }[] }).produtos

    expect(produtos.find((p) => p.id === PROD_A)?.quantidade_estoque).toBe(12)
    expect(produtos.find((p) => p.id === PROD_B)?.quantidade_estoque).toBe(0)
  })

  it('candidato sem linha de estoque na loja fica null (não vira zero)', async () => {
    cenario.produtosPorNome = [
      produto(PROD_A, 'Fone Bluetooth Preto', '789A'),
      produto(PROD_B, 'Fone Bluetooth Branco', null),
    ]
    cenario.estoque.set(PROD_A, { quantidade_atual: 12, estoque_minimo: 3 })
    // PROD_B sem linha: "sem controle de estoque" ≠ "esgotado".

    const r = await buscarProdutoParaCaixaImpl('fone')
    const produtos = (r as { produtos: { id: string; quantidade_estoque: number | null }[] }).produtos

    expect(produtos.find((p) => p.id === PROD_B)?.quantidade_estoque).toBeNull()
  })
})
