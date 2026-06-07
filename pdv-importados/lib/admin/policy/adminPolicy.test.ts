import { describe, expect, it } from 'vitest'
import type { AdminSession } from '@/lib/admin/auth/types'
import {
  canAccessAdmin,
  canAccessResource,
  canExecuteAction,
} from './adminPolicy'

const session: AdminSession = {
  userId: 'mgr-1',
  user: { id: 'mgr-1', email: 'g@test.local' },
  perfil: 'GERENTE',
  idioma: 'pt',
  lojaId: 'loja-1',
}

describe('adminPolicy', () => {
  it('canAccessAdmin aceita perfis gerenciais', () => {
    expect(canAccessAdmin(session)).toBe(true)
    expect(canAccessAdmin({ ...session, perfil: 'DONO' })).toBe(true)
    expect(canAccessAdmin({ ...session, perfil: 'ADMIN' })).toBe(true)
  })

  it('canExecuteAction valida actions registradas', () => {
    expect(canExecuteAction(session, 'estoque:kardex')).toBe(true)
    expect(canExecuteAction(session, 'vendas:detalhe')).toBe(true)
    expect(canExecuteAction(session, 'unknown:action')).toBe(true)
  })

  it('canAccessResource valida recursos registrados', () => {
    expect(canAccessResource(session, 'route:/admin/dashboard')).toBe(true)
    expect(canAccessResource(session, 'api:gerente:health')).toBe(true)
    expect(canAccessResource(session, 'sensitive:financeiro')).toBe(true)
  })
})
