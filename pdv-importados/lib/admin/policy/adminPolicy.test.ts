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
  })

  describe('F1-08 — fallback é deny', () => {
    it('action não declarada é negada', () => {
      // Antes retornava `true` (fallback = allow). Era o defeito, não o contrato:
      // esquecer de declarar virava permissão.
      expect(canExecuteAction(session, 'unknown:action')).toBe(false)
      expect(canExecuteAction({ ...session, perfil: 'DONO' }, 'unknown:action')).toBe(false)
      expect(canExecuteAction({ ...session, perfil: 'ADMIN' }, 'unknown:action')).toBe(false)
    })

    it('recurso não declarado é negado, inclusive rota /admin nova', () => {
      expect(canAccessResource(session, 'route:/admin/rota-que-nao-existe')).toBe(false)
      expect(canAccessResource({ ...session, perfil: 'ADMIN' }, 'route:/admin/futura')).toBe(false)
      expect(canAccessResource(session, 'sensitive:desconhecido')).toBe(false)
      expect(canAccessResource(session, 'api:gerente:inexistente')).toBe(false)
    })
  })

  it('canAccessResource valida recursos registrados', () => {
    expect(canAccessResource(session, 'route:/admin/dashboard')).toBe(true)
    expect(canAccessResource(session, 'api:gerente:health')).toBe(true)
    expect(canAccessResource(session, 'sensitive:financeiro')).toBe(true)
  })

  describe('F1-07 — GERENTE ≠ DONO ≠ ADMIN', () => {
    const dono: AdminSession = { ...session, perfil: 'DONO' }
    const admin: AdminSession = { ...session, perfil: 'ADMIN' }

    const governancaTenant = [
      'route:/admin/configuracoes',
      'route:/admin/suspensao',
      'route:/admin/implantacao',
      'route:/admin/comissoes',
      'sensitive:comissoes',
    ]

    it.each(governancaTenant)('GERENTE recebe deny em %s', (resource) => {
      expect(canAccessResource(session, resource)).toBe(false)
    })

    it.each(governancaTenant)('DONO e ADMIN mantêm acesso a %s', (resource) => {
      expect(canAccessResource(dono, resource)).toBe(true)
      expect(canAccessResource(admin, resource)).toBe(true)
    })

    it('provisionamento continua exclusivo de ADMIN', () => {
      expect(canAccessResource(session, 'route:/admin/provisionamento')).toBe(false)
      expect(canAccessResource(dono, 'route:/admin/provisionamento')).toBe(false)
      expect(canAccessResource(admin, 'route:/admin/provisionamento')).toBe(true)
    })

    it('GERENTE mantém o financeiro que AUTHORIZATION_MATRIX concede (RN-016)', () => {
      // A matriz concede a GERENTE `contas_receber` SELECT e `registrar_liquidacao_receber`.
      // A UI reflete o banco; não inventa restrição que o banco não tem.
      expect(canAccessResource(session, 'sensitive:financeiro')).toBe(true)
      expect(canAccessResource(session, 'route:/admin/financeiro')).toBe(true)
      expect(canAccessResource(session, 'route:/admin/financeiro/contas-pagar')).toBe(true)
    })

    it('GERENTE mantém a operação diária da loja', () => {
      for (const resource of [
        'route:/admin/catalogo',
        'route:/admin/estoque',
        'route:/admin/vendas',
        'route:/admin/clientes',
        'route:/admin/fornecedores',
        'route:/admin/compras',
        'route:/admin/relatorios',
        'route:/admin/auditoria',
      ]) {
        expect(canAccessResource(session, resource), resource).toBe(true)
      }
    })

    it('middleware aplica a política de recurso, não só "é gerencial"', () => {
      function authenticated(perfil: AdminSession['perfil']): SessionNormalization {
        return {
          contract: null,
          session: { ...session, perfil },
          authState: 'authenticated',
          perfil,
          source: 'edge',
        }
      }

      // GERENTE é perfil gerencial, mas não administra o tenant.
      for (const pathname of ['/admin/configuracoes', '/admin/suspensao', '/admin/comissoes']) {
        const decision = middlewareAdminDecision(authenticated('GERENTE'), pathname)
        expect(decision.type, pathname).toBe('redirect')
        expect(decision.target, pathname).toBe('/admin')
        expect(decision.reason, pathname).toBe('perfil_sem_acesso_recurso')
      }

      // DONO passa nos mesmos caminhos.
      for (const pathname of ['/admin/configuracoes', '/admin/suspensao', '/admin/comissoes']) {
        expect(middlewareAdminDecision(authenticated('DONO'), pathname).type, pathname).toBe(
          'allow'
        )
      }

      // Operação diária do GERENTE segue liberada.
      for (const pathname of ['/admin', '/admin/vendas', '/admin/estoque', '/admin/financeiro']) {
        expect(middlewareAdminDecision(authenticated('GERENTE'), pathname).type, pathname).toBe(
          'allow'
        )
      }

      // Rota /admin não declarada é negada no edge (fallback deny end-to-end).
      expect(middlewareAdminDecision(authenticated('ADMIN'), '/admin/nao-declarada').type).toBe(
        'redirect'
      )

      // Barra final não muda a decisão.
      expect(middlewareAdminDecision(authenticated('GERENTE'), '/admin/vendas/').type).toBe('allow')
    })

    it('resolve segmento dinâmico real da URL, não só a grafia do filesystem', () => {
      expect(
        canAccessResource(
          session,
          'route:/admin/financeiro/documento/3f2504e0-4f89-11d3-9a0c-0305e82c3301'
        )
      ).toBe(true)
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
