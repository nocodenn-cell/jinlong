// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePdvLocalVendaCaixaFlow } from './usePdvLocalVendaCaixaFlow'

// React 19: sem este flag o act assíncrono não faz flush síncrono e o scheduler
// vaza trabalho para depois do teardown do jsdom (mesmo padrão de
// pdv-importados/lib/hooks/usePolling.test.ts).
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const invokeMock = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

function criarParams(overrides: Partial<Parameters<typeof usePdvLocalVendaCaixaFlow>[0]> = {}) {
  return {
    tauriDisponivel: true,
    caixaAtualId: 'cx-01',
    itens: [
      {
        produtoId: 'p-1',
        nome: 'Produto 1',
        quantidade: 1,
        resultado: { precoOriginal: 10, precoUnitario: 9 },
      },
    ],
    totalBruto: 10,
    totalDesconto: 1,
    totalLiquido: 9,
    descontoGerentePercentual: 0,
    descontoGerenteValor: 0,
    descontoGerenteToken: null,
    gerenteId: 'g-1',
    onSetCaixaAtualId: vi.fn(),
    onSetMensagem: vi.fn(),
    onLimparCarrinho: vi.fn(),
    onSyncOutbox: vi.fn().mockResolvedValue(undefined),
    onRefreshOutboxResumo: vi.fn().mockResolvedValue(undefined),
    onFinalizarElapsedMs: vi.fn(),
    formatarErro: (_e: unknown, fallback: string) => fallback,
    logError: vi.fn(),
    ...overrides,
  }
}

describe('usePdvLocalVendaCaixaFlow', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    vi.restoreAllMocks()
  })

  it('abre caixa com sucesso e atualiza mensagem/id', async () => {
    const onSetCaixaAtualId = vi.fn()
    const onSetMensagem = vi.fn()
    vi.spyOn(window, 'prompt').mockReturnValue('15,50')

    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'abrir_caixa_cmd') return 'cx-99'
      throw new Error(`Comando inesperado: ${cmd}`)
    })

    const params = criarParams({
      onSetCaixaAtualId,
      onSetMensagem,
    })
    const { result } = renderHook(() => usePdvLocalVendaCaixaFlow(params))

    await act(async () => {
      await result.current.abrirCaixa()
    })

    expect(invokeMock).toHaveBeenCalledWith('abrir_caixa_cmd', {
      operador_id: null,
      troco_inicial: 15.5,
    })
    expect(onSetCaixaAtualId).toHaveBeenCalledWith('cx-99')
    expect(onSetMensagem).toHaveBeenCalledWith('Caixa aberto.')
  })

  it('finaliza venda, dispara sync e limpa carrinho', async () => {
    const onLimparCarrinho = vi.fn()
    const onSyncOutbox = vi.fn().mockResolvedValue(undefined)
    const onRefreshOutboxResumo = vi.fn().mockResolvedValue(undefined)
    const onSetMensagem = vi.fn()

    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'registrar_venda') return null
      throw new Error(`Comando inesperado: ${cmd}`)
    })

    const params = criarParams({
      onLimparCarrinho,
      onSyncOutbox,
      onRefreshOutboxResumo,
      onSetMensagem,
    })
    const { result } = renderHook(() => usePdvLocalVendaCaixaFlow(params))

    await act(async () => {
      await result.current.finalizarVenda()
    })

    expect(invokeMock).toHaveBeenCalledWith(
      'registrar_venda',
      expect.objectContaining({
        venda: expect.objectContaining({
          caixa_id: 'cx-01',
          total_bruto: 10,
          total_liquido: 9,
        }),
      }),
    )
    expect(onLimparCarrinho).toHaveBeenCalledTimes(1)
    expect(onSyncOutbox).toHaveBeenCalledWith(50)
    expect(onRefreshOutboxResumo).toHaveBeenCalledTimes(1)
    expect(onSetMensagem).toHaveBeenCalledWith('Venda registrada e sincronizada (quando possível).')
    expect(result.current.isFinalizandoVenda).toBe(false)
  })

  it('informa erro quando finalização ocorre fora do Tauri', async () => {
    const onSetMensagem = vi.fn()
    const params = criarParams({
      tauriDisponivel: false,
      onSetMensagem,
    })
    const { result } = renderHook(() => usePdvLocalVendaCaixaFlow(params))

    await act(async () => {
      await result.current.finalizarVenda()
    })

    expect(invokeMock).not.toHaveBeenCalled()
    expect(onSetMensagem).toHaveBeenCalledWith(
      'Execução fora do Tauri. Abra pelo app desktop (janela do Tauri), não pelo navegador em http://localhost:4173.',
    )
    expect(result.current.isFinalizandoVenda).toBe(false)
  })
})
