import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Onda 2 — Bloco 1 (busca ambígua do PDV).
 *
 * Cenário do enunciado: operador digita "cadeira v" com produtos cadastrados
 * Cadeira Vermelha / Cadeira Verde / Cadeira Vermelha Grande / Cadeira Vermelha
 * Infantil / Cadeira Azul. Antes desta mudança, `status: 'ambiguo'` só devolvia
 * uma mensagem genérica — o operador tinha que adivinhar ou digitar mais.
 * Agora a lista de candidatos vem junto, ordenada por nome, sem estourar o
 * limite antigo de 3 (que cortaria silenciosamente um 4º candidato real).
 */

const getUsuarioAtual = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/usuarioAtual', () => ({ getUsuarioAtual }))

type Row = {
  id: string
  nome: string
  codigo_barras: string | null
  codigo_interno: string | null
  preco_varejo: number
  preco_atacado: number | null
  categoria_id: string | null
  origem: 'brasil_nf'
  tem_nf: boolean
  observacao: string | null
  ativo: boolean
  status_publicacao: string
}

function produto(over: Partial<Row> & { id: string; nome: string }): Row {
  return {
    codigo_barras: null,
    codigo_interno: null,
    preco_varejo: 100,
    preco_atacado: null,
    categoria_id: null,
    origem: 'brasil_nf',
    tem_nf: true,
    observacao: null,
    ativo: true,
    status_publicacao: 'PUBLICADO',
    ...over,
  }
}

const CADEIRA_VERMELHA = produto({ id: 'p-verm', nome: 'Cadeira Vermelha', codigo_barras: '7891000000001', preco_varejo: 150 })
const CADEIRA_VERDE = produto({ id: 'p-verd', nome: 'Cadeira Verde', codigo_barras: '7891000000002', preco_varejo: 155 })
const CADEIRA_VERMELHA_GRANDE = produto({ id: 'p-vg', nome: 'Cadeira Vermelha Grande', codigo_interno: 'CAD-VERM-G', preco_varejo: 220 })
const CADEIRA_VERMELHA_INFANTIL = produto({ id: 'p-vi', nome: 'Cadeira Vermelha Infantil', codigo_interno: 'CAD-VERM-INF', preco_varejo: 90 })
const CADEIRA_AZUL = produto({ id: 'p-azul', nome: 'Cadeira Azul', codigo_barras: '7891000000005', preco_varejo: 150 })

const TODAS = [CADEIRA_VERMELHA, CADEIRA_VERDE, CADEIRA_VERMELHA_GRANDE, CADEIRA_VERMELHA_INFANTIL, CADEIRA_AZUL]

/** ILIKE '%frag%' case-insensitive, substring — mesmo comportamento do Postgres real. */
function filtraPorNome(frag: string): Row[] {
  const f = frag.toLowerCase()
  return TODAS.filter((p) => p.nome.toLowerCase().includes(f)).sort((a, b) => a.nome.localeCompare(b.nome))
}

function criarSupabaseMock(opts: {
  porNome: Row[]
  porCodigoBarras?: Row[]
  porSku?: Row[]
  porCategoriaIds?: Row[]
  categorias?: { id: string }[]
  estoquePorProduto?: Record<string, { quantidade_atual: number | null; estoque_minimo: number | null }>
}) {
  const from = vi.fn((table: string) => {
    if (table === 'estoque') {
      let produtoId: string | undefined
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (col: string, val: string) => {
        if (col === 'produto_id') produtoId = val
        return q
      }
      q.maybeSingle = () =>
        Promise.resolve({
          data: produtoId ? opts.estoquePorProduto?.[produtoId] ?? null : null,
          error: null,
        })
      return q
    }
    if (table === 'categorias') {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.ilike = () => q
      q.limit = () => q
      // @ts-expect-error thenable mock
      q.then = (resolve: (v: unknown) => void) => resolve({ data: opts.categorias ?? [], error: null })
      return q
    }
    if (table === 'produtos') {
      let mode: 'codigo_barras' | 'nome' | 'sku' | 'categoria_id' | null = null
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q // aplicarFiltroProdutoVendavel (.eq ativo / .eq status_publicacao)
      q.in = (col: string) => {
        mode = col === 'codigo_barras' ? 'codigo_barras' : 'categoria_id'
        return q
      }
      q.ilike = (col: string) => {
        mode = col === 'codigo_interno' ? 'sku' : 'nome'
        return q
      }
      q.order = () => q
      q.limit = () => q
      // @ts-expect-error thenable mock
      q.then = (resolve: (v: unknown) => void) => {
        const data =
          mode === 'codigo_barras'
            ? opts.porCodigoBarras ?? []
            : mode === 'sku'
              ? opts.porSku ?? []
              : mode === 'categoria_id'
                ? opts.porCategoriaIds ?? []
                : opts.porNome
        resolve({ data, error: null })
      }
      return q
    }
    throw new Error(`tabela inesperada no mock: ${table}`)
  })
  return { from }
}

