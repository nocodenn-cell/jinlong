import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildAuthCallbackUrl } from './appOrigin'

/**
 * `buildAuthCallbackUrl` cai em `NEXT_PUBLIC_APP_URL` quando roda no servidor.
 * O teste original assumia a variável ausente e passava a falhar em qualquer
 * máquina com `.env.local` — inclusive na do desenvolvedor, virando ruído
 * permanente. Agora o cenário é explícito nos dois sentidos.
 */
describe('buildAuthCallbackUrl', () => {
  const original = process.env.NEXT_PUBLIC_APP_URL

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = original
  })

  it('monta callback com next quando sem origin', () => {
    expect(buildAuthCallbackUrl('/auth/redefinir-senha')).toBe(
      '/auth/callback?next=%2Fauth%2Fredefinir-senha',
    )
  })

  it('prefixa a origem quando NEXT_PUBLIC_APP_URL está definida', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.exemplo.com'
    expect(buildAuthCallbackUrl('/auth/redefinir-senha')).toBe(
      'https://app.exemplo.com/auth/callback?next=%2Fauth%2Fredefinir-senha',
    )
  })
})
