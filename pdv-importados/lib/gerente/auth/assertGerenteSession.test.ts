import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminSession } from '@/lib/admin/auth/types'

const norm = vi.fn()
vi.mock('@/lib/admin/auth/sessionConsistency', () => ({
  getCachedAdminNormalization: (...a: unknown[]) => norm(...a),
}))

const { assertGerenteSession } = await import('./assertGerenteSession')

const sessao = (perfil: AdminSession['perfil']): AdminSession =>
  ({ userId: 'u1', user: { id: 'u1' }, perfil, idioma: 'pt', lojaId: 'l1' }) as unknown as AdminSession

const RECURSO = { resource: 'route:/admin/diagnostico-caixa' }

describe('assertGerenteSession — mensagens de erro', () => {
  beforeEach(() => norm.mockReset())

  it('GERENTE num recurso restrito a DONO/ADMIN recebe erro de PERMISSÃO (não "faça login")', async () => {
    norm.mockResolvedValue({ authState: 'authenticated', session: sessao('GERENTE') })
    const r = await assertGerenteSession(RECURSO)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toMatch(/permissão/i)
      expect(r.error).not.toMatch(/login/i)
    }
  })

  it('DONO passa no mesmo recurso', async () => {
    for (const p of ['DONO'] as const) {
      norm.mockResolvedValue({ authState: 'authenticated', session: sessao(p) })
      expect((await assertGerenteSession(RECURSO)).ok, p).toBe(true)
    }
  })

  it('sem sessão: continua pedindo login', async () => {
    norm.mockResolvedValue({ authState: 'anonymous', session: null })
    const r = await assertGerenteSession(RECURSO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/login/i)
  })

  it('autenticado sem perfil gerencial (OPERADOR): mensagem de perfil, como antes', async () => {
    norm.mockResolvedValue({ authState: 'authenticated', session: null })
    const r = await assertGerenteSession()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/gerente, dono ou administrador/i)
  })

  it('sem recurso específico, GERENTE continua permitido', async () => {
    norm.mockResolvedValue({ authState: 'authenticated', session: sessao('GERENTE') })
    expect((await assertGerenteSession()).ok).toBe(true)
  })
})