const createClient = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/server', () => ({ createClient }))

const { buscarProdutoParaCaixaImpl } = await import('./caixaCatalogo.impl')

beforeEach(() => {
  vi.clearAllMocks()
  getUsuarioAtual.mockResolvedValue({ userId: 'u1', lojaId: 'loja-1', idioma: 'pt' })
})

describe('buscarProdutoParaCaixaImpl — candidatos em ambiguidade por nome (Onda 2 · Bloco 1)', () => {
  it('"cadeira v" → ambíguo com 4 candidatos (todas as vermelhas + verde, sem a azul), ordenados por nome', async () => {
    createClient.mockResolvedValue(criarSupabaseMock({ porNome: filtraPorNome('cadeira v') }))

    const r = await buscarProdutoParaCaixaImpl('cadeira v')

    expect(r.ok).toBe(true)
    if (!r.ok || r.status !== 'ambiguo') throw new Error('esperado status ambiguo')
    expect(r.candidatos.map((c) => c.nome)).toEqual([
      'Cadeira Verde',
      'Cadeira Vermelha',
      'Cadeira Vermelha Grande',
      'Cadeira Vermelha Infantil',
    ])
    expect(r.candidatos.some((c) => c.nome === 'Cadeira Azul')).toBe(false)
  })

  it('"cadeira" → ambíguo com os 5 candidatos', async () => {
    createClient.mockResolvedValue(criarSupabaseMock({ porNome: filtraPorNome('cadeira') }))
    const r = await buscarProdutoParaCaixaImpl('cadeira')
    if (!r.ok || r.status !== 'ambiguo') throw new Error('esperado status ambiguo')
    expect(r.candidatos).toHaveLength(5)
  })

  it('"vermelha" → ambíguo só com as 3 variações vermelhas', async () => {
    createClient.mockResolvedValue(criarSupabaseMock({ porNome: filtraPorNome('vermelha') }))
    const r = await buscarProdutoParaCaixaImpl('vermelha')
    if (!r.ok || r.status !== 'ambiguo') throw new Error('esperado status ambiguo')
    expect(r.candidatos.map((c) => c.nome).sort()).toEqual([
      'Cadeira Vermelha',
      'Cadeira Vermelha Grande',
      'Cadeira Vermelha Infantil',
    ])
  })

  it('"cadeira verm" → ambíguo, exclui "Cadeira Verde" (não bate substring)', async () => {
    createClient.mockResolvedValue(criarSupabaseMock({ porNome: filtraPorNome('cadeira verm') }))
    const r = await buscarProdutoParaCaixaImpl('cadeira verm')
    if (!r.ok || r.status !== 'ambiguo') throw new Error('esperado status ambiguo')
    expect(r.candidatos.some((c) => c.nome === 'Cadeira Verde')).toBe(false)
    expect(r.candidatos).toHaveLength(3)
  })

  it('candidato carrega diferenciadores existentes (código interno, código de barras, preço, estoque)', async () => {
    createClient.mockResolvedValue(
      criarSupabaseMock({
        porNome: filtraPorNome('vermelha'),
        estoquePorProduto: { 'p-vg': { quantidade_atual: 4, estoque_minimo: 2 } },
      }),
    )
    const r = await buscarProdutoParaCaixaImpl('vermelha')
    if (!r.ok || r.status !== 'ambiguo') throw new Error('esperado status ambiguo')
    const grande = r.candidatos.find((c) => c.nome === 'Cadeira Vermelha Grande')
    expect(grande?.codigo_interno).toBe('CAD-VERM-G')
    expect(grande?.preco_varejo).toBe(220)
    expect(grande?.quantidade_estoque).toBe(4)
    expect(grande?.estoque_minimo).toBe(2)
  })

  it('correspondência inequívoca continua indo direto (sem lista de candidatos)', async () => {
    createClient.mockResolvedValue(
      criarSupabaseMock({
        porNome: filtraPorNome('infantil'),
        estoquePorProduto: { 'p-vi': { quantidade_atual: 10, estoque_minimo: 1 } },
      }),
    )
    const r = await buscarProdutoParaCaixaImpl('infantil')
    expect(r.ok).toBe(true)
    if (!r.ok || r.status !== 'encontrado') throw new Error('esperado status encontrado')
    expect(r.produto.nome).toBe('Cadeira Vermelha Infantil')
  })

  it('barcode exato continua indo direto ao carrinho (caminho rápido preservado)', async () => {
    createClient.mockResolvedValue(
      criarSupabaseMock({
        porNome: [],
        porCodigoBarras: [CADEIRA_VERDE],
        estoquePorProduto: { 'p-verd': { quantidade_atual: 3, estoque_minimo: 1 } },
      }),
    )
    const r = await buscarProdutoParaCaixaImpl('7891000000002')
    expect(r.ok).toBe(true)
    if (!r.ok || r.status !== 'encontrado') throw new Error('esperado status encontrado')
    expect(r.produto.nome).toBe('Cadeira Verde')
  })

  it('ambiguidade por código de barras (colisão) NÃO gera lista de candidatos — decisão de domínio pendente', async () => {
    const duplicado = produto({ id: 'p-outro', nome: 'Cadeira Verde (outra loja)', codigo_barras: '7891000000002' })
    createClient.mockResolvedValue(
      criarSupabaseMock({ porNome: [], porCodigoBarras: [CADEIRA_VERDE, duplicado] }),
    )
    const r = await buscarProdutoParaCaixaImpl('7891000000002')
    expect(r.ok).toBe(true)
    if (!r.ok || r.status !== 'ambiguo') throw new Error('esperado status ambiguo')
    expect(r.candidatos).toEqual([])
  })
})

