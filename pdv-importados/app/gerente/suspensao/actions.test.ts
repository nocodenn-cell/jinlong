import { beforeEach, describe, expect, it, vi } from 'vitest'

type Resp = { data: Array<{ chave: string }> | null; error: { message: string } | null }

const respostas: Resp[] = []
const chamadas: Array<{ valor: string; chave: string; select: string }> = []

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: async () => ({ ok: true, session: {} }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      update: ({ valor }: { valor: string }) => ({
        eq: (_col: string, chave: string) => ({
          select: async (select: string) => {
            chamadas.push({ valor, chave, select })
            return respostas.shift() ?? { data: [{ chave }], error: null }
          },
        }),
      }),
    }),
  }),
}))

const { atualizarSuspensaoVendas } = await import('./actions')

beforeEach(() => {
  respostas.length = 0
  chamadas.length = 0
})

describe('atualizarSuspensaoVendas — persistência confirmada', () => {
  it('UPDATEs encontram a linha → sucesso, com flag e motivo gravados', async () => {
    const r = await atualizarSuspensaoVendas(true, '  Inventário ')
    expect(r.success).toBe(true)
    expect(chamadas).toEqual([
      { chave: 'vendas_suspensas', valor: 'true', select: 'chave' },
      { chave: 'motivo_suspensao', valor: 'Inventário', select: 'chave' },
    ])
  })

  it('UPDATE da flag sem nenhuma linha afetada (linha ausente ou RLS) → erro, sem tocar no motivo', async () => {
    respostas.push({ data: [], error: null })
    const r = await atualizarSuspensaoVendas(true, 'x')
    expect(r.success).toBe(false)
    expect(chamadas).toHaveLength(1)
  })

  it('UPDATE da flag com data nula → erro (nunca sucesso falso)', async () => {
    respostas.push({ data: null, error: null })
    const r = await atualizarSuspensaoVendas(false, '')
    expect(r.success).toBe(false)
  })

  it('erro do banco no primeiro UPDATE → erro com a mensagem', async () => {
    respostas.push({ data: null, error: { message: 'boom' } })
    const r = await atualizarSuspensaoVendas(true, 'x')
    expect(r).toEqual({ success: false, error: 'boom' })
  })

  it('falha (0 linhas) no segundo UPDATE → erro que avisa da falha parcial', async () => {
    respostas.push({ data: [{ chave: 'vendas_suspensas' }], error: null })
    respostas.push({ data: [], error: null })
    const r = await atualizarSuspensaoVendas(true, 'x')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toContain('motivo')
    expect(chamadas).toHaveLength(2)
  })

  it('erro do banco no segundo UPDATE → erro', async () => {
    respostas.push({ data: [{ chave: 'vendas_suspensas' }], error: null })
    respostas.push({ data: null, error: { message: 'falhou motivo' } })
    const r = await atualizarSuspensaoVendas(true, 'x')
    expect(r).toEqual({ success: false, error: 'falhou motivo' })
  })

  it('mais de uma linha afetada → erro (esperado exatamente uma)', async () => {
    respostas.push({ data: [{ chave: 'a' }, { chave: 'b' }], error: null })
    const r = await atualizarSuspensaoVendas(true, 'x')
    expect(r.success).toBe(false)
  })
})
