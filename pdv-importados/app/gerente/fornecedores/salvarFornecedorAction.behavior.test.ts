import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { salvarFornecedorAction } from './actions'

describe('salvarFornecedorAction — tenant fail-closed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('não persiste quando a sessão não tem loja_id', async () => {
    assertGerenteSession.mockResolvedValue({
      ok: true,
      session: { lojaId: null, idioma: 'pt', userId: 'u1' },
    })
    const insert = vi.fn()
    createClient.mockResolvedValue({ from: vi.fn(() => ({ insert })) })

    const r = await salvarFornecedorAction({
      nome: 'Acme Ltda',
      cnpj: '12.345.678/0001-99',
    })

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toMatch(/loja/i)
    }
    expect(createClient).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('no create com 23505 devolve existente sem update de nome', async () => {
    assertGerenteSession.mockResolvedValue({
      ok: true,
      session: { lojaId: 'loja-a', idioma: 'pt', userId: 'u1' },
    })

    const existente = {
      id: 'f-1',
      cnpj: '12345678000199',
      nome: 'Nome Original',
      loja_id: 'loja-a',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    const maybeSingle = vi.fn().mockResolvedValue({ data: existente, error: null })
    const eq2 = vi.fn(() => ({ maybeSingle }))
    const eq1 = vi.fn(() => ({ eq: eq2 }))
    const selectExistente = vi.fn(() => ({ eq: eq1 }))

    const singleInsert = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate' },
    })
    const selectInsert = vi.fn(() => ({ single: singleInsert }))
    const insert = vi.fn(() => ({ select: selectInsert }))

    createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        expect(table).toBe('fornecedores')
        return {
          insert,
          select: selectExistente,
        }
      }),
    })

    const r = await salvarFornecedorAction({
      nome: 'Nome Novo Que Nao Deve Gravar',
      cnpj: '12345678000199',
    })

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.fornecedor.id).toBe('f-1')
      expect(r.fornecedor.nome).toBe('Nome Original')
    }
    expect(insert).toHaveBeenCalledWith({
      nome: 'Nome Novo Que Nao Deve Gravar',
      cnpj: '12345678000199',
      loja_id: 'loja-a',
    })
  })
})
