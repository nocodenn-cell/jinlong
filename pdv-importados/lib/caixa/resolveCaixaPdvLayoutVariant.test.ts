import { describe, expect, it } from 'vitest'
import { resolveCaixaPdvLayoutVariant } from '@/lib/caixa/resolveCaixaPdvLayoutVariant'

describe('resolveCaixaPdvLayoutVariant', () => {
  it('usa classic quando env não definida (demo comercial)', () => {
    expect(resolveCaixaPdvLayoutVariant(undefined)).toBe('classic')
  })

  it('respeita classic explícito', () => {
    expect(resolveCaixaPdvLayoutVariant('classic')).toBe('classic')
  })

  it('respeita default explícito para layout legado', () => {
    expect(resolveCaixaPdvLayoutVariant('default')).toBe('default')
  })
})
