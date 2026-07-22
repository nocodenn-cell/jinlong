import { describe, expect, it } from 'vitest'
import {
  ADMIN_DONO_REUSE_ERROR,
  getDonoReuseError,
} from './provisionamentoPolicies'

describe('getDonoReuseError', () => {
  it('impede rebaixar ADMIN da plataforma para DONO', () => {
    expect(getDonoReuseError('ADMIN')).toBe(ADMIN_DONO_REUSE_ERROR)
  })

  it('permite reutilizar somente um perfil DONO', () => {
    expect(getDonoReuseError('DONO')).toBeNull()
    expect(getDonoReuseError('OPERADOR')).toContain('perfil OPERADOR')
  })
})
