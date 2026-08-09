/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))

const { EstoqueKpiRow } = await import('./EstoqueKpiRow')

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

describe('EstoqueKpiRow', () => {
  it('não inventa zero quando a contagem é null', () => {
    flushSync(() => {
      root.render(
        <EstoqueKpiRow
          ariaLabel="Resumo"
          items={[
            {
              key: 'geral',
              label: 'Total',
              value: 10,
              href: '/admin/estoque',
              active: true,
            },
            {
              key: 'critico',
              label: 'Crítico',
              value: null,
              href: '/admin/estoque?visao=critico',
              active: false,
              tone: 'warning',
            },
          ]}
        />,
      )
    })
    expect(container.textContent).toContain('10')
    expect(container.textContent).toContain('—')
    expect(container.textContent).not.toMatch(/Crítico0|Crítico\s*0/)
  })
})
