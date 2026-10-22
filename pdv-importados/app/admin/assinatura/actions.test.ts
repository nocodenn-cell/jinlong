import { beforeEach, describe, expect, it, vi } from 'vitest'

const st = vi.hoisted(() => ({
  perfil: 'DONO' as string,
  souDono: true,
  lockLivre: true,
  rpcAdmin: vi.fn(),
  criarAssinatura: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: async () => ({ ok: true, session: { perfil: st.perfil } }),
}))
vi.mock('@/lib/multiempresa/empresaContexto', () => ({ empresaContextoId: async () => 'emp-b' }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { email: 'dono@exemplo.test' } } }) },
    rpc: async (fn: string) => {
      if (fn === 'fp_sou_dono_da_empresa') return { data: st.souDono, error: null }
      if (fn === 'planos_catalogo') return { data: [], error: null }
      return { data: null, error: null }
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: st.rpcAdmin }) }))
vi.mock('@/lib/cobranca/asaas', async (orig) => {
  const real = await orig<typeof import('@/lib/cobranca/asaas')>()
  return {
    ...real,
    getAsaas: () => ({
      criarCliente: async () => ({ id: 'cus_1' }),
      criarAssinatura: st.criarAssinatura,
      atualizarAssinatura: vi.fn(),
    }),
  }
})

import { assinarPlanoAction } from './actions'

const input = { plano: 'BASICO' as const, addons: [], qtdLojas: 1, qtdCaixas: 1, forma: 'PIX' as const }

beforeEach(() => {
  st.perfil = 'DONO'
  st.souDono = true
  st.lockLivre = true
  st.criarAssinatura.mockReset().mockResolvedValue({ id: 'sub_1', nextDueDate: '2026-11-01', value: 99, billingType: 'PIX' })
  st.rpcAdmin.mockReset().mockImplementation(async (fn: string) => {
    if (fn === 'cobranca_reservar_assinar') return { data: st.lockLivre, error: null }
    if (fn === 'cobranca_estado_empresa') return { data: { empresa: { nome: 'B', cnpj: null }, lojas_ativas: 1, assinatura: null }, error: null }
    return { data: null, error: null }
  })
})

describe('assinarPlanoAction — gate de DONO por empresa', () => {
  it('ADMIN global que não é DONO da empresa do contexto ⇒ recusado, sem tocar no Asaas', async () => {
    st.perfil = 'ADMIN'
    st.souDono = false
    const r = await assinarPlanoAction(input)
    expect(r.ok).toBe(false)
    expect(st.criarAssinatura).not.toHaveBeenCalled()
    expect(st.rpcAdmin).not.toHaveBeenCalled()
  })
  it('DONO da empresa ⇒ cria assinatura e libera o lock', async () => {
    const r = await assinarPlanoAction(input)
    expect(r.ok).toBe(true)
    expect(st.criarAssinatura).toHaveBeenCalledTimes(1)
    expect(st.rpcAdmin).toHaveBeenCalledWith('cobranca_liberar_assinar', { p_empresa: 'emp-b' })
  })
})

describe('assinarPlanoAction — idempotência', () => {
  it('lock ocupado (2º clique) ⇒ recusado sem criar outra assinatura no Asaas', async () => {
    st.lockLivre = false
    const r = await assinarPlanoAction(input)
    expect(r.ok).toBe(false)
    expect(st.criarAssinatura).not.toHaveBeenCalled()
  })
  it('falha no Asaas ⇒ lock liberado mesmo assim', async () => {
    st.criarAssinatura.mockRejectedValue(new Error('boom'))
    const r = await assinarPlanoAction(input)
    expect(r.ok).toBe(false)
    expect(st.rpcAdmin).toHaveBeenCalledWith('cobranca_liberar_assinar', { p_empresa: 'emp-b' })
  })
})
