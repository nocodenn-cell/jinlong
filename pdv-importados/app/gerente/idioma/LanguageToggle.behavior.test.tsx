/** @vitest-environment jsdom */
/** UX-021 / P-28 — o idioma ATIVO deve parecer ativo (destaque), e o inativo apagado/clicável. */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./actions', () => ({ setIdiomaAction: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { default: GerenteToggle } = await import('./LanguageToggle')

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
})
