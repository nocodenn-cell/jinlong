// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOperadorPin } from './useOperadorPin'

const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }))

const status = (min?: number) => ({
  disponivel: true,
  expirado: false,
  exigir_pin_operador: true,
  ...(min === undefined ? {} : { bloqueio_inatividade_min: min }),
  expira_em: null,
  operadores: [{ usuario_id: 'a', nome: 'Ana', papel: 'OPERADOR', idioma: 'pt', tem_pin: true }],
  operador_atual: { usuario_id: 'a', nome: 'Ana', papel: 'OPERADOR' },
})

describe('useOperadorPin — bloqueio por inatividade', () => {
  afterEach(() => vi.useRealTimers())

  it('padrão 3 min: não bloqueia em 2:59, bloqueia aos 3:00 e registra saída por inatividade', async () => {
    vi.useFakeTimers()
    invokeMock.mockReset()
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'operadores_local_cmd' || cmd === 'operadores_sync_cmd') return status() // sem valor ⇒ padrão
      if (cmd === 'operador_sair_cmd') return null
      throw new Error(cmd)
    })
    const { result, unmount } = renderHook(() => useOperadorPin({ tauriDisponivel: true }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(result.current.ativo).toBe(true)
    expect(result.current.telaBloqueio).toBe(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3 * 60_000 - 1000)
    })
    expect(result.current.telaBloqueio).toBe(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(result.current.telaBloqueio).toBe(true)
    expect(invokeMock).toHaveBeenCalledWith('operador_sair_cmd', { motivo: 'inatividade' })
    unmount()
  })

  it('atividade (tecla) reinicia a contagem', async () => {
    vi.useFakeTimers()
    invokeMock.mockReset()
    invokeMock.mockImplementation(async (cmd: string) => (cmd.startsWith('operadores_') ? status(3) : null))
    const { result, unmount } = renderHook(() => useOperadorPin({ tauriDisponivel: true }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000)
    })
    act(() => {
      globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000)
    })
    expect(result.current.telaBloqueio).toBe(false)
    expect(result.current.ativo).toBe(true)
    unmount()
  })
})
