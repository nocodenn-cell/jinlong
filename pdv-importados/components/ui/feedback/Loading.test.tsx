/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Loading } from '@/components/ui/feedback/Loading'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

describe('Loading', () => {
  it('padrão: spinner, sem selo da marca', () => {
    flushSync(() => root.render(<Loading />))
    expect(container.querySelector('[data-testid="loading-brand-mark"]')).toBeNull()
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Carregando…')
  })

  it('variant brand: selo girando em sentido horário, decorativo, com rótulo', () => {
    flushSync(() => root.render(<Loading variant="brand" label="Abrindo caixa…" />))
    const img = container.querySelector('[data-testid="loading-brand-mark"]')
    expect(img?.getAttribute('src')).toBe('/branding/brand-double-dragon.png')
    expect(img?.getAttribute('aria-hidden')).toBe('true')
    expect(img?.className).toContain('animate-[spin_2.8s_linear_infinite]')
    expect(img?.className).toContain('motion-reduce:animate-pulse')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Abrindo caixa…')
  })
})
