import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertGerenteOuDono: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth/gerenteOuDono', () => ({
  assertGerenteOuDono: mocks.assertGerenteOuDono,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

type QueryStub = {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
}

function createSupabaseStub() {
  const inserts: Array<Record<string, unknown>> = []

  const createQuery = (): QueryStub => {
    const query = {} as QueryStub
    query.select = vi.fn(() => query)
    query.eq = vi.fn(() => query)
    query.insert = vi.fn((payload: Record<string, unknown>) => {
      inserts.push(payload)
      return query
    })
    query.update = vi.fn(() => query)
    query.maybeSingle = vi.fn(async () => ({ data: { loja_id: 'loja-1' }, error: null }))
    query.single = vi.fn(async () => ({
      data: {
        id: 'cliente-1',
        nome: 'Cliente Loja',
        tipo: 'PF',
        documento: '12345678901',
        email: null,
        telefone: null,
        endereco: null,
        limite_crediario: 100,
        saldo_crediario: 0,
        ultima_compra: null,
        criado_em: null,
      },
      error: null,
    }))
    return query
  }

  return {
    inserts,
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
      from: vi.fn(() => createQuery()),
    },
  }
}

describe('gerente/clientes actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.assertGerenteOuDono.mockResolvedValue({ ok: true })
  })

  it('preenche loja_id ao salvar novo cliente', async () => {
    const supabase = createSupabaseStub()
    mocks.createClient.mockResolvedValue(supabase.client)
    const { salvarClienteAction } = await import('./actions')

    const result = await salvarClienteAction({
      nome: 'Cliente Loja',
      tipo: 'PF',
      documento: '12345678901',
      email: null,
      telefone: null,
      endereco: null,
      limite_crediario: 100,
    })

    expect(result.ok).toBe(true)
    expect(supabase.inserts).toContainEqual({
      nome: 'Cliente Loja',
      tipo: 'PF',
      documento: '12345678901',
      email: null,
      telefone: null,
      endereco: null,
      limite_crediario: 100,
      loja_id: 'loja-1',
    })
  })
})
