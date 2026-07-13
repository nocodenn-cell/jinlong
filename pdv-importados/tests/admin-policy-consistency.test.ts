import { describe, expect, it } from 'vitest'

import { normalizeAdminSession, type RawSession } from '@/lib/admin/auth/sessionConsistency'

import type { AdminSession } from '@/lib/admin/auth/types'

import {
  actionAdminDecision,
  apiAdminDecision,
  canAccessAdmin,
  middlewareAdminDecision,
  middlewareAllowsAccess,
} from '@/lib/admin/policy/adminPolicy'
import { mockSupabaseUser } from './helpers/mockSupabaseUser'

const gerenteUser = mockSupabaseUser('mgr-1', 'gerente@test.local')
const gerenteRow = { perfil: 'GERENTE', idioma_preferido: 'pt', loja_id: 'loja-1' }

function makeSession(overrides: Partial<AdminSession> = {}): AdminSession {
  return {
    userId: 'mgr-1',
    user: gerenteUser,
    perfil: 'GERENTE',
    idioma: 'pt',
    lojaId: 'loja-1',
    ...overrides,
  }
}

function rawAuthenticated(): RawSession {
  return { status: 'authenticated', user: gerenteUser, usuario: gerenteRow }
}

describe('admin policy authority convergence', () => {
  it('canAccessAdmin alinha edge, api e action para sessão gerente', () => {
    const session = makeSession()
    const normalized = normalizeAdminSession(rawAuthenticated(), 'edge')

    const edge = middlewareAdminDecision(normalized, '/admin/dashboard')
    const api = apiAdminDecision(session, 'api:gerente:health')
    const action = actionAdminDecision(session, 'estoque:kardex')

    expect(canAccessAdmin(session)).toBe(true)
    expect(edge.type).toBe('allow')
    expect(api.type).toBe('allow')
    expect(action.type).toBe('allow')
  })

  it('nega de forma idêntica quando sessão é null', () => {
    const anon = normalizeAdminSession({ status: 'anonymous' }, 'edge')
    const edge = middlewareAllowsAccess(anon, '/admin/dashboard')
    const api = apiAdminDecision(null, 'api:gerente:health')
    const action = actionAdminDecision(null, 'estoque:kardex')

    expect(edge).toBe(false)
    expect(api.type).toBe('deny')
    expect(action.type).toBe('deny')
  })

  it('operador autenticado: edge redirect /caixa; api/action deny', () => {
    const raw: RawSession = {
      status: 'authenticated',
      user: mockSupabaseUser('op-1', 'op@test.local'),
      usuario: { perfil: 'OPERADOR', idioma_preferido: 'pt', loja_id: 'loja-1' },
    }
    const normalized = normalizeAdminSession(raw, 'edge')

    const edge = middlewareAdminDecision(normalized, '/admin/vendas')
    const api = apiAdminDecision(normalized.session, 'api:gerente:health')
    const action = actionAdminDecision(normalized.session, 'estoque:kardex')

    expect(edge).toEqual({
      type: 'redirect',
      target: '/caixa',
      reason: 'perfil_nao_gerencial',
      scope: 'edge',
    })
    expect(api.type).toBe('deny')
    expect(action.type).toBe('deny')
  })

  it('operador sem loja vinculada: bloqueado em qualquer rota protegida', () => {
    const raw: RawSession = {
      status: 'authenticated',
      user: mockSupabaseUser('op-1', 'op@test.local'),
      usuario: { perfil: 'OPERADOR', idioma_preferido: 'pt', loja_id: null },
    }
    const normalized = normalizeAdminSession(raw, 'edge')

    expect(normalized.authState).toBe('blocked')
    expect(normalized.blockedReason).toBe('sem_loja')
    const edge = middlewareAdminDecision(normalized, '/caixa')
    expect(edge.type).toBe('redirect')
    expect(edge.target).toContain('/login')
    expect(edge.reason).toBe('conta_sem_loja')
  })

  it('gerente autenticado: pode abrir o PDV /caixa (sem redirect para /gerente)', () => {
    const normalized = normalizeAdminSession(rawAuthenticated(), 'edge')

    const edge = middlewareAdminDecision(normalized, '/caixa')

    expect(edge.type).toBe('allow')
    expect(middlewareAllowsAccess(normalized, '/caixa')).toBe(true)
  })

  it('Decision edge inclui type, target, reason, scope', () => {
    const decision = middlewareAdminDecision(
      normalizeAdminSession({ status: 'anonymous' }, 'edge'),
      '/admin/dashboard',
      { configOk: true }
    )
    expect(decision).toMatchObject({
      type: 'redirect',
      reason: expect.any(String),
      scope: 'edge',
    })
    expect(decision.target).toContain('/login')
  })

  it('rotas /gerente seguem mesma política edge que /admin', () => {
    const session = makeSession()
    const normalized = normalizeAdminSession(rawAuthenticated(), 'edge')

    const adminRoute = middlewareAdminDecision(normalized, '/admin/dashboard')
    const gerenteRoute = middlewareAdminDecision(normalized, '/gerente/vendas')

    expect(adminRoute.type).toBe('allow')
    expect(gerenteRoute.type).toBe('allow')
    expect(canAccessAdmin(session)).toBe(true)
  })
})
