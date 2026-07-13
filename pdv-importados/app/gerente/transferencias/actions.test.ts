import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const assertGerenteSessionMock = vi.fn()
const revalidatePathMock = vi.fn()
const rpcMock = vi.fn()
const createClientMock = vi.fn(async () => ({ rpc: rpcMock }))

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: assertGerenteSessionMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

describe('gerente/transferencias actions', () => {
  beforeAll(async () => {
    await import('./actions')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSessionMock.mockResolvedValue({
      ok: true,
      session: { userId: 'mgr-1', lojaId: 'loja-1' },
    })
  })

  it('bloqueia transferência com origem = destino', async () => {
    const { executarTransferencia } = await import('./actions')
    const res = await executarTransferencia({
      loja_origem_id: 'l1',
      loja_destino_id: 'l1',
      produto_id: 'p1',
      quantidade: 10,
      observacao: '',
      idempotency_key: 'k-1',
    })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toContain('diferentes')
    }
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('retorna erro orientado para saldo insuficiente', async () => {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === 'obter_estoque_disponivel_transferencia') {
        return {
          data: [{ quantidade_disponivel: 3, unidade_medida: 'UN', limite_observacao: 50 }],
          error: null,
        }
      }
      return { data: null, error: null }
    })

    const { executarTransferencia } = await import('./actions')
    const res = await executarTransferencia({
      loja_origem_id: 'l1',
      loja_destino_id: 'l2',
      produto_id: 'p1',
      quantidade: 10,
      observacao: '',
      idempotency_key: 'k-2',
    })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toContain('Saldo insuficiente na origem')
      expect(res.error).toContain('Disponível')
      expect(res.error).toContain('solicitado')
    }
  })

  it('exige observação quando quantidade passa do limite', async () => {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === 'obter_estoque_disponivel_transferencia') {
        return {
          data: [{ quantidade_disponivel: 100, unidade_medida: 'UN', limite_observacao: 50 }],
          error: null,
        }
      }
      return { data: null, error: null }
    })

    const { executarTransferencia } = await import('./actions')
    const res = await executarTransferencia({
      loja_origem_id: 'l1',
      loja_destino_id: 'l2',
      produto_id: 'p1',
      quantidade: 51,
      observacao: '',
      idempotency_key: 'k-3',
    })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toContain('Observação obrigatória')
    }
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it('envia idempotency_key e aceita repetição (duplo clique lógico)', async () => {
    rpcMock.mockImplementation(async (name: string, payload: Record<string, unknown>) => {
      if (name === 'obter_estoque_disponivel_transferencia') {
        return {
          data: [{ quantidade_disponivel: 100, unidade_medida: 'UN', limite_observacao: 50 }],
          error: null,
        }
      }
      if (name === 'transferir_estoque_seguro') {
        expect(payload.p_idempotency_key).toBe('k-duplo')
        return { data: '11111111-1111-1111-1111-111111111111', error: null }
      }
      return { data: null, error: null }
    })

    const { executarTransferencia } = await import('./actions')
    const input = {
      loja_origem_id: 'l1',
      loja_destino_id: 'l2',
      produto_id: 'p1',
      quantidade: 10,
      observacao: 'ok',
      idempotency_key: 'k-duplo',
    }

    const r1 = await executarTransferencia(input)
    const r2 = await executarTransferencia(input)

    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
    if (r1.ok && r2.ok) {
      expect(r1.data.transferenciaId).toBe('11111111-1111-1111-1111-111111111111')
      expect(r2.data.transferenciaId).toBe('11111111-1111-1111-1111-111111111111')
    }
    expect(revalidatePathMock).toHaveBeenCalled()
  })
})
