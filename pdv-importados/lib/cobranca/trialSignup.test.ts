import { describe, expect, it, vi } from 'vitest'
import { emailDescartavel, hashAntiAbuso, montarPayloadTrial, TrialSignupSchema, verificarCaptcha, saltAntiAbuso } from './trialSignup'

const base = { empresaNome: 'Loja da Ana', donoNome: 'Ana', email: 'Ana@Exemplo.com', senha: '12345678', aceiteTermos: true as const }

describe('TrialSignupSchema', () => {
  it('normaliza e-mail e aplica defaults', () => {
    const d = TrialSignupSchema.parse(base)
    expect(d.email).toBe('ana@exemplo.com')
    expect(d.plano).toBe('ATACADO')
  })
  it('exige aceite dos termos e senha >= 8', () => {
    expect(TrialSignupSchema.safeParse({ ...base, aceiteTermos: false }).success).toBe(false)
    expect(TrialSignupSchema.safeParse({ ...base, senha: '123' }).success).toBe(false)
  })
  it('honeypot preenchido falha', () => {
    expect(TrialSignupSchema.safeParse({ ...base, site: 'http://spam' }).success).toBe(false)
  })
})

it('payload do trial: 1 loja, só o DONO, demo ligado', () => {
  const p = montarPayloadTrial(TrialSignupSchema.parse(base), 'uid-1')
  expect(p.lojas).toHaveLength(1)
  expect(p.usuarios).toEqual([{ id: 'uid-1', nome: 'Ana', papel: 'DONO', idioma: 'pt' }])
  expect(p.demo).toBe(true)
})

it('hash anti-abuso é estável, com sal e sem o valor em claro', () => {
  const a = hashAntiAbuso('1.2.3.4', 's'), b = hashAntiAbuso(' 1.2.3.4 ', 's')
  expect(a).toBe(b)
  expect(a).not.toContain('1.2.3.4')
  expect(hashAntiAbuso('1.2.3.4', 'outro')).not.toBe(a)
})

it('e-mail descartável', () => {
  expect(emailDescartavel('x@mailinator.com')).toBe(true)
  expect(emailDescartavel('x@gmail.com')).toBe(false)
})

describe('verificarCaptcha', () => {
  it('sem segredo configurado ⇒ desligado', async () => {
    expect(await verificarCaptcha(undefined, null, {})).toBe(true)
  })
  it('com segredo: sem token falha; token válido passa', async () => {
    const f = vi.fn().mockResolvedValue({ json: async () => ({ success: true }) })
    expect(await verificarCaptcha(undefined, null, { TRIAL_CAPTCHA_SECRET: 's', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'k' }, f)).toBe(false)
    expect(await verificarCaptcha('tok', '1.1.1.1', { TRIAL_CAPTCHA_SECRET: 's', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'k' }, f)).toBe(true)
  })
})

it('só segredo sem chave do site ⇒ captcha desligado (não trava o cadastro)', async () => {
  expect(await verificarCaptcha(undefined, null, { TRIAL_CAPTCHA_SECRET: 's' })).toBe(true)
})
it('verificação envia secret, token e IP ao siteverify; resposta falsa recusa', async () => {
  const f = vi.fn().mockResolvedValue({ json: async () => ({ success: false }) })
  expect(await verificarCaptcha('tok', '1.1.1.1', { TRIAL_CAPTCHA_SECRET: 's', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'k' }, f)).toBe(false)
  const body = f.mock.calls[0][1].body as URLSearchParams
  expect([body.get('secret'), body.get('response'), body.get('remoteip')]).toEqual(['s', 'tok', '1.1.1.1'])
})

describe('saltAntiAbuso', () => {
  it('produção sem TRIAL_HASH_SALT ⇒ null (nunca deriva da service role)', () => {
    expect(saltAntiAbuso({ VERCEL_ENV: 'production', SUPABASE_SERVICE_ROLE_KEY: 'segredo-service-role-1234567890' })).toBeNull()
    expect(saltAntiAbuso({ NODE_ENV: 'production' })).toBeNull()
  })
  it('sal curto é recusado em produção', () => {
    expect(saltAntiAbuso({ VERCEL_ENV: 'production', TRIAL_HASH_SALT: 'curto' })).toBeNull()
  })
  it('usa TRIAL_HASH_SALT quando configurado', () => {
    expect(saltAntiAbuso({ VERCEL_ENV: 'production', TRIAL_HASH_SALT: 'sal-forte-de-teste-123456' })).toBe('sal-forte-de-teste-123456')
  })
  it('fora de produção usa sal de dev fixo', () => {
    expect(saltAntiAbuso({ NODE_ENV: 'test' })).toMatch(/dev/)
  })
})
