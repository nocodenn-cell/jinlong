/** @vitest-environment jsdom */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePolling, type PollFn } from '@/lib/hooks/usePolling'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Harness({ fn, base }: { fn: PollFn; base: number }) {
  usePolling(fn, base)
  return null
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('usePolling', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  afterEach(() => {
    act(() => root?.unmount())
    container.remove()
    vi.useRealTimers()
  })

  async function mount(fn: PollFn, base: number) {
    root = createRoot(container)
    await act(async () => {
      root.render(createElement(Harness, { fn, base }))
    })
  }

  it('busca na montagem e repete a cada intervalo base enquanto há sucesso', async () => {
    const fn = vi.fn(() => true)
    await mount(fn, 1000)
    expect(fn).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(fn).toHaveBeenCalledTimes(2)

    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('faz backoff exponencial (1000 → 2000 → 4000) quando a fn retorna false', async () => {
    const fn = vi.fn(() => false)
    await mount(fn, 1000)
    expect(fn).toHaveBeenCalledTimes(1) // montagem; false → próximo em 2000

    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(fn).toHaveBeenCalledTimes(1) // ainda espera (2000)

    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(fn).toHaveBeenCalledTimes(2) // 2000 → 2ª; false → próximo em 4000

    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(fn).toHaveBeenCalledTimes(2) // ainda espera (4000)

    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(fn).toHaveBeenCalledTimes(3) // 4000 → 3ª
  })

  it('reseta o intervalo para o base após um sucesso', async () => {
    const results = [false, true]
    const fn = vi.fn(() => results.shift() ?? true)
    await mount(fn, 1000) // 1ª false → próximo em 2000

    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(fn).toHaveBeenCalledTimes(2) // 2ª true → reseta para 1000

    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(fn).toHaveBeenCalledTimes(3) // voltou ao ritmo base
  })

  it('pausa o polling com a aba oculta e busca imediatamente ao reaparecer', async () => {
    const fn = vi.fn(() => true)
    await mount(fn, 1000)
    expect(fn).toHaveBeenCalledTimes(1)

    act(() => setVisibility('hidden'))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(fn).toHaveBeenCalledTimes(1) // nada em segundo plano

    await act(async () => { setVisibility('visible') })
    expect(fn).toHaveBeenCalledTimes(2) // busca imediata ao voltar o foco
  })
})
