import { describe, expect, it } from 'vitest'
import type { AdminSession } from '@/lib/admin/auth/types'
import { getAdminContext } from './adminContext'
import { mockSupabaseUser } from '../../../tests/helpers/mockSupabaseUser'

const session: AdminSession = {
  userId: 'mgr-1',
  user: mockSupabaseUser('mgr-1', 'g@test.local'),
  perfil: 'GERENTE',
  idioma: 'pt',
  lojaId: 'loja-1',
}

describe('getAdminContext', () => {
  it('retorna estrutura mínima agregada', () => {
    const ctx = getAdminContext(session, {
      pathname: '/admin/dashboard',
      resource: 'route:/admin/dashboard',
      action: 'estoque:kardex',
    })

    expect(ctx.session).toEqual(session)
    expect(ctx.routeScope).toBe('route:/admin/dashboard')
    expect(ctx.resourceScope).toBe('route:/admin/dashboard')
    expect(ctx.permissions.accessAdmin).toBe(true)
    expect(ctx.featureFlags.painelGerencial).toBe(true)
    expect(typeof ctx.isReadOnlyMode).toBe('boolean')
  })

  it('é idempotente para mesma sessão e request', () => {
    const request = { pathname: '/admin/vendas', action: 'vendas:detalhe' as const }
    const a = getAdminContext(session, request)
    const b = getAdminContext(session, request)
    expect(a).toEqual(b)
  })
})
