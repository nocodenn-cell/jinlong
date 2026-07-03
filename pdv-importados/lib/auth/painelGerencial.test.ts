import { describe, expect, it } from 'vitest'
import { canAccessAdmin } from '@/lib/admin/policy/adminPolicy'
import type { AdminSession } from '@/lib/admin/auth/types'
import { destinoPosLoginPorPerfil, isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'

const ROTAS = { caixaHome: '/caixa', adminDashboard: '/admin/dashboard' }

function sessionComPerfil(perfil: string): AdminSession {
  return {
    userId: 'u-1',
    user: { id: 'u-1', email: 'u@test.local' } as AdminSession['user'],
    perfil: perfil as AdminSession['perfil'],
    idioma: 'pt',
    lojaId: 'loja-1',
  }
}

/**
 * Fase 3 — auditoria de divergência: o destino pós-login (LoginForm) e o
 * gate de acesso ao painel (middlewareAdminDecision / adminPolicy) decidem
 * sobre o mesmo fato (perfil é gerencial?) em pontos diferentes do sistema.
 * Se divergirem, o usuário é enviado para uma rota que o middleware depois
 * nega — bounce de login. Este teste prova equivalência para todo o
 * universo de perfis relevantes, incluindo valores desconhecidos/corrompidos.
 */
describe('destinoPosLoginPorPerfil vs adminPolicy.canAccessAdmin — divergência 0%', () => {
  const perfis = ['GERENTE', 'DONO', 'ADMIN', 'OPERADOR', '', 'PERFIL_DESCONHECIDO'] as const

  it.each(perfis)('perfil=%s: destino de login concorda com canAccessAdmin', (perfil) => {
    const destino = destinoPosLoginPorPerfil(perfil, ROTAS)
    const enviaParaAdmin = destino === ROTAS.adminDashboard
    const policyPermiteAdmin = canAccessAdmin(sessionComPerfil(perfil))

    expect(enviaParaAdmin).toBe(policyPermiteAdmin)
    expect(enviaParaAdmin).toBe(isPerfilPainelGerencial(perfil))
  })

  it('perfil null/undefined nunca é enviado para o painel', () => {
    expect(destinoPosLoginPorPerfil(null, ROTAS)).toBe(ROTAS.caixaHome)
    expect(destinoPosLoginPorPerfil(undefined, ROTAS)).toBe(ROTAS.caixaHome)
  })
})
