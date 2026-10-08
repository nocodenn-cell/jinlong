import { describe, expect, it } from 'vitest'
import type { AdminSession, SessionNormalization } from '@/lib/admin/auth/types'
import {
  canAccessAdmin,
  canAccessResource,
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

  describe('middlewareAdminDecision — usuário bloqueado', () => {
    function blockedNormalization(
      blockedReason: SessionNormalization['blockedReason'] & string
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

    it('empresa ativa obrigatória não redireciona para outra empresa', () => {
      const decision = middlewareAdminDecision(
        blockedNormalization('empresa_ativa_obrigatoria'),
        '/admin/dashboard'
      )
      expect(decision.type).toBe('redirect')
      expect(decision.reason).toBe('empresa_ativa_obrigatoria')
      expect(decision.target).toContain('/login')
    })

    it('rota pública segue permitida mesmo bloqueado', () => {
      const decision = middlewareAdminDecision(blockedNormalization('inativo'), '/termos')
      expect(decision.type).toBe('allow')
    })
  })
})
