import { beforeEach, describe, expect, it, vi } from 'vitest'

const st = vi.hoisted(() => ({
  rpc: vi.fn(), signUp: vi.fn(), deleteUser: vi.fn().mockResolvedValue({}),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: async () => new Map([['x-forwarded-for', '9.9.9.9']]) }))
vi.mock('@/lib/supabase/env', () => ({ assertSupabasePublicEnv: () => ({ url: 'http://x', key: 'k' }) }))
vi.mock('@/lib/auth/appOrigin', () => ({ buildAuthCallbackUrl: () => 'http://x/cb' }))
vi.mock('@/lib/cobranca/trialBootstrap', () => ({ bootstrapLojaTrial: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: st.rpc, auth: { admin: { deleteUser: st.deleteUser } } }) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { signUp: st.signUp } }) }))

import { iniciarTesteGratisAction } from './actions'

const E1 = 'e0000001-0000-4000-8000-000000000001'
const base = { empresaNome: 'Loja X', donoNome: 'Dona X', email: 'a@exemplo.com.br', senha: '12345678', aceiteTermos: true as const }

describe('teste grátis — não concede acesso a outra empresa', () => {
  beforeEach(() => {
    vi.stubEnv('PROVISIONAMENTO_AUTOMATICO_HABILITADO', 'true')
    st.rpc.mockReset(); st.signUp.mockReset(); st.deleteUser.mockClear()
    st.rpc.mockImplementation(async (fn: string) => fn === 'trial_registrar_tentativa'
      ? { data: true, error: null }
      : { data: { loja_id: 'l', trial_fim: '2026-11-03' }, error: null })
  })

  it('e-mail já cadastrado (signUp sem identities) é recusado e nada é provisionado', async () => {
    st.signUp.mockResolvedValue({ data: { user: { id: 'u-exist', identities: [] } }, error: null })
    const r = await iniciarTesteGratisAction(base)
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('já tem cadastro') })
    expect(st.rpc).not.toHaveBeenCalledWith('plataforma_iniciar_trial', expect.anything())
  })

  it('ids de empresa/loja extras no input não chegam à RPC; parâmetros vêm do banco (sem p_dias/limite fixos)', async () => {
    st.signUp.mockResolvedValue({ data: { user: { id: 'u-novo', identities: [{}] } }, error: null })
    const r = await iniciarTesteGratisAction({ ...base, empresa_id: E1, empresa: { id: E1 }, lojaId: 'x' } as never)
    expect(r.ok).toBe(true)
    const [, args] = st.rpc.mock.calls.find((c) => c[0] === 'plataforma_iniciar_trial')!
    expect(JSON.stringify(args)).not.toContain(E1)
    expect(args).not.toHaveProperty('p_dias')
    expect(args.p.usuarios).toEqual([expect.objectContaining({ id: 'u-novo', papel: 'DONO' })])
    const [, rl] = st.rpc.mock.calls.find((c) => c[0] === 'trial_registrar_tentativa')!
    expect(rl).not.toHaveProperty('p_max_por_ip_24h')
  })

  it('cria a ficha da Central de Conversão com o telefone; falha nela não desfaz o teste', async () => {
    st.signUp.mockResolvedValue({ data: { user: { id: 'u-novo', identities: [{}] } }, error: null })
    st.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'trial_registrar_tentativa') return { data: true, error: null }
      if (fn === 'commercial_trial_garantir_lead') throw new Error('rede caiu')
      return { data: { empresa_id: 'emp-1', loja_id: 'l', trial_fim: '2026-11-03' }, error: null }
    })
    const r = await iniciarTesteGratisAction({ ...base, telefone: '11 98888-7777' })
    expect(r.ok).toBe(true)
    expect(st.rpc).toHaveBeenCalledWith('commercial_trial_garantir_lead', { p_empresa: 'emp-1', p_telefone: '11 98888-7777' })
    expect(st.deleteUser).not.toHaveBeenCalled()
  })

  it('RPC recusa (usuário já existe) ⇒ usuário recém-criado no Auth é apagado (compensação)', async () => {
    st.signUp.mockResolvedValue({ data: { user: { id: 'u-novo', identities: [{}] } }, error: null })
    st.rpc.mockImplementation(async (fn: string) => fn === 'trial_registrar_tentativa'
      ? { data: true, error: null } : { data: null, error: { message: 'TRIAL_USUARIO_JA_EXISTE' } })
    const r = await iniciarTesteGratisAction(base)
    expect(r.ok).toBe(false)
    expect(st.deleteUser).toHaveBeenCalledWith('u-novo')
  })
})

describe('teste grátis — provisionamento automático bloqueado (hub não homologado)', () => {
  beforeEach(() => { st.rpc.mockReset(); st.signUp.mockReset(); vi.unstubAllEnvs() })

  it('sem PROVISIONAMENTO_AUTOMATICO_HABILITADO=true: recusa antes de criar usuário ou chamar RPC', async () => {
    vi.stubEnv('PROVISIONAMENTO_AUTOMATICO_HABILITADO', '')
    const r = await iniciarTesteGratisAction(base)
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('indisponível') })
    expect(st.signUp).not.toHaveBeenCalled()
    expect(st.rpc).not.toHaveBeenCalled()
  })
})
