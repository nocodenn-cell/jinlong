/**
 * Onda B (extensão) — `data_emissao` padrão da OC é o dia civil da loja (`hojeYmd`), não o dia UTC.
 * Antes: `new Date().toISOString().slice(0, 10)` → entre 21h e 24h BRT a OC saía com a data de amanhã.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const assertGerenteSession = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())
const getGerenteUserId = vi.hoisted(() => vi.fn())
const getGerenteLojaId = vi.hoisted(() => vi.fn())

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({ assertGerenteSession }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/gerente/auth/sessionContext', () => ({ getGerenteUserId, getGerenteLojaId }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { atualizarOrdemCompra, criarOrdemCompra } from './actions'

const item = { quantidade: 1, preco_unitario: 10, unidade_medida: 'UN', descricao: 'Item' }

/** Cadeia thenable: qualquer método devolve a mesma cadeia e `await` resolve com `result`. */
function chain(result: Record<string, unknown>, onCall?: (m: string, args: unknown[]) => void): unknown {
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') return (res: (v: unknown) => unknown) => res(result)
      return (...args: unknown[]) => {
        onCall?.(String(prop), args)
        return new Proxy({}, handler)
      }
    },
  }
  return new Proxy({}, handler)
}

let payloadOc: Record<string, unknown> | null = null

function supabaseStub() {
  return {
    from: (table: string) =>
      table === 'ordens_compra'
        ? chain({ data: { id: 'oc1', status: 'RASCUNHO' }, error: null, count: 0 }, (m, args) => {
            if (m === 'insert' || m === 'update') payloadOc = args[0] as Record<string, unknown>
          })
        : chain({ data: null, error: null, count: 0 }),
  }
}

describe('data_emissao padrão da OC — dia civil de Brasília (Onda B)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    payloadOc = null
    assertGerenteSession.mockResolvedValue({
      ok: true,
      session: { lojaId: 'loja-a', idioma: 'pt', userId: 'u1' },
    })
    getGerenteUserId.mockResolvedValue('u1')
    createClient.mockResolvedValue(supabaseStub())
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => vi.useRealTimers())

  it('criar às 23:30 BRT (30/09): emite com 2026-09-30, não 2026-10-01', async () => {
    vi.setSystemTime(new Date('2026-10-01T02:30:00Z'))
    const r = await criarOrdemCompra({ itens: [item] })
    expect(r.success).toBe(true)
    expect(payloadOc?.data_emissao).toBe('2026-09-30')
  })

  it('criar às 00:10 BRT (01/10): emite com 2026-10-01', async () => {
    vi.setSystemTime(new Date('2026-10-01T03:10:00Z'))
    await criarOrdemCompra({ itens: [item] })
    expect(payloadOc?.data_emissao).toBe('2026-10-01')
  })

  it('atualizar às 23:30 BRT e 00:10 BRT (sem data informada) usa o mesmo dia civil', async () => {
    vi.setSystemTime(new Date('2026-10-01T02:30:00Z'))
    const r = await atualizarOrdemCompra({ id: 'oc1', itens: [item] })
    expect(r.success).toBe(true)
    expect(payloadOc?.data_emissao).toBe('2026-09-30')

    payloadOc = null
    vi.setSystemTime(new Date('2026-10-01T03:10:00Z'))
    await atualizarOrdemCompra({ id: 'oc1', itens: [item] })
    expect(payloadOc?.data_emissao).toBe('2026-10-01')
  })

  it('data informada pelo usuário continua valendo (criar e atualizar)', async () => {
    vi.setSystemTime(new Date('2026-10-01T02:30:00Z'))
    await criarOrdemCompra({ itens: [item], data_emissao: '2026-08-15' })
    expect(payloadOc?.data_emissao).toBe('2026-08-15')
    payloadOc = null
    await atualizarOrdemCompra({ id: 'oc1', itens: [item], data_emissao: '2026-08-16' })
    expect(payloadOc?.data_emissao).toBe('2026-08-16')
  })
})