describe('buscarProdutoParaCaixaImpl — SKU / codigo_interno (ID 6)', () => {
  it('SKU exato → encontrado (antes de buscar por nome)', async () => {
    createClient.mockResolvedValue(
      criarSupabaseMock({
        porNome: [],
        porSku: [CADEIRA_VERMELHA_GRANDE],
        estoquePorProduto: { 'p-vg': { quantidade_atual: 4, estoque_minimo: 1 } },
      }),
    )
    const r = await buscarProdutoParaCaixaImpl('CAD-VERM-G')
    expect(r.ok).toBe(true)
    if (!r.ok || r.status !== 'encontrado') throw new Error('esperado encontrado')
    expect(r.produto.codigo_interno).toBe('CAD-VERM-G')
    expect(r.produto.nome).toBe('Cadeira Vermelha Grande')
  })

  it('SKU parcial ambíguo → candidatos', async () => {
    createClient.mockResolvedValue(
      criarSupabaseMock({
        porNome: [],
        porSku: [CADEIRA_VERMELHA_GRANDE, CADEIRA_VERMELHA_INFANTIL],
      }),
    )
    const r = await buscarProdutoParaCaixaImpl('CAD-VERM')
    expect(r.ok).toBe(true)
    if (!r.ok || r.status !== 'ambiguo') throw new Error('esperado ambiguo')
    expect(r.candidatos).toHaveLength(2)
    expect(r.mensagem).toMatch(/SKU/i)
  })

  it('SKU parcial único NÃO aborta nome: "ca" não coloca Parafuso (CA-01) no lugar de Caneta', async () => {
    const parafuso = produto({
      id: 'p-par',
      nome: 'Parafuso 8mm',
      codigo_interno: 'CA-01',
      preco_varejo: 2,
    })
    const caneta = produto({ id: 'p-can', nome: 'Caneta Azul', preco_varejo: 4 })
    createClient.mockResolvedValue(
      criarSupabaseMock({
        porSku: [parafuso],
        porNome: [caneta],
        estoquePorProduto: {
          'p-par': { quantidade_atual: 50, estoque_minimo: 1 },
          'p-can': { quantidade_atual: 10, estoque_minimo: 1 },
        },
      }),
    )
    const r = await buscarProdutoParaCaixaImpl('ca')
    expect(r.ok).toBe(true)
    if (!r.ok || r.status !== 'ambiguo') throw new Error('esperado ambiguo, não auto-adicionar SKU parcial')
    expect(r.candidatos.map((c) => c.nome).sort()).toEqual(['Caneta Azul', 'Parafuso 8mm'])
  })

  it('SKU parcial único sem match de nome continua encontrado (só o SKU bate)', async () => {
    const parafuso = produto({
      id: 'p-par',
      nome: 'Parafuso 8mm',
      codigo_interno: 'CA-01',
      preco_varejo: 2,
    })
    createClient.mockResolvedValue(
      criarSupabaseMock({
        porSku: [parafuso],
        porNome: [],
        estoquePorProduto: { 'p-par': { quantidade_atual: 50, estoque_minimo: 1 } },
      }),
    )
    const r = await buscarProdutoParaCaixaImpl('ca')
    expect(r.ok).toBe(true)
    if (!r.ok || r.status !== 'encontrado') throw new Error('esperado encontrado')
    expect(r.produto.nome).toBe('Parafuso 8mm')
  })
})
