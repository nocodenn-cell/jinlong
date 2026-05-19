// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  afterEach(async () => {
    cleanup()
    // Drena a fila setImmediate do Node.js (React scheduler) antes do teardown jsdom
    await new Promise<void>((resolve) => setImmediate(resolve))
    await new Promise<void>((resolve) => setImmediate(resolve))
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

    const { result } = renderHook(() =>
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
  })

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

    const { result } = renderHook(() =>
      usePdvLocalOutboxSync({
        tauriDisponivel: true,
        caixaAtualId: 'cx-1',
        onSyncElapsedMs,
        onMensagem,
        formatarErro: (_e, fallback) => fallback,
      }),
    )

    void result.current.reprocessarDlq()

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('outbox_reprocessar_dlq_cmd')
      expect(invokeMock).toHaveBeenCalledWith('sync_outbox_real_cmd', { limite: 50 })
      expect(onSyncElapsedMs).toHaveBeenCalledTimes(1)
      expect(onMensagem).toHaveBeenCalledWith('Eventos repostos na fila. Sync executada em seguida.')
      expect(result.current.reprocessandoDlq).toBe(false)
    })
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

    const { result } = renderHook(() =>
      usePdvLocalOutboxSync({
        tauriDisponivel: true,
        caixaAtualId: 'cx-2',
        onSyncElapsedMs: vi.fn(),
        onMensagem,
        formatarErro: () => 'erro-formatado',
      }),
    )

    void result.current.reprocessarDlq()

    await waitFor(() => {
      expect(onMensagem).toHaveBeenCalledWith('erro-formatado')
      expect(result.current.reprocessandoDlq).toBe(false)
    })
  })
})
