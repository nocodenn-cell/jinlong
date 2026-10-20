import { describe, expect, it, vi } from 'vitest'
import { emailDescartavel, hashAntiAbuso, montarPayloadTrial, TrialSignupSchema, verificarCaptcha } from './trialSignup'

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
    expect(await verificarCaptcha(undefined, null, { TRIAL_CAPTCHA_SECRET: 's' }, f)).toBe(false)
    expect(await verificarCaptcha('tok', '1.1.1.1', { TRIAL_CAPTCHA_SECRET: 's' }, f)).toBe(true)
  })
})
