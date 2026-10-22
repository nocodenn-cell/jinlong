import { describe, expect, it } from 'vitest'
import type { AdminSession, SessionNormalization } from '@/lib/admin/auth/types'
import {
  canAccessAdmin,
  canAccessResource,
  apiAdminDecision,
  canExecuteAction,
  middlewareAdminDecision,
} from './adminPolicy'
import { mockSupabaseUser } from '../../../tests/helpers/mockSupabaseUser'

const session: AdminSession = {
  userId: 'mgr-1',
  user: mockSupabaseUser('mgr-1', 'g@test.local'),
  perfil: 'GERENTE',
  idioma: 'pt',
  lojaId: 'loja-1',
}

describe('adminPolicy', () => {
  it('canAccessAdmin aceita perfis gerenciais', () => {
    expect(canAccessAdmin(session)).toBe(true)
    expect(canAccessAdmin({ ...session, perfil: 'DONO' })).toBe(true)
    expect(canAccessAdmin({ ...session, perfil: 'ADMIN' })).toBe(false)
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

  describe('Diagnóstico do Caixa — só DONO (UX-IA-01 A1/A2)', () => {
    const RECURSO = 'route:/admin/diagnostico-caixa'

    it('GERENTE e ADMIN legado não acessam; DONO acessa', () => {
      expect(canAccessResource(session, RECURSO)).toBe(false)
      expect(canAccessResource({ ...session, perfil: 'DONO' }, RECURSO)).toBe(true)
      expect(canAccessResource({ ...session, perfil: 'ADMIN' }, RECURSO)).toBe(false)
    })

    it('a decisão de API nega o recurso a GERENTE (usada por assertGerenteSession)', () => {
      expect(apiAdminDecision(session, RECURSO)).toMatchObject({ type: 'deny', reason: 'forbidden_resource' })
      expect(apiAdminDecision({ ...session, perfil: 'DONO' }, RECURSO).type).toBe('allow')
    })

    it('não afeta as demais rotas: GERENTE continua acessando Implantação e o resto do painel', () => {
      expect(canAccessResource(session, 'route:/admin/implantacao')).toBe(true)
      expect(canAccessResource(session, 'route:/admin/financeiro')).toBe(true)
    })
  })

  describe('middlewareAdminDecision — usuário bloqueado', () => {
    function blockedNormalization(
      blockedReason: 'inativo' | 'sem_loja'
    ): SessionNormalization {
      return {
        contract: null,
        session: null,
        authState: 'blocked',
        perfil: 'GERENTE',
        source: 'edge',
        blockedReason,
      }
    }

    it('conta inativa não entra no painel nem no caixa', () => {
      const normalized = blockedNormalization('inativo')
      for (const pathname of ['/admin/dashboard', '/gerente', '/caixa']) {
        const decision = middlewareAdminDecision(normalized, pathname)
        expect(decision.type).toBe('redirect')
        expect(decision.target).toContain('/login')
        expect(decision.reason).toBe('conta_inativa')
      }
    })

    it('conta sem loja não entra em rota protegida', () => {
      const decision = middlewareAdminDecision(blockedNormalization('sem_loja'), '/caixa')
      expect(decision.type).toBe('redirect')
      expect(decision.reason).toBe('conta_sem_loja')
    })

    it('rota pública segue permitida mesmo bloqueado', () => {
      const decision = middlewareAdminDecision(blockedNormalization('inativo'), '/termos')
      expect(decision.type).toBe('allow')
    })
  })
})
