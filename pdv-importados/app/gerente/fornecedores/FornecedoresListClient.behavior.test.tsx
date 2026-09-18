/** @vitest-environment jsdom */
/**
 * G-03 — deep-link "Fornecedor → Nova OC". Cada linha de fornecedor ganha um
 * link "Nova ordem de compra" apontando pro fornecedor certo — antes o único
 * caminho era sair de Fornecedores, ir em Compras e buscar de novo.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminComprasFornecedorQuery } from '@shared-core/navigation/routes'

vi.mock('./actions', () => ({
  buscarFornecedoresPaginadosAction: vi.fn(),
  bulkExcluirFornecedoresAction: vi.fn(),
  excluirFornecedorAction: vi.fn(),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: vi.fn(),
}))

const { FornecedoresListClient } = await import('./FornecedoresListClient')
const { getMessages } = await import('@/i18n/getMessages')

const m = getMessages('pt')

const row = {
  id: 'forn-1',
  cnpj: '11222333000181',
  nome: 'Fornecedor Alfa',
  loja_id: 'loja-1',
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  class IOStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', IOStub)

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

describe('FornecedoresListClient — deep-link Nova OC (G-03)', () => {
  it('cada linha tem um link "Nova ordem de compra" apontando pro fornecedor certo', () => {
    flushSync(() =>
      root.render(
        <FornecedoresListClient
          idioma="pt"
          fornecedoresIniciais={[row]}
          hasMoreInicial={false}
        />,
      ),
    )

    const link = Array.from(container.querySelectorAll('a')).find((a) =>
      a.getAttribute('aria-label')?.includes(m.fornecedores.nova_oc),
    ) as HTMLAnchorElement | undefined
    expect(link).toBeTruthy()
    expect(link!.getAttribute('href')).toBe(adminComprasFornecedorQuery(row.id))
  })
})
