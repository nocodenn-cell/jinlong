import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Importação em lote por id: célula VAZIA não pode apagar dado existente, e o
 * rollback tem que devolver também as faixas de atacado (`precos_atacado`).
 *
 * Contexto do defeito: célula vazia virava `null`; o updater lia isso como
 * "remover o atacado" e a RPC `atualizar_produto_com_faixa_atacado` desativava a
 * faixa do catálogo — sem confirmação. O rollback antigo só refazia `produtos`,
 * então uma faixa desativada/criada pela RPC ficava assim depois da "reversão".
 */

const ID_1 = '11111111-1111-4111-8111-111111111111'
const ID_2 = '22222222-2222-4222-8222-222222222222'

type Faixa = {
  id: string
  produto_id: string
  quantidade_minima: number
  preco_unitario: number
  ativo: boolean
}

const state = {
  prev: {} as Record<string, Record<string, unknown>>,
  faixas: [] as Faixa[],
  produtosUpdates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  failFaixaUpdate: false,
}

const assertGerenteSessionMock = vi.fn()
const atualizarProdutoActionMock = vi.fn()

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: assertGerenteSessionMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    rpc: async () => ({ error: null }),
    from(table: string) {
      if (table === 'produtos') {
        return {
          select: () => ({
            in: async () => ({ data: [], error: null }),
            eq: (_col: string, id: string) => ({
              maybeSingle: async () => ({ data: state.prev[id] ?? null, error: null }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              state.produtosUpdates.push({ id, patch })
              return { error: null }
            },
          }),
          delete: () => ({ in: async () => ({ error: null }) }),
        }
      }
      if (table === 'precos_atacado') {
        return {
          select: () => ({
            eq: async (_col: string, produtoId: string) => ({
              data: state.faixas
                .filter((f) => f.produto_id === produtoId)
                .map((f) => ({
                  id: f.id,
                  quantidade_minima: f.quantidade_minima,
                  preco_unitario: f.preco_unitario,
                  ativo: f.ativo,
                })),
              error: null,
            }),
          }),
          update: (patch: Partial<Faixa>) => ({
            eq: async (_col: string, id: string) => {
              if (state.failFaixaUpdate) return { error: { message: 'faixa update falhou' } }
              const f = state.faixas.find((x) => x.id === id)
              if (f) Object.assign(f, patch)
              return { error: null }
            },
          }),
          delete: () => ({
            in: async (_col: string, ids: string[]) => {
              state.faixas = state.faixas.filter((f) => !ids.includes(f.id))
              return { error: null }
            },
          }),
        }
      }
      throw new Error(`tabela inesperada no teste: ${table}`)
    },
  }),
}))

vi.mock('@/app/admin/produtos/actions', () => ({
  atualizarProdutoAction: atualizarProdutoActionMock,
  criarProdutoAction: vi.fn(),
  buscarProdutosComFiltrosAction: vi.fn(),
  buscarProdutoPorIdAction: vi.fn(),
  excluirProdutoAction: vi.fn(),
  setProductStatusAction: vi.fn(),
  setProductStatusLoteAction: vi.fn(),
  updateCategoriaLoteAction: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

function produtoAtual(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    nome: 'Arroz Velho',
    codigo_barras: '7891000',
    codigo_interno: 'SKU-1',
    referencia_fornecedor: null,
    nome_reduzido_pdv: null,
    localizacao_prateleira: 'A1',
    preco_varejo: 20,
    preco_atacado: '80.00',
    preco_custo: 5,
    permitir_abaixo_custo: false,
    quantidade_gatilho_atacado: 5,
    origem: 'china_manual',
    tem_nf: true,
    unidade_medida: 'KG',
    observacao: 'observação atual',
    categoria_id: null,
    marca_id: null,
    fornecedor_id: null,
    ncm: null,
    cfop_produto: null,
    csosn: null,
    cest: null,
    cst_pis: null,
    cst_cofins: null,
    icms_origem: null,
    ...over,
  }
}

/** Linha da grade — todas as colunas opcionais em branco por padrão. */
function linha(id: string, over: Record<string, string> = {}): Record<string, string> {
  return {
    id,
    nome: 'Arroz',
    codigo_barras: '',
    preco_varejo: '12,50',
    preco_atacado: '',
    quantidade_gatilho_atacado: '',
    unidade_medida: '',
    observacao: '',
    origem: 'china_manual',
    tem_nf: '',
    ativo: '1',
    ...over,
  }
}

function inputEnviado(chamada = 0) {
  return atualizarProdutoActionMock.mock.calls[chamada]![1] as Record<string, unknown>
}

describe('importarProdutosLote (atualizar por id) — célula vazia mantém o valor atual', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.prev = { [ID_1]: produtoAtual(ID_1), [ID_2]: produtoAtual(ID_2) }
    state.faixas = []
    state.produtosUpdates = []
    state.failFaixaUpdate = false
    assertGerenteSessionMock.mockResolvedValue({
      ok: true,
      session: { userId: 'mgr-1', lojaId: 'loja-1', idioma: 'pt' },
    })
    atualizarProdutoActionMock.mockResolvedValue({ ok: true, product: {} })
  })

  it('atacado, gatilho, código de barras, unidade, observação e tem_nf em branco NÃO são apagados', async () => {
    const { importarProdutosLote } = await import('./actions')
    const res = await importarProdutosLote([linha(ID_1)], true)

    expect(res).toMatchObject({ success: true, atualizados: 1, falhas: [] })
    expect(atualizarProdutoActionMock).toHaveBeenCalledTimes(1)
    const input = inputEnviado()
    // O que a linha informou chega.
    expect(input.nome).toBe('Arroz')
    expect(input.precoVarejo).toBe(12.5)
    // O que veio vazio mantém o valor do produto (antes: null / 'UN' / false).
    expect(input.precoAtacado).toBe(80)
    expect(input.quantidadeGatilhoAtacado).toBe(5)
    expect(input.codigoBarras).toBe('7891000')
    expect(input.unidadeMedida).toBe('KG')
    expect(input.observacao).toBe('observação atual')
    expect(input.temNf).toBe(true)
  })

  it('#limpar apaga de propósito: atacado, gatilho, código de barras e observação viram null', async () => {
    const { importarProdutosLote } = await import('./actions')
    const res = await importarProdutosLote(
      [
        linha(ID_1, {
          preco_atacado: '#limpar',
          quantidade_gatilho_atacado: '#LIMPAR',
          codigo_barras: '#limpar',
          observacao: '#limpar',
        }),
      ],
      true,
    )

    expect(res).toMatchObject({ success: true, atualizados: 1 })
    const input = inputEnviado()
    expect(input.precoAtacado).toBeNull()
    expect(input.quantidadeGatilhoAtacado).toBeNull()
    expect(input.codigoBarras).toBeNull()
    expect(input.observacao).toBeNull()
    // Campos que continuaram em branco seguem preservados.
    expect(input.unidadeMedida).toBe('KG')
  })

  it('valor informado na célula sobrescreve o atual', async () => {
    const { importarProdutosLote } = await import('./actions')
    await importarProdutosLote(
      [
        linha(ID_1, {
          preco_atacado: '9,90',
          quantidade_gatilho_atacado: '12',
          unidade_medida: 'CX',
          observacao: 'nova',
        }),
      ],
      true,
    )
    const input = inputEnviado()
    expect(input.precoAtacado).toBe(9.9)
    expect(input.quantidadeGatilhoAtacado).toBe(12)
    expect(input.unidadeMedida).toBe('CX')
    expect(input.observacao).toBe('nova')
  })
})

