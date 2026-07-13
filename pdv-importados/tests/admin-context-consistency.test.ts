import { describe, expect, it } from 'vitest'
import { getAdminContext } from '@/lib/admin/context/adminContext'
import type { AdminSession } from '@/lib/admin/auth/types'
import { mockSupabaseUser } from './helpers/mockSupabaseUser'

function makeSession(overrides: Partial<AdminSession> = {}): AdminSession {
  return {
    userId: 'mgr-1',
    user: mockSupabaseUser('mgr-1', 'gerente@test.local'),
    perfil: 'GERENTE',
    idioma: 'pt',
    lojaId: 'loja-1',
    ...overrides,
  }
}

describe('admin context consistency', () => {
  it('getAdminContext(sessionA) === getAdminContext(sessionB) quando sessionA === sessionB', () => {
    const sessionA = makeSession()
    const sessionB = makeSession()
    const request = {
      pathname: '/admin/dashboard',
      resource: 'route:/admin/dashboard',
      action: 'estoque:kardex',
    }

    expect(getAdminContext(sessionA, request)).toEqual(getAdminContext(sessionB, request))
  })

  it('mesma sessão com request vazio produz contexto estável', () => {
    const session = makeSession()
    const ctxA = getAdminContext(session, {})
    const ctxB = getAdminContext(session, {})

    expect(ctxA).toEqual(ctxB)
    expect(ctxA.session).toBe(session)
  })

  it('request diferente altera scope sem alterar session', () => {
    const session = makeSession()
    const dashboard = getAdminContext(session, { pathname: '/admin/dashboard' })
    const vendas = getAdminContext(session, { pathname: '/admin/vendas' })

    expect(dashboard.session).toEqual(vendas.session)
    expect(dashboard.routeScope).not.toBe(vendas.routeScope)
  })
})
