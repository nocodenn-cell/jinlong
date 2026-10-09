import { beforeEach, describe, expect, it, vi } from 'vitest'

const assertGerenteSession = vi.fn()
const executar = vi.fn()

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: (...a: unknown[]) => assertGerenteSession(...a),
}))
vi.mock('@/app/admin/diagnostico-caixa/diagnosticoCaixa.impl', () => ({
  executarDiagnosticoCaixaPreProducao: (...a: unknown[]) => executar(...a),
}))

const { executarDiagnosticoCaixaAction } = await import('./actions')

describe('executarDiagnosticoCaixaAction — guarda própria (A2)', () => {
  beforeEach(() => {
    assertGerenteSession.mockReset()
    executar.mockReset()
  })

  it('pede o recurso do Diagnóstico à policy e NÃO executa o diagnóstico quando negado', async () => {
    assertGerenteSession.mockResolvedValue({ ok: false, error: 'Esta área é só para gerente, dono ou administrador.' })
    const r = await executarDiagnosticoCaixaAction()
    expect(assertGerenteSession).toHaveBeenCalledWith({ resource: 'route:/admin/diagnostico-caixa' })
    expect(r).toEqual({ ok: false, error: expect.stringContaining('só para') })
    expect(executar).not.toHaveBeenCalled()
  })

  it('executa o diagnóstico quando a policy permite', async () => {
    assertGerenteSession.mockResolvedValue({ ok: true, session: { perfil: 'DONO' } })
    executar.mockResolvedValue({ checks: [], resumo: { ok: 0 } })
    const r = await executarDiagnosticoCaixaAction()
    expect(executar).toHaveBeenCalledTimes(1)
    expect(r.ok).toBe(true)
  })

  it('erro do diagnóstico vira mensagem, sem derrubar a action', async () => {
    assertGerenteSession.mockResolvedValue({ ok: true, session: { perfil: 'ADMIN' } })
    executar.mockRejectedValue(new Error('rpc indisponível'))
    expect(await executarDiagnosticoCaixaAction()).toEqual({ ok: false, error: 'rpc indisponível' })
  })
})
