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

function chainable(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(result),
  }
  obj.select = vi.fn(() => obj)
  obj.update = vi.fn(() => obj)
  obj.eq = vi.fn(() => obj)
  obj.in = vi.fn(() => obj)
  return obj
}

describe('gerente/suspensao actions — erro amigável em vez de Postgres bruto', () => {
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

  it('carregarSuspensaoVendas: erro de rede vira mensagem amigável com a seção, não a mensagem técnica bruta', async () => {
    fromMock.mockImplementation(() =>
      chainable({ data: null, error: { message: 'Failed to fetch' } }),
    )

    const { carregarSuspensaoVendas } = await import('./actions')
    const r = await carregarSuspensaoVendas()

    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error).not.toBe('Failed to fetch')
      expect(r.error).toContain('Suspensão de vendas')
      expect(r.error.toLowerCase()).toContain('rede')
    }
  })

  it('atualizarSuspensaoVendas: erro de permissão vira mensagem amigável com a seção', async () => {
    fromMock.mockImplementation(() =>
      chainable({ data: null, error: { message: 'permission denied for table configuracoes_gerais' } }),
    )

    const { atualizarSuspensaoVendas } = await import('./actions')
    const r = await atualizarSuspensaoVendas(true, 'Falta de energia')

    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error).not.toContain('permission denied for')
      expect(r.error).toContain('Suspensão de vendas')
    }
  })

  it('carregarSuspensaoVendas: sucesso continua devolvendo o status normalmente', async () => {
    fromMock.mockImplementation(() =>
      chainable({
        data: [
          { chave: 'vendas_suspensas', valor: 'true' },
          { chave: 'motivo_suspensao', valor: 'Falta de energia' },
        ],
        error: null,
      }),
    )

    const { carregarSuspensaoVendas } = await import('./actions')
    const r = await carregarSuspensaoVendas()

    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data).toEqual({ suspensas: true, motivo: 'Falta de energia' })
    }
  })
})
