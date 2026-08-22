/**
 * Regressão — `cancelarVendaImpl` deve retornar o `valorEstornado` REAL devolvido pela
 * RPC `cancelar_venda_transacional` (saldo restante após devoluções prévias), nunca o
 * total original da venda.
 *
 * Bug corrigido em 2026-08-21: `VendaCancelarModal` montava o comprovante de
 * cancelamento com `vendaAtiva.total_liquido` porque `cancelarVendaImpl` /
 * `CancelarVendaResult` / `cancelarVendaGerenteAction` descartavam o `valor_estornado`
 * retornado pela RPC. Invisível enquanto `cancelar_venda_transacional` não distinguia
 * devolução prévia (toda venda cancelada estornava 100%) — a migration
 * `20260820150000_fix_cancelar_venda_desconta_devolucoes_previas` mudou isso e expôs
 * o descarte. Ver docs/ALINHAMENTO_AMBIENTES_2026-08-20.md.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUserMock = vi.fn()
const maybeSingleMock = vi.fn()
const rpcMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: maybeSingleMock }),
      }),
    }),
    rpc: rpcMock,
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/sentry/vendaSentry', () => ({
  captureVendaError: vi.fn(),
  captureRpcVendaError: vi.fn(),
  captureMessage: vi.fn(),
  VENDA_EVENTS: { VENDA_CANCELADA: 'VENDA_CANCELADA' },
}))

const USER_ID = 'user-gerente-1'
const VENDA_ID = 'venda-123'

async function importImpl() {
  return import('./caixaVendas.impl')
}

describe('cancelarVendaImpl — valorEstornado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    maybeSingleMock.mockResolvedValue({ data: { perfil: 'GERENTE' } })
  })

  it('devolução parcial prévia: retorna o saldo restante, não o total original da venda', async () => {
    // Venda original R$ 112,50; R$ 45,00 já devolvidos antes — o cancelamento
    // deve estornar só os R$ 67,50 restantes.
    rpcMock.mockResolvedValue({
      data: [{ venda_id: VENDA_ID, status_venda: 'CANCELADA', valor_estornado: 67.5 }],
      error: null,
    })

    const { cancelarVendaImpl } = await importImpl()
    const res = await cancelarVendaImpl(VENDA_ID, 'Cancelamento pós-devolução parcial')

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.valorEstornado).toBe(67.5)
    expect(res.valorEstornado).not.toBe(112.5) // nunca o total original
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('cancelar_venda_transacional', {
      p_venda_id: VENDA_ID,
      p_motivo: 'Cancelamento pós-devolução parcial',
      p_operador_id: USER_ID,
    })
  })

  it('controle — cancelamento sem devolução prévia: valorEstornado bate com o total (comportamento antigo preservado)', async () => {
    rpcMock.mockResolvedValue({
      data: [{ venda_id: VENDA_ID, status_venda: 'CANCELADA', valor_estornado: 50 }],
      error: null,
    })

    const { cancelarVendaImpl } = await importImpl()
    const res = await cancelarVendaImpl(VENDA_ID, 'Cliente desistiu')

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.valorEstornado).toBe(50)
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it('controle — valor_estornado ausente na resposta da RPC: cai para 0 sem lançar exceção', async () => {
    rpcMock.mockResolvedValue({
      data: [{ venda_id: VENDA_ID, status_venda: 'CANCELADA' }],
      error: null,
    })

    const { cancelarVendaImpl } = await importImpl()
    const res = await cancelarVendaImpl(VENDA_ID, 'Sem valor_estornado')

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.valorEstornado).toBe(0)
  })

  it('controle — valor_estornado inválido (string não numérica): cai para NaN->Number, nunca quebra a resposta', async () => {
    rpcMock.mockResolvedValue({
      data: [{ venda_id: VENDA_ID, status_venda: 'CANCELADA', valor_estornado: 'not-a-number' }],
      error: null,
    })

    const { cancelarVendaImpl } = await importImpl()
    const res = await cancelarVendaImpl(VENDA_ID, 'Valor invalido')

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(Number.isNaN(res.valorEstornado)).toBe(true)
  })

  it('RPC retorna erro: não estorna nada e não repete a chamada (sem estoque/caixa duplicado)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'venda ja cancelada' } })

    const { cancelarVendaImpl } = await importImpl()
    const res = await cancelarVendaImpl(VENDA_ID, 'Tentativa com erro')

    expect(res.ok).toBe(false)
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it('perfil OPERADOR: bloqueado antes de chamar a RPC (nenhum estorno é tentado)', async () => {
    maybeSingleMock.mockResolvedValue({ data: { perfil: 'OPERADOR' } })

    const { cancelarVendaImpl } = await importImpl()
    const res = await cancelarVendaImpl(VENDA_ID, 'Operador tentando cancelar')

    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
