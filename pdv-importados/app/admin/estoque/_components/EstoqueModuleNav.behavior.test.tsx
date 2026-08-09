/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES } from '@shared-core/navigation/routes'

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

const { EstoqueModuleNav } = await import('./EstoqueModuleNav')

const labels = {
  aria: 'Navegação do módulo Estoque',
  saldos: 'Saldos',
  recebimento: 'Recebimento',
  transferencias: 'Transferências',
  importarNfe: 'Importar NF-e',
  etiquetas: 'Etiquetas',
}

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

describe('EstoqueModuleNav', () => {
  it('marca a aba ativa e expõe aria-label', () => {
    flushSync(() => {
      root.render(<EstoqueModuleNav active="saldos" labels={labels} />)
    })
    const nav = container.querySelector('nav')
    expect(nav?.getAttribute('aria-label')).toBe(labels.aria)
    const current = container.querySelector('[aria-current="page"]')
    expect(current?.textContent).toBe('Saldos')
    expect((current as HTMLAnchorElement | null)?.getAttribute('href')).toBe(ROUTES.admin.estoque)
  })

  it('linka Recebimento e Importar NF-e', () => {
    flushSync(() => {
      root.render(<EstoqueModuleNav active="recebimento" labels={labels} />)
    })
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain(ROUTES.admin.estoqueRecebimento)
    expect(hrefs).toContain(ROUTES.admin.importNfe)
    expect(hrefs).toContain(ROUTES.admin.estoqueImprimirEtiquetas)
  })
})
