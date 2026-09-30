/**
 * BP-E1 (D5) — deep-link `/admin/financeiro?tab=pagar&fornecedor_id=<uuid>`.
 * Como no achado de Relatórios→Catálogo, o builder sozinho não prova nada: a
 * página precisa ler o parâmetro, filtrar a listagem e devolver o fornecedor
 * como opção do <select> (a 1ª página de fornecedores pode não conter o alvo).
 */
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminFinanceiroContasPagarFornecedorQuery, ROUTES } from '@/lib/navigation/routes'

const FORN_ID = '11111111-2222-4333-8444-555555555555'

const buscarContasPagarMock = vi.fn()
const fornecedorLookupMock = vi.fn()

vi.mock('@/lib/admin/auth/loadAdminContext', () => ({
  loadAdminContext: vi.fn(async () => ({ session: { idioma: 'pt', lojaId: 'loja-1' } })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (tabela: string) => {
      const chain: Record<string, unknown> = {}
      const resultado =
        tabela === 'fornecedores'
          ? { data: fornecedorLookupMock() }
          : { data: [] as unknown[] }
      for (const m of ['select', 'in', 'is', 'order', 'limit', 'eq']) chain[m] = () => chain
      chain.maybeSingle = async () => resultado
      chain.then = (resolve: (v: unknown) => unknown) => resolve(resultado)
      return chain
    },
  }),
}))

vi.mock('@/lib/gerente/financeiroTitulosServer', () => ({
  fetchContasReceberListagem: async () => ({ titulos: [], capped: false }),
  fetchFinanceiroTitulosKpis: async () => ({
    titulosAbertosCount: 0,
    valorAbertoTotal: 0,
    kpiValorTruncado: false,
    valorVencidoTotal: 0,
    titulosVencidosCount: 0,
  }),
  parseTituloFiltersFromSearchParams: () => ({
    limite: 50,
    q: '',
    opcao: 'mix',
    clienteId: undefined,
    nomeCliente: undefined,
    de: undefined,
    ate: undefined,
  }),
}))

vi.mock('@/app/gerente/clientes/actions', () => ({
  buscarClientesPaginadosAction: async () => ({ ok: true, clientes: [] }),
}))

vi.mock('@/app/gerente/fornecedores/actions', () => ({
  buscarFornecedoresPaginadosAction: async () => ({
    ok: true,
    fornecedores: [{ id: 'outro-fornecedor', nome: 'Outro Fornecedor' }],
  }),
}))

vi.mock('@/app/gerente/financeiro/contas-pagar/actions', () => ({
  buscarContasPagarAction: (...args: unknown[]) => buscarContasPagarMock(...args),
}))

vi.mock('./_components/FinanceiroContent', () => ({
  FinanceiroContent: () => null,
}))

const { default: AdminFinanceiroPage } = await import('./page')
const { FinanceiroContent } = await import('./_components/FinanceiroContent')

function achar(node: React.ReactNode, alvo: unknown): React.ReactElement | null {
  if (!React.isValidElement(node)) return null
  if (node.type === alvo) return node
  const filhos = React.Children.toArray((node.props as { children?: React.ReactNode }).children)
  for (const f of filhos) {
    const r = achar(f, alvo)
    if (r) return r
  }
  return null
}

async function renderPagina(sp: Record<string, string>) {
  const el = await AdminFinanceiroPage({ searchParams: Promise.resolve(sp) })
  const content = achar(el, FinanceiroContent)
  expect(content).toBeTruthy()
  return content!.props as {
    contasPagar: {
      fornecedorInicial?: string
      fornecedoresOpts: Array<{ id: string; nome: string }>
    }
  }
}

beforeEach(() => {
  buscarContasPagarMock.mockReset()
  fornecedorLookupMock.mockReset()
  buscarContasPagarMock.mockResolvedValue({ ok: true, contas: [], hasMore: false })
  fornecedorLookupMock.mockReturnValue({ nome: 'Fornecedor Alvo' })
})

describe('adminFinanceiroContasPagarFornecedorQuery', () => {
  it('abre a aba "A pagar" filtrada por fornecedor', () => {
    expect(adminFinanceiroContasPagarFornecedorQuery(FORN_ID)).toBe(
      `${ROUTES.admin.financeiro}?tab=pagar&fornecedor_id=${FORN_ID}`,
    )
  })

  it('sem fornecedor, ainda abre a aba "A pagar"', () => {
    expect(adminFinanceiroContasPagarFornecedorQuery('  ')).toBe(`${ROUTES.admin.financeiro}?tab=pagar`)
  })

  it('nunca usa a árvore legada /gerente', () => {
    expect(adminFinanceiroContasPagarFornecedorQuery(FORN_ID).startsWith('/gerente')).toBe(false)
  })
})

describe('/admin/financeiro — leitura de ?fornecedor_id= na aba "A pagar"', () => {
  it('filtra a listagem por fornecedor e informa o filtro inicial ao client', async () => {
    const props = await renderPagina({ tab: 'pagar', fornecedor_id: FORN_ID })

    expect(buscarContasPagarMock).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ fornecedor_id: FORN_ID }),
    )
    expect(props.contasPagar.fornecedorInicial).toBe(FORN_ID)
  })

  it('inclui o fornecedor do link nas opções do <select> quando não está na 1ª página', async () => {
    const props = await renderPagina({ tab: 'pagar', fornecedor_id: FORN_ID })

    expect(props.contasPagar.fornecedoresOpts[0]).toEqual({ id: FORN_ID, nome: 'Fornecedor Alvo' })
    expect(props.contasPagar.fornecedoresOpts.some((f) => f.id === 'outro-fornecedor')).toBe(true)
  })

  it('id que não é UUID é ignorado (sem erro de query e sem filtro)', async () => {
    const props = await renderPagina({ tab: 'pagar', fornecedor_id: "x'; drop table --" })

    expect(buscarContasPagarMock).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ fornecedor_id: undefined }),
    )
    expect(props.contasPagar.fornecedorInicial).toBe('')
  })

  it('sem o parâmetro, o comportamento anterior é mantido', async () => {
    const props = await renderPagina({ tab: 'pagar' })

    expect(buscarContasPagarMock).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ fornecedor_id: undefined }),
    )
    expect(props.contasPagar.fornecedorInicial).toBe('')
    expect(fornecedorLookupMock).not.toHaveBeenCalled()
  })
})
