import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertGerenteOuDono: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  runServerActionWithObservability: vi.fn(),
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

vi.mock('@/lib/observability/runServerAction', () => ({
  runServerActionWithObservability: mocks.runServerActionWithObservability,
}))

type InsertCall = { table: string; payload: Record<string, unknown> }
type QueryStub = {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
}

function createSupabaseStub(options?: { clienteExiste?: boolean; lojaId?: string | null }) {
  const inserts: InsertCall[] = []
  const lojaId = options?.lojaId ?? 'loja-1'
  const clienteExiste = options?.clienteExiste ?? true

  const resolveMaybeSingle = (table: string) => {
    if (table === 'usuarios') return { data: { loja_id: lojaId }, error: null }
    if (table === 'clientes') {
      return { data: clienteExiste ? { id: 'cliente-1' } : null, error: null }
    }
    return { data: null, error: null }
  }

  const resolveSingle = (table: string) => {
    if (table === 'clientes') return { data: { id: 'cliente-1' }, error: null }
    if (table === 'contas_receber') return { data: { id: 'titulo-1' }, error: null }
    return { data: null, error: null }
  }

  const createQuery = (table: string): QueryStub => {
    const query = {} as QueryStub
    query.select = vi.fn(() => query)
    query.eq = vi.fn(() => query)
    query.insert = vi.fn((payload: Record<string, unknown>) => {
      inserts.push({ table, payload })
      return query
    })
    query.maybeSingle = vi.fn(async () => resolveMaybeSingle(table))
    query.single = vi.fn(async () => resolveSingle(table))
    return query
  }

  return {
    inserts,
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
      from: vi.fn((table: string) => createQuery(table)),
    },
  }
}

describe('gerente/financeiro actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.assertGerenteOuDono.mockResolvedValue({ ok: true })
    mocks.runServerActionWithObservability.mockImplementation(async (_stage: string, fn: () => Promise<unknown>) => {
      try {
        return { ok: true, data: await fn() }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Erro inesperado' }
      }
    })
  })

  it('preenche loja_id ao criar cliente financeiro', async () => {
    const supabase = createSupabaseStub()
    mocks.createClient.mockResolvedValue(supabase.client)
    const { criarCliente } = await import('./actions')

    const result = await criarCliente({ nome: 'Cliente Loja', documento: '123', telefone: '999' })

    expect(result).toEqual({ success: true, data: 'cliente-1' })
    expect(supabase.inserts).toContainEqual({
      table: 'clientes',
      payload: {
        nome: 'Cliente Loja',
        loja_id: 'loja-1',
        documento: '123',
        telefone: '999',
      },
    })
  })

  it('preenche loja_id ao criar titulo da loja atual', async () => {
    const supabase = createSupabaseStub()
    mocks.createClient.mockResolvedValue(supabase.client)
    const { criarTituloReceber } = await import('./actions')

    const result = await criarTituloReceber({ cliente_id: 'cliente-1', valor_total: 50 })

    expect(result).toEqual({ success: true, data: 'titulo-1' })
    expect(supabase.inserts).toContainEqual({
      table: 'contas_receber',
      payload: {
        cliente_id: 'cliente-1',
        loja_id: 'loja-1',
        valor_total: 50,
        valor_aberto: 50,
        descricao: null,
        vencimento: null,
        status: 'ABERTO',
      },
    })
  })

  it('bloqueia titulo para cliente fora da loja atual', async () => {
    const supabase = createSupabaseStub({ clienteExiste: false })
    mocks.createClient.mockResolvedValue(supabase.client)
    const { criarTituloReceber } = await import('./actions')

    const result = await criarTituloReceber({ cliente_id: 'cliente-externo', valor_total: 50 })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('Cliente não encontrado')
    expect(supabase.inserts).not.toContainEqual(
      expect.objectContaining({ table: 'contas_receber' }),
    )
  })
})
