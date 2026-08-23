/**
 * Regressão — `cancelarVendaGerenteAction` precisa propagar o `valorEstornado` que
 * `cancelarVenda` (RPC `cancelar_venda_transacional`) devolve, sem substituí-lo pelo
 * total original da venda. Ver docs/ALINHAMENTO_AMBIENTES_2026-08-20.md e
 * app/caixa/server/cancelarVendaValorEstornado.test.ts (camada abaixo desta).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cancelarVendaMock = vi.fn()
const assertGerenteSessionMock = vi.fn()

vi.mock('@/app/caixa/actions', () => ({ cancelarVenda: cancelarVendaMock }))
vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: assertGerenteSessionMock,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/staleSession', () => ({ clearStaleSessionIfNeeded: vi.fn() }))
vi.mock('@/app/gerente/vendas/devolverOuTrocarVenda.impl', () => ({
  devolverOuTrocarVendaImpl: vi.fn(),
}))
vi.mock('@/lib/gerente/auth/sessionContext', () => ({ getGerenteLojaId: vi.fn() }))

function formDataFor(vendaId: string, motivo: string) {
  const fd = new FormData()
  fd.set('venda_id', vendaId)
  fd.set('motivo', motivo)
  return fd
}

describe('cancelarVendaGerenteAction — propagação de valorEstornado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSessionMock.mockResolvedValue({ ok: true, session: { idioma: 'pt' } })
  })

  it('devolve o valorEstornado exato retornado por cancelarVenda (saldo restante, não o total)', async () => {
    cancelarVendaMock.mockResolvedValue({
      ok: true,
      vendaId: 'venda-1',
      status: 'CANCELADA',
      valorEstornado: 67.5,
    })

    const { cancelarVendaGerenteAction } = await import('./actions')
    const res = await cancelarVendaGerenteAction(formDataFor('venda-1', 'Cancelamento pós-devolução'))

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.valorEstornado).toBe(67.5)
  })

  it('propaga erro sem inventar valorEstornado quando cancelarVenda falha', async () => {
    cancelarVendaMock.mockResolvedValue({ ok: false, error: 'venda ja cancelada' })

    const { cancelarVendaGerenteAction } = await import('./actions')
    const res = await cancelarVendaGerenteAction(formDataFor('venda-1', 'Tentativa'))

    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toBe('venda ja cancelada')
    expect(cancelarVendaMock).toHaveBeenCalledTimes(1)
  })

  it('sessão não-gerente: bloqueia antes de chamar cancelarVenda', async () => {
    assertGerenteSessionMock.mockResolvedValue({ ok: false, error: 'sem permissão' })

    const { cancelarVendaGerenteAction } = await import('./actions')
    const res = await cancelarVendaGerenteAction(formDataFor('venda-1', 'Tentativa'))

    expect(res.ok).toBe(false)
    expect(cancelarVendaMock).not.toHaveBeenCalled()
  })
})
