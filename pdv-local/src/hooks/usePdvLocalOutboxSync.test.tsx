// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePdvLocalOutboxSync } from './usePdvLocalOutboxSync'

const invokeMock = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

describe('usePdvLocalOutboxSync', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    vi.useRealTimers()
  })

  it('carrega resumo no mount e expõe status pendente', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'outbox_resumo_cmd') {
        return {
          pendentes_total: 2,
          prontos_sync: 1,
          em_backoff: 0,
          dlq: 0,
        }
      }
      throw new Error(`Comando inesperado: ${cmd}`)
    })

    const { result, unmount } = renderHook(() =>
      usePdvLocalOutboxSync({
        tauriDisponivel: true,
        caixaAtualId: null,
        onSyncElapsedMs: vi.fn(),
        onMensagem: vi.fn(),
        formatarErro: (_e, fallback) => fallback,
      }),
    )

    await waitFor(() => {
      expect(result.current.outboxResumo?.pendentes_total).toBe(2)
    })
    expect(result.current.statusSync).toBe('pendente')
    unmount()
  })

  // NOTA (React 19 + RTL 16): envolver `reprocessarDlq()` em `await act(async…)`
  // trava até o timeout do teste — a promise nunca liquida dentro do wrapper.
  // O padrão da casa (o teste de mount acima e os specs de pdv-importados) é
  // chamar direto e assertar via `waitFor`, que já aplica act internamente.
  // `unmount()` ao final evita vazar os intervals (12s/15s) do hook para além
  // do teardown do jsdom ("window is not defined" como unhandled error).
  it('reprocessa DLQ com sync e envia mensagem de sucesso', async () => {
    const onMensagem = vi.fn()
    const onSyncElapsedMs = vi.fn()

    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'outbox_reprocessar_dlq_cmd') return null
      if (cmd === 'sync_outbox_real_cmd') return null
      if (cmd === 'outbox_resumo_cmd') {
        return {
          pendentes_total: 0,
          prontos_sync: 0,
          em_backoff: 0,
          dlq: 0,
        }
      }
      throw new Error(`Comando inesperado: ${cmd}`)
    })

    const { result, unmount } = renderHook(() =>
      usePdvLocalOutboxSync({
        tauriDisponivel: true,
        caixaAtualId: 'cx-1',
        onSyncElapsedMs,
        onMensagem,
        formatarErro: (_e, fallback) => fallback,
      }),
    )

    await result.current.reprocessarDlq()

    expect(invokeMock).toHaveBeenCalledWith('outbox_reprocessar_dlq_cmd')
    expect(invokeMock).toHaveBeenCalledWith('sync_outbox_real_cmd', { limite: 50 })
    expect(onSyncElapsedMs).toHaveBeenCalledTimes(1)
    expect(onMensagem).toHaveBeenCalledWith('Eventos repostos na fila. Sync executada em seguida.')
    await waitFor(() => {
      expect(result.current.reprocessandoDlq).toBe(false)
    })
    unmount()
  })

  it('retorna mensagem formatada quando reprocessar DLQ falha', async () => {
    const onMensagem = vi.fn()

    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'outbox_resumo_cmd') {
        return {
          pendentes_total: 0,
          prontos_sync: 0,
          em_backoff: 0,
          dlq: 1,
        }
      }
      if (cmd === 'outbox_reprocessar_dlq_cmd') throw new Error('falha')
      return null
    })

    const { result, unmount } = renderHook(() =>
      usePdvLocalOutboxSync({
        tauriDisponivel: true,
        caixaAtualId: 'cx-2',
        onSyncElapsedMs: vi.fn(),
        onMensagem,
        formatarErro: () => 'erro-formatado',
      }),
    )

    await result.current.reprocessarDlq()

    expect(onMensagem).toHaveBeenCalledWith('erro-formatado')
    await waitFor(() => {
      expect(result.current.reprocessandoDlq).toBe(false)
    })
    unmount()
  })
})
