import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUsuarioAtual = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/usuarioAtual', () => ({ getUsuarioAtual }))

const createClient = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/server', () => ({ createClient }))

const {
  formatNumeroVendaHistorico,
  extrairClienteNomeDeVenda,
  mapItensVendaHistorico,
  listarHistoricoOperadorImpl,
  obterDetalheHistoricoVendaImpl,
} = await import('./caixaVendaEspera.impl')

const OPERADOR_ID = 'op-hist-27'
const VENDA_COM_CLIENTE = 'venda-com-cliente'
const VENDA_SEM_CLIENTE = 'venda-sem-cliente'

type VendaRow = {
  id: string
  data: string
  total_liquido: number
  forma_pagamento: string
  status: string
  caixa_id: string
  cliente_id: string | null
  clientes: { nome: string } | null
}

function vendaRow(over: Partial<VendaRow> & { id: string }): VendaRow {
  return {
    data: '2026-08-31T14:00:00.000Z',
    total_liquido: 150,
    forma_pagamento: 'DINHEIRO',
    status: 'CONCLUIDA',
    caixa_id: 'caixa-1',
    cliente_id: null,
    clientes: null,
    ...over,
  }
}

function criarSupabaseHistoricoMock(opts: {
  vendas: VendaRow[]
  eventos?: Array<{ sale_id: string; items: unknown[] }>
  detalheVenda?: VendaRow & {
    total_bruto?: number
    total_desconto?: number
  }
  pagamentos?: Array<{ forma_pagamento: string; valor: number }>
  eventoDetalhe?: { items: unknown[] } | null
  itensVenda?: Array<Record<string, unknown>>
  descontoVenda?: { desconto_percentual: number; desconto_valor: number } | null
}) {
  const vendasSelects: string[] = []
  const vendasEq: Array<[string, string]> = []
  let vendasMode: 'list' | 'detail' = 'list'

  const from = vi.fn((table: string) => {
    if (table === 'vendas') {
      const q: Record<string, unknown> = {}
      q.select = (cols: string) => {
        vendasSelects.push(cols)
        return q
      }
      q.eq = (col: string, val: string) => {
        vendasEq.push([col, val])
        return q
      }
      q.order = () => q
      q.limit = () => q
      q.gte = () => q
      q.lte = () => q
      q.maybeSingle = () => {
        vendasMode = 'detail'
        const idFilter = vendasEq.find(([c]) => c === 'id')?.[1]
        const row = opts.detalheVenda ?? opts.vendas.find((v) => v.id === idFilter) ?? null
        return Promise.resolve({ data: row, error: null })
      }
      // @ts-expect-error thenable mock
      q.then = (resolve: (v: unknown) => void) => {
        if (vendasMode === 'detail') return Promise.resolve({ data: null, error: null }).then(resolve)
        resolve({ data: opts.vendas, error: null })
      }
      return q
    }

    if (table === 'venda_eventos') {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.in = () => q
      q.eq = () => q
      q.order = () => q
      q.limit = () => q
      q.maybeSingle = () =>
        Promise.resolve({
          data: opts.eventoDetalhe ?? null,
          error: null,
        })
      // @ts-expect-error thenable mock
      q.then = (resolve: (v: unknown) => void) =>
        resolve({ data: opts.eventos ?? [], error: null })
      return q
    }

    if (table === 'vendas_pagamentos') {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      // @ts-expect-error thenable mock
      q.then = (resolve: (v: unknown) => void) =>
        resolve({ data: opts.pagamentos ?? [], error: null })
      return q
    }

    if (table === 'itens_venda') {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.order = () => q
      // @ts-expect-error thenable mock
      q.then = (resolve: (v: unknown) => void) =>
        resolve({ data: opts.itensVenda ?? [], error: null })
      return q
    }

    if (table === 'descontos_venda') {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.maybeSingle = () =>
        Promise.resolve({ data: opts.descontoVenda ?? null, error: null })
      return q
    }

    throw new Error(`tabela inesperada no mock: ${table}`)
  })

  return { from, vendasSelects, vendasEq }
}

