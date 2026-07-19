import { describe, expect, it } from 'vitest'
import { buildAuthCallbackUrl } from './appOrigin'

describe('buildAuthCallbackUrl', () => {
  it('monta callback com next quando sem origin', () => {
    const url = buildAuthCallbackUrl('/auth/redefinir-senha')
    expect(url).toBe('/auth/callback?next=%2Fauth%2Fredefinir-senha')
  })
})
