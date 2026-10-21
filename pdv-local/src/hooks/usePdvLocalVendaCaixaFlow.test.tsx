// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePdvLocalVendaCaixaFlow } from './usePdvLocalVendaCaixaFlow'

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
  it('sem forma informada mantém DINHEIRO (compatível com o comportamento anterior)', async () => {
    invokeMock.mockResolvedValue(null)
    const { result } = renderHook(() => usePdvLocalVendaCaixaFlow(criarParams()))
    await act(async () => {
      await result.current.finalizarVenda()
    })
    expect(invokeMock).toHaveBeenCalledWith(
      'registrar_venda',
      expect.objectContaining({ venda: expect.objectContaining({ forma_pagamento: 'DINHEIRO' }) }),
    )
  })

  it.each(['PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO'] as const)(
    'envia a forma escolhida (%s) no registrar_venda',
    async (forma) => {
      invokeMock.mockResolvedValue(null)
      const { result } = renderHook(() =>
        usePdvLocalVendaCaixaFlow(criarParams({ formaPagamento: forma })),
      )
      await act(async () => {
        await result.current.finalizarVenda()
      })
      expect(invokeMock).toHaveBeenCalledWith(
        'registrar_venda',
        expect.objectContaining({ venda: expect.objectContaining({ forma_pagamento: forma }) }),
      )
    },
  )

  it('bloqueia desconto de gerente fora de dinheiro antes de gravar (servidor recusaria na sync)', async () => {
    const onSetMensagem = vi.fn()
    const { result } = renderHook(() =>
      usePdvLocalVendaCaixaFlow(
        criarParams({
          formaPagamento: 'PIX',
          descontoGerentePercentual: 5,
          descontoGerenteValor: 0.5,
          descontoGerenteToken: 'tok',
          onSetMensagem,
        }),
      ),
    )
    await act(async () => {
      await result.current.finalizarVenda()
    })
    expect(invokeMock).not.toHaveBeenCalled()
    expect(onSetMensagem).toHaveBeenCalledWith(
      'Desconto de gerente só vale para venda paga em dinheiro. Troque a forma ou remova o desconto.',
    )
    expect(result.current.isFinalizandoVenda).toBe(false)
  })

  it('recusa forma desconhecida sem gravar', async () => {
    const onSetMensagem = vi.fn()
    const { result } = renderHook(() =>
      usePdvLocalVendaCaixaFlow(
        criarParams({ formaPagamento: 'BOLETO' as unknown as 'PIX', onSetMensagem }),
      ),
    )
    await act(async () => {
      await result.current.finalizarVenda()
    })
    expect(invokeMock).not.toHaveBeenCalled()
    expect(onSetMensagem).toHaveBeenCalledWith('Forma de pagamento inválida. Escolha Dinheiro, PIX, Crédito ou Débito.')
  })

  it('pagamento combinado + crédito parcelado vai no payload (troco descontado do dinheiro)', async () => {
    invokeMock.mockResolvedValue(null)
    const { result } = renderHook(() =>
      usePdvLocalVendaCaixaFlow(
        criarParams({
          totalLiquido: 9,
          pagamentos: [
            { formaPagamento: 'DINHEIRO', valor: 5 },
            { formaPagamento: 'CARTAO_CREDITO', valor: 6, parcelas: 3 },
          ],
        }),
      ),
    )
    await act(async () => {
      await result.current.finalizarVenda()
    })
    expect(invokeMock).toHaveBeenCalledWith(
      'registrar_venda',
      expect.objectContaining({
        venda: expect.objectContaining({
          forma_pagamento: 'DINHEIRO',
          pagamentos: [
            { forma_pagamento: 'DINHEIRO', valor: 3 },
            { forma_pagamento: 'CARTAO_CREDITO', valor: 6, parcelas: 3 },
          ],
        }),
      }),
    )
  })

  it('trocar só o vendedor no seletor vale para a próxima venda (callback não fica com valor antigo)', async () => {
    invokeMock.mockResolvedValue(null)
    const base = criarParams()
    const { result, rerender } = renderHook((p: { vendedorId: string | null }) => usePdvLocalVendaCaixaFlow({ ...base, vendedorId: p.vendedorId }), {
      initialProps: { vendedorId: null },
    })
    rerender({ vendedorId: '22222222-2222-4222-8222-222222222222' })
    await act(async () => {
      await result.current.finalizarVenda()
    })
    const venda = (invokeMock.mock.calls.find((c) => c[0] === 'registrar_venda')![1] as { venda: Record<string, unknown> }).venda
    expect(venda.vendedor_id).toBe('22222222-2222-4222-8222-222222222222')
  })

  it('sem pagamentos combinados o payload não ganha o campo (outbox idêntica à anterior)', async () => {
    invokeMock.mockResolvedValue(null)
    const { result } = renderHook(() => usePdvLocalVendaCaixaFlow(criarParams({ formaPagamento: 'PIX' })))
    await act(async () => {
      await result.current.finalizarVenda()
    })
    const venda = (invokeMock.mock.calls[0][1] as { venda: Record<string, unknown> }).venda
    expect('pagamentos' in venda).toBe(false)
  })

  it('recusa combinado inválido sem gravar', async () => {
    const onSetMensagem = vi.fn()
    const { result } = renderHook(() =>
      usePdvLocalVendaCaixaFlow(
        criarParams({ totalLiquido: 9, onSetMensagem, pagamentos: [{ formaPagamento: 'PIX', valor: 20 }] }),
      ),
    )
    await act(async () => {
      await result.current.finalizarVenda()
    })
    expect(invokeMock).not.toHaveBeenCalled()
    expect(onSetMensagem).toHaveBeenCalledWith(
      'Valor acima do total em cartão/PIX. Troco só existe em dinheiro: corrija os valores.',
    )
  })

  it('combinado com cartão + desconto de gerente é bloqueado', async () => {
    const onSetMensagem = vi.fn()
    const { result } = renderHook(() =>
      usePdvLocalVendaCaixaFlow(
        criarParams({
          totalLiquido: 9, descontoGerentePercentual: 5, descontoGerenteToken: 't', onSetMensagem,
          pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 4 }, { formaPagamento: 'PIX', valor: 5 }],
        }),
      ),
    )
    await act(async () => {
      await result.current.finalizarVenda()
    })
    expect(invokeMock).not.toHaveBeenCalled()
  })
})
