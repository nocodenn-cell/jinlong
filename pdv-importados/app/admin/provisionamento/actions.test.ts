import { describe, expect, it, vi, beforeEach } from 'vitest'

// F1-04: ensureLoja e ensurePdvConfig não rodam na mesma transação SQL — são
// chamadas sequenciais via admin client. Se pdv_config falhar depois da loja
// já criada, a loja não pode sobreviver sem config (mesmo raciocínio da
// compensação já existente para o usuário de Auth).

const mockSession = {
  ok: true as const,
  session: { perfil: 'ADMIN', userId: 'admin-1' },
}

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: vi.fn(async () => mockSession),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

type Row = Record<string, unknown>

function makeAdminMock(opts: { pdvConfigInsertFails?: boolean } = {}) {
  const lojaRows: Row[] = []
  const pdvConfigRows: Row[] = []
  const calls: { table: string; op: string; payload?: Row }[] = []

  function chain(table: string) {
    const state: { filters: Record<string, unknown> } = { filters: {} }
    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        state.filters[col] = val
        return api
      },
      insert: (row: Row) => {
        calls.push({ table, op: 'insert', payload: row })
        if (table === 'lojas') {
          const saved = { id: 'loja-nova-1', ...row }
          lojaRows.push(saved)
          return {
            select: () => ({
              single: async () => ({ data: saved, error: null }),
            }),
          }
        }
        if (table === 'pdv_config') {
          if (opts.pdvConfigInsertFails) {
            return { then: (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'PDV_CONFIG_INSERT_FALHOU' } }) }
          }
          pdvConfigRows.push(row)
          return Promise.resolve({ data: [row], error: null })
        }
        return Promise.resolve({ data: [row], error: null })
      },
      update: (patch: Row) => {
        calls.push({ table, op: 'update', payload: patch })
        const updateFilters: Record<string, unknown> = {}
        const applyUpdate = () => {
          const rows = table === 'lojas' ? lojaRows : table === 'pdv_config' ? pdvConfigRows : []
          const row = rows.find((r) =>
            Object.entries(updateFilters).every(([k, v]) => r[k] === v),
          )
          if (row) Object.assign(row, patch)
          return { data: row ?? null, error: null }
        }
        const updateApi = {
          eq: (col: string, val: unknown) => {
            updateFilters[col] = val
            return updateApi
          },
          then: (resolve: (v: unknown) => void) => resolve(applyUpdate()),
        }
        return updateApi
      },
      upsert: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: async () => {
        if (table === 'lojas') {
          return { data: lojaRows.find((r) => r.codigo === state.filters.codigo) ?? null, error: null }
        }
        if (table === 'pdv_config') {
          return { data: pdvConfigRows.find((r) => r.loja_id === state.filters.loja_id) ?? null, error: null }
        }
        if (table === 'usuarios') return { data: null, error: null }
        return { data: null, error: null }
      },
      single: async () => ({ data: {}, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    }
    return api
  }

  const admin = {
    from: (table: string) => chain(table),
    auth: {
      admin: {
        listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
        createUser: vi.fn(async () => ({
          data: { user: { id: 'auth-user-1' } },
          error: null,
        })),
        deleteUser: vi.fn(async () => ({ error: null })),
      },
    },
  }

  return { admin, calls, lojaRows }
}

describe('provisionarLojaAction (F1-04)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('desativa a loja recem-criada se pdv_config falhar (compensacao)', async () => {
    const { admin, lojaRows } = makeAdminMock({ pdvConfigInsertFails: true })
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))

    const { provisionarLojaAction } = await import('./actions')

    const result = await provisionarLojaAction({
      lojaNome: 'Loja Teste F1-04',
      donoNome: 'Dono Teste',
      donoEmail: 'dono.f104@clientereal.com',
      donoSenha: 'senha-forte-123456',
      idiomaPreferido: 'pt',
    })

    expect(result.ok).toBe(false)
    expect(lojaRows[0]?.ativo).toBe(false)
  })

  it('nao desativa a loja quando pdv_config e criado com sucesso', async () => {
    const { admin, lojaRows } = makeAdminMock({ pdvConfigInsertFails: false })
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))

    const { provisionarLojaAction } = await import('./actions')

    await provisionarLojaAction({
      lojaNome: 'Loja Teste F1-04 OK',
      donoNome: 'Dono Teste',
      donoEmail: 'dono.f104.ok@clientereal.com',
      donoSenha: 'senha-forte-123456',
      idiomaPreferido: 'pt',
    })

    // A validação final do provisionamento (dono/checklist) não é o foco deste
    // teste — cobre especificamente a garantia do F1-04: pdv_config criado com
    // sucesso não deixa a loja em estado de compensação/desativada.
    expect(lojaRows[0]?.ativo).toBe(true)
  })
})
