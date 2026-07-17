import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const assertGerenteSessionMock = vi.fn()
const revalidatePathMock = vi.fn()
const getUsuarioIdiomaMock = vi.fn()

const fromMock = vi.fn()
const createClientMock = vi.fn(async () => ({ from: fromMock }))

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: assertGerenteSessionMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

vi.mock('@/idioma/usuarioIdioma', () => ({
  getUsuarioIdioma: getUsuarioIdiomaMock,
}))

/**
 * Builder encadeável mínimo para simular o client Supabase usado por
 * salvarClienteAction — thenable em qualquer ponto da cadeia, já que o
 * código às vezes termina em `.eq()` (update) e às vezes em `.single()`
 * (insert/select).
 */
function chainableInsert(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(result),
  }
  obj.insert = vi.fn(() => obj)
  obj.update = vi.fn(() => obj)
  obj.select = vi.fn(() => obj)
  obj.eq = vi.fn(() => obj)
  obj.single = vi.fn(async () => result)
  return obj
}

describe('gerente/clientes salvarClienteAction — documento duplicado', () => {
  beforeAll(async () => {
    await import('./actions')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSessionMock.mockResolvedValue({
      ok: true,
      session: { userId: 'u1', lojaId: 'loja-1' },
    })
    getUsuarioIdiomaMock.mockResolvedValue({ idioma: 'pt', perfil: 'GERENTE' })
  })

  it('erro 23505 na criação vira mensagem amigável, não o erro Postgres bruto', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'clientes') {
        return chainableInsert({
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint "clientes_loja_documento_unique"' },
        })
      }
      return chainableInsert({ data: null, error: null })
    })

    const { salvarClienteAction } = await import('./actions')
    const r = await salvarClienteAction({
      nome: 'Cliente Teste',
      tipo: 'PF',
      documento: '11122233344',
      email: null,
      telefone: null,
      endereco: null,
      limite_crediario: 0,
    })

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe('Já existe um cliente com este documento nesta loja.')
      expect(r.error).not.toContain('duplicate key')
      expect(r.error).not.toContain('constraint')
    }
  })

  it('erro 23505 na atualização também vira mensagem amigável', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'clientes') {
        return chainableInsert({
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint "clientes_loja_documento_unique"' },
        })
      }
      return chainableInsert({ data: null, error: null })
    })

    const { salvarClienteAction } = await import('./actions')
    const r = await salvarClienteAction({
      id: 'cli-1',
      nome: 'Cliente Teste',
      tipo: 'PF',
      documento: '11122233344',
      email: null,
      telefone: null,
      endereco: null,
      limite_crediario: 0,
    })

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe('Já existe um cliente com este documento nesta loja.')
    }
  })

  it('outro código de erro (não 23505) continua devolvendo a mensagem original', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'clientes') {
        return chainableInsert({ data: null, error: { code: '42501', message: 'permission denied' } })
      }
      return chainableInsert({ data: null, error: null })
    })

    const { salvarClienteAction } = await import('./actions')
    const r = await salvarClienteAction({
      nome: 'Cliente Teste',
      tipo: 'PF',
      documento: '11122233344',
      email: null,
      telefone: null,
      endereco: null,
      limite_crediario: 0,
    })

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe('permission denied')
    }
  })
})