beforeEach(() => {
  vi.clearAllMocks()
  getUsuarioAtual.mockResolvedValue({ userId: OPERADOR_ID, lojaId: 'loja-1', idioma: 'pt' })
})

describe('formatNumeroVendaHistorico', () => {
  it('formata prefixo curto do UUID em maiúsculas', () => {
    expect(formatNumeroVendaHistorico('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('#A1B2C3D4')
  })

  it('retorna traço para id vazio após normalização', () => {
    expect(formatNumeroVendaHistorico('')).toBe('—')
  })
})

describe('extrairClienteNomeDeVenda', () => {
  it('extrai nome de objeto aninhado', () => {
    expect(extrairClienteNomeDeVenda({ clientes: { nome: 'Maria Silva' } })).toBe('Maria Silva')
  })

  it('extrai nome de array aninhado (PostgREST)', () => {
    expect(extrairClienteNomeDeVenda({ clientes: [{ nome: 'João' }] })).toBe('João')
  })

  it('retorna null sem cliente', () => {
    expect(extrairClienteNomeDeVenda({ clientes: null })).toBeNull()
    expect(extrairClienteNomeDeVenda({})).toBeNull()
  })
})

describe('listarHistoricoOperadorImpl — ID 27 clienteNome', () => {
  it('Caso A: venda com cliente → nome correto na lista', async () => {
    const mock = criarSupabaseHistoricoMock({
      vendas: [
        vendaRow({
          id: VENDA_COM_CLIENTE,
          cliente_id: 'cli-1',
          clientes: { nome: 'Cliente Teste A' },
          total_liquido: 199.9,
        }),
      ],
      eventos: [{ sale_id: VENDA_COM_CLIENTE, items: [{ nome: 'Item 1', quantidade: 2 }] }],
    })
    createClient.mockResolvedValue(mock)

    const res = await listarHistoricoOperadorImpl({ inicio: '2026-08-31T00:00:00.000Z' })

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('esperado ok')
    expect(res.vendas).toHaveLength(1)
    expect(res.vendas[0].clienteNome).toBe('Cliente Teste A')
  })

  it('Caso B: venda sem cliente → clienteNome null', async () => {
    const mock = criarSupabaseHistoricoMock({
      vendas: [vendaRow({ id: VENDA_SEM_CLIENTE })],
    })
    createClient.mockResolvedValue(mock)

    const res = await listarHistoricoOperadorImpl({ inicio: '2026-08-31T00:00:00.000Z' })

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('esperado ok')
    expect(res.vendas[0].clienteNome).toBeNull()
  })

  it('Caso C: filtra por operador_id do usuário logado', async () => {
    const mock = criarSupabaseHistoricoMock({ vendas: [] })
    createClient.mockResolvedValue(mock)

    await listarHistoricoOperadorImpl({ inicio: '2026-08-31T00:00:00.000Z' })

    expect(mock.vendasEq).toContainEqual(['operador_id', OPERADOR_ID])
  })

  it('Caso D: demais campos do histórico permanecem corretos', async () => {
    const mock = criarSupabaseHistoricoMock({
      vendas: [
        vendaRow({
          id: VENDA_COM_CLIENTE,
          cliente_id: 'cli-1',
          clientes: { nome: 'Maria' },
          total_liquido: 250,
          forma_pagamento: 'PIX',
          status: 'CONCLUIDA',
          data: '2026-08-31T10:30:00.000Z',
        }),
      ],
      eventos: [
        {
          sale_id: VENDA_COM_CLIENTE,
          items: [{ nome: 'Produto X', quantidade: 1, precoUnitario: 250, total: 250 }],
        },
      ],
    })
    createClient.mockResolvedValue(mock)

    const res = await listarHistoricoOperadorImpl({ inicio: '2026-08-31T00:00:00.000Z' })

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('esperado ok')
    const v = res.vendas[0]
    expect(v.numeroVenda).toBe(formatNumeroVendaHistorico(VENDA_COM_CLIENTE))
    expect(v.totalLiquido).toBe(250)
    expect(v.formaPagamento).toBe('PIX')
    expect(v.status).toBe('CONCLUIDA')
    expect(v.data).toBe('2026-08-31T10:30:00.000Z')
    expect(v.qtdItens).toBe(1)
  })

  it('join clientes(nome) na mesma query — sem N+1 estrutural', async () => {
    const mock = criarSupabaseHistoricoMock({ vendas: [] })
    createClient.mockResolvedValue(mock)

    await listarHistoricoOperadorImpl({ inicio: '2026-08-31T00:00:00.000Z' })

    expect(mock.vendasSelects.some((s) => s.includes('clientes(nome)'))).toBe(true)
    expect(createClient).toHaveBeenCalledTimes(1)
  })
})

describe('obterDetalheHistoricoVendaImpl — ID 27 detalhe', () => {
  it('Caso E: detalhe propaga clienteNome e demais campos', async () => {
    const mock = criarSupabaseHistoricoMock({
      vendas: [],
      detalheVenda: {
        ...vendaRow({
          id: VENDA_COM_CLIENTE,
          cliente_id: 'cli-1',
          clientes: { nome: 'Cliente Detalhe' },
        }),
        total_bruto: 300,
        total_desconto: 50,
        total_liquido: 250,
      },
      itensVenda: [
        {
          produto_id: 'p1',
          quantidade: 3,
          preco_unitario: 100,
          preco_unitario_original: 100,
          tipo_preco: 'VAREJO',
          produtos: { nome: 'Item detalhe' },
        },
      ],
      eventoDetalhe: {
        items: [{ nome: 'Item evento legado', quantidade: 1, precoUnitario: 1, total: 1 }],
      },
      pagamentos: [{ forma_pagamento: 'CARTAO', valor: 250 }],
    })
    createClient.mockResolvedValue(mock)

    const res = await obterDetalheHistoricoVendaImpl(VENDA_COM_CLIENTE)

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('esperado ok')
    expect(res.detalhe.clienteNome).toBe('Cliente Detalhe')
    expect(res.detalhe.totalBruto).toBe(300)
    expect(res.detalhe.totalDesconto).toBe(50)
    expect(res.detalhe.totalLiquido).toBe(250)
    expect(res.detalhe.itens).toHaveLength(1)
    expect(res.detalhe.itens[0]?.nome).toBe('Item detalhe')
    expect(res.detalhe.itens[0]?.tipoPreco).toBe('VAREJO')
    expect(res.detalhe.pagamentos[0].formaPagamento).toBe('CARTAO')
  })

  it('detalhe sem cliente → clienteNome null', async () => {
    const mock = criarSupabaseHistoricoMock({
      vendas: [],
      detalheVenda: vendaRow({ id: VENDA_SEM_CLIENTE }),
      eventoDetalhe: { items: [] },
    })
    createClient.mockResolvedValue(mock)

    const res = await obterDetalheHistoricoVendaImpl(VENDA_SEM_CLIENTE)

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('esperado ok')
    expect(res.detalhe.clienteNome).toBeNull()
  })

  it('preserva escopo operador no detalhe', async () => {
    const mock = criarSupabaseHistoricoMock({
      vendas: [],
      detalheVenda: vendaRow({ id: VENDA_COM_CLIENTE, clientes: { nome: 'X' } }),
      eventoDetalhe: { items: [] },
    })
    createClient.mockResolvedValue(mock)

    await obterDetalheHistoricoVendaImpl(VENDA_COM_CLIENTE)

    expect(mock.vendasEq).toContainEqual(['operador_id', OPERADOR_ID])
    expect(mock.vendasSelects.some((s) => s.includes('clientes(nome)'))).toBe(true)
  })

  it('venda de outro operador → não encontrada (escopo preservado)', async () => {
    const mock = criarSupabaseHistoricoMock({ vendas: [], detalheVenda: undefined })
    createClient.mockResolvedValue(mock)

    const res = await obterDetalheHistoricoVendaImpl('venda-outro-operador')

    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('esperado falha')
    expect(res.code).toBe('VENDA_NAO_ENCONTRADA')
  })
})

describe('obterDetalheHistoricoVendaImpl — ID 28 reimpressão fiel', () => {
  it('prioriza itens_venda (tipo_preco ATACADO) sobre venda_eventos', async () => {
    const mock = criarSupabaseHistoricoMock({
      vendas: [],
      detalheVenda: vendaRow({ id: VENDA_COM_CLIENTE }),
      itensVenda: [
        {
          produto_id: 'p-at',
          quantidade: 10,
          preco_unitario: 9,
          preco_unitario_original: 12,
          tipo_preco: 'ATACADO',
          produtos: { nome: 'Prod atacado' },
        },
      ],
      eventoDetalhe: {
        items: [{ nome: 'Legado evento', quantidade: 1, precoUnitario: 99, total: 99 }],
      },
    })
    createClient.mockResolvedValue(mock)

    const res = await obterDetalheHistoricoVendaImpl(VENDA_COM_CLIENTE)

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('esperado ok')
    expect(res.detalhe.itens[0]?.tipoPreco).toBe('ATACADO')
    expect(res.detalhe.itens[0]?.precoOriginal).toBe(12)
    expect(res.detalhe.itens[0]?.nome).toBe('Prod atacado')
  })

  it('carrega desconto gerente de descontos_venda', async () => {
    const mock = criarSupabaseHistoricoMock({
      vendas: [],
      detalheVenda: {
        ...vendaRow({ id: VENDA_COM_CLIENTE }),
        total_desconto: 35,
        total_liquido: 165,
      },
      itensVenda: [],
      descontoVenda: { desconto_percentual: 10, desconto_valor: 20 },
      eventoDetalhe: { items: [] },
    })
    createClient.mockResolvedValue(mock)

    const res = await obterDetalheHistoricoVendaImpl(VENDA_COM_CLIENTE)

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('esperado ok')
    expect(res.detalhe.descontoGerentePercentual).toBe(10)
    expect(res.detalhe.valorDescontoGerente).toBe(20)
  })

  it('legado sem itens_venda → fallback venda_eventos', async () => {
    const mock = criarSupabaseHistoricoMock({
      vendas: [],
      detalheVenda: vendaRow({ id: VENDA_COM_CLIENTE }),
      itensVenda: [],
      eventoDetalhe: {
        items: [{ nome: 'Só ledger', quantidade: 2, precoUnitario: 15, total: 30 }],
      },
    })
    createClient.mockResolvedValue(mock)

    const res = await obterDetalheHistoricoVendaImpl(VENDA_COM_CLIENTE)

    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('esperado ok')
    expect(res.detalhe.itens[0]?.nome).toBe('Só ledger')
    expect(res.detalhe.itens[0]?.tipoPreco).toBe('VAREJO')
  })
})

describe('mapItensVendaHistorico', () => {
  it('mapeia join produtos(nome) e campos de preço', () => {
    const itens = mapItensVendaHistorico([
      {
        produto_id: 'p1',
        quantidade: 2,
        preco_unitario: 40,
        preco_unitario_original: 50,
        tipo_preco: 'ATACADO',
        produtos: { nome: 'X' },
      },
    ])
    expect(itens[0]?.nome).toBe('X')
    expect(itens[0]?.tipoPreco).toBe('ATACADO')
    expect(itens[0]?.precoOriginal).toBe(50)
  })
})