describe('importarProdutosLote — rollback restaura as faixas de atacado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.prev = { [ID_1]: produtoAtual(ID_1), [ID_2]: produtoAtual(ID_2) }
    state.faixas = [
      { id: 'f-1', produto_id: ID_1, quantidade_minima: 5, preco_unitario: 80, ativo: true },
      { id: 'f-outra', produto_id: ID_1, quantidade_minima: 20, preco_unitario: 70, ativo: true },
    ]
    state.produtosUpdates = []
    state.failFaixaUpdate = false
    assertGerenteSessionMock.mockResolvedValue({
      ok: true,
      session: { userId: 'mgr-1', lojaId: 'loja-1', idioma: 'pt' },
    })
  })

  /** 1ª linha: a "RPC" desativa a faixa f-1, altera f-outra e cria f-nova. 2ª linha: falha. */
  function simularRpcQueMexeNasFaixasEDepoisFalha() {
    atualizarProdutoActionMock
      .mockImplementationOnce(async () => {
        const f1 = state.faixas.find((f) => f.id === 'f-1')!
        f1.ativo = false
        state.faixas.find((f) => f.id === 'f-outra')!.preco_unitario = 55
        state.faixas.push({
          id: 'f-nova',
          produto_id: ID_1,
          quantidade_minima: 10,
          preco_unitario: 60,
          ativo: true,
        })
        return { ok: true, product: {} }
      })
      .mockImplementationOnce(async () => ({ ok: false, error: 'falha simulada na linha 2' }))
  }

  it('falha na 2ª linha: faixa desativada volta a ativa, alterada volta ao preço antigo, criada é removida', async () => {
    simularRpcQueMexeNasFaixasEDepoisFalha()
    const { importarProdutosLote } = await import('./actions')
    const res = await importarProdutosLote([linha(ID_1), linha(ID_2)], true)

    expect(res).toMatchObject({ success: true, criados: 0, atualizados: 0 })
    if (!res.success) return
    expect(res.falhas).toHaveLength(1)
    expect(res.falhas[0]).toMatchObject({ linha: 2 })
    expect(res.falhas[0].motivo).toContain('falha simulada na linha 2')
    // Reversão completa: nenhum aviso de rollback incompleto na mensagem.
    expect(res.falhas[0].motivo).not.toContain('faixas de atacado')

    const porId = new Map(state.faixas.map((f) => [f.id, f]))
    expect(porId.get('f-1')).toMatchObject({ ativo: true, quantidade_minima: 5, preco_unitario: 80 })
    expect(porId.get('f-outra')).toMatchObject({ ativo: true, preco_unitario: 70 })
    expect(porId.has('f-nova')).toBe(false)
    // `produtos` também foi devolvido ao snapshot.
    expect(state.produtosUpdates.some((u) => u.id === ID_1)).toBe(true)
  })

  it('rollback que não consegue restaurar faixa AVISA na mensagem (antes ficava calado)', async () => {
    simularRpcQueMexeNasFaixasEDepoisFalha()
    state.failFaixaUpdate = true
    const { importarProdutosLote } = await import('./actions')
    const res = await importarProdutosLote([linha(ID_1), linha(ID_2)], true)

    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.falhas[0].motivo).toContain('falha simulada na linha 2')
    expect(res.falhas[0].motivo).toContain('faixas de atacado')
    expect(res.falhas[0].motivo).toContain('faixa update falhou')
  })
})
