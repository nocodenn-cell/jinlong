/** @vitest-environment jsdom */
/** UX-021 / P-28 — o idioma ATIVO deve parecer ativo (destaque), e o inativo apagado/clicável. */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./actions', () => ({ setIdiomaAction: vi.fn() }))
const { setIdiomaAction } = await import('./actions')

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { default: GerenteToggle, trocarIdioma } = await import('./LanguageToggle')

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('LanguageToggle', () => {
  it('o idioma atual fica destacado e desabilitado; o outro continua clicável', () => {
    act(() => root.render(<GerenteToggle idiomaAtual="pt" />))
    const [pt, zh] = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[]
    expect(pt.getAttribute('aria-pressed')).toBe('true')
    expect(pt.disabled).toBe(true)
    expect(pt.className).toContain('--color-brand')
    expect(zh.getAttribute('aria-pressed')).toBe('false')
    expect(zh.disabled).toBe(false)
    expect(zh.className).not.toContain('--color-brand')
  })

  it('trocando o idioma, o destaque acompanha', () => {
    act(() => root.render(<GerenteToggle idiomaAtual="zh" />))
    const [pt, zh] = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[]
    expect(zh.className).toContain('--color-brand')
    expect(pt.className).not.toContain('--color-brand')
  })

  /*
   * Troca de idioma recarrega o documento em vez de reconciliar a árvore
   * /admin no cliente (em CPU lenta o commit levava 5–15 s e o e2e via o
   * botão nunca ficar ativo). Só recarrega depois da persistência confirmar.
   */
  describe('trocarIdioma', () => {
    function stubReload() {
      const reload = vi.fn()
      vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload } as Location)
      return reload
    }
    afterEach(() => vi.restoreAllMocks())

    it('persiste e recarrega a página quando a action confirma', async () => {
      const reload = stubReload()
      vi.mocked(setIdiomaAction).mockResolvedValueOnce({ ok: true })
      const fd = new FormData()
      fd.set('idioma', 'zh')
      await trocarIdioma(fd)
      expect(setIdiomaAction).toHaveBeenCalledWith(fd)
      expect(reload).toHaveBeenCalledTimes(1)
    })

    it('não recarrega quando a persistência falha (botão continua clicável)', async () => {
      const reload = stubReload()
      vi.mocked(setIdiomaAction).mockResolvedValueOnce({ ok: false })
      const fd = new FormData()
      fd.set('idioma', 'zh')
      await trocarIdioma(fd)
      expect(reload).not.toHaveBeenCalled()
    })
  })
})
