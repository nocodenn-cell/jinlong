import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MSG_FORNECEDOR_SEM_LOJA,
  lojaIdDaSessao,
} from './fornecedorContrato'

const assertGerenteSession = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient,
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

import {
  buscarFornecedoresPaginadosAction,
  bulkExcluirFornecedoresAction,
  excluirFornecedorAction,
  salvarFornecedorAction,
} from './actions'

describe('lojaIdDaSessao', () => {
  it('falha fechado sem loja', () => {
    expect(lojaIdDaSessao({ lojaId: null })).toEqual({
      ok: false,
      error: MSG_FORNECEDOR_SEM_LOJA,
    })
  })
})

describe('buscarFornecedoresPaginadosAction — escopo por loja', () => {
  beforeEach(() => vi.clearAllMocks())

  it('aplica eq loja_id da sessão e não lista sem tenant', async () => {
    assertGerenteSession.mockResolvedValue({
      ok: true,
      session: { lojaId: null, idioma: 'pt', userId: 'u1' },
    })
    const r = await buscarFornecedoresPaginadosAction(1)
    expect(r.ok).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('filtra explicitamente por loja_id da sessão A', async () => {
    assertGerenteSession.mockResolvedValue({
      ok: true,
      session: { lojaId: 'loja-a', idioma: 'pt', userId: 'u1' },
    })

    const rows = [
      {
        id: 'f-a',
        cnpj: '12345678000199',
        nome: 'Fornecedor A',
        loja_id: 'loja-a',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ]

    const range = vi.fn().mockResolvedValue({ data: rows, error: null })
    const order = vi.fn(() => ({ range }))
    const or = vi.fn(() => ({ order }))
    const eq = vi.fn(() => ({ or, order }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    createClient.mockResolvedValue({ from })

    const r = await buscarFornecedoresPaginadosAction(1, { termo: '123' })
    expect(r.ok).toBe(true)
    expect(eq).toHaveBeenCalledWith('loja_id', 'loja-a')
    expect(or).toHaveBeenCalled()
    if (r.ok) {
      expect(r.fornecedores).toHaveLength(1)
      expect(r.fornecedores[0]?.loja_id).toBe('loja-a')
    }
  })
})

describe('salvar/excluir — isolamento entre lojas', () => {
  beforeEach(() => vi.clearAllMocks())

  it('update de fornecedor B com sessão A não altera (0 rows)', async () => {
    assertGerenteSession.mockResolvedValue({
      ok: true,
      session: { lojaId: 'loja-a', idioma: 'pt', userId: 'u1' },
    })
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const select = vi.fn(() => ({ maybeSingle }))
    const eqLoja = vi.fn(() => ({ select }))
    const eqId = vi.fn(() => ({ eq: eqLoja }))
    const update = vi.fn(() => ({ eq: eqId }))
    createClient.mockResolvedValue({
      from: vi.fn(() => ({ update })),
    })

    const r = await salvarFornecedorAction({
      id: 'fornecedor-loja-b',
      nome: 'Hack',
      cnpj: '12345678000199',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não encontrado/i)
    expect(eqLoja).toHaveBeenCalledWith('loja_id', 'loja-a')
  })

  it('delete de fornecedor B com sessão A não exclui', async () => {
    assertGerenteSession.mockResolvedValue({
      ok: true,
      session: { lojaId: 'loja-a', idioma: 'pt', userId: 'u1' },
    })
    const selectCount = vi.fn().mockResolvedValue({ count: 0, error: null })
    const headChain = {
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      then: undefined as unknown,
      select: selectCount,
    }
    // contas_pagar count path
    const contasSelect = vi.fn(() => ({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ count: 0, error: null }),
      }),
    }))

    const deleteSelect = vi.fn().mockResolvedValue({ data: [], error: null })
    const deleteEqLoja = vi.fn(() => ({ select: deleteSelect }))
    const deleteEqId = vi.fn(() => ({ eq: deleteEqLoja }))
    const del = vi.fn(() => ({ eq: deleteEqId }))

    createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'contas_pagar') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn().mockResolvedValue({ count: 0, error: null }),
              })),
            })),
          }
        }
        return { delete: del }
      }),
    })

    const r = await excluirFornecedorAction('fornecedor-loja-b')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não encontrado/i)
    expect(deleteEqLoja).toHaveBeenCalledWith('loja_id', 'loja-a')
    void headChain
    void contasSelect
  })

  it('bulk delete só conta linhas da loja da sessão', async () => {
    assertGerenteSession.mockResolvedValue({
      ok: true,
      session: { lojaId: 'loja-a', idioma: 'pt', userId: 'u1' },
    })
    const deleteSelect = vi.fn().mockResolvedValue({ data: [{ id: 'f-a' }], error: null })
    const deleteEqLoja = vi.fn(() => ({ select: deleteSelect }))
    const deleteIn = vi.fn(() => ({ eq: deleteEqLoja }))
    const del = vi.fn(() => ({ in: deleteIn }))

    createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'contas_pagar') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                in: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          }
        }
        return { delete: del }
      }),
    })

    const r = await bulkExcluirFornecedoresAction(['f-a', 'f-b-outra-loja'])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.excluidos).toBe(1)
      expect(r.bloqueados).toBe(0)
    }
    expect(deleteEqLoja).toHaveBeenCalledWith('loja_id', 'loja-a')
  })
})
