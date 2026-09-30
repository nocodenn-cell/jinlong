/** @vitest-environment jsdom */
/**
 * BP-E1 (D5) — "quanto devo a este fornecedor?". O filtro por fornecedor de
 * Contas a pagar já existia, mas nenhuma tela linkava até ele. Cada linha de
 * Fornecedores ganha o atalho "Contas a pagar", que abre a aba "A pagar" do
 * Financeiro já filtrada pelo fornecedor da linha.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminFinanceiroContasPagarFornecedorQuery } from '@/lib/navigation/routes'

vi.mock('./actions', () => ({
  buscarFornecedoresPaginadosAction: vi.fn(),
  bulkExcluirFornecedoresAction: vi.fn(),
  excluirFornecedorAction: vi.fn(),
}))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: vi.fn() }))

const { FornecedoresListClient } = await import('./FornecedoresListClient')
const { getMessages } = await import('@/i18n/getMessages')

const rows = ['forn-1', 'forn-2'].map((id, i) => ({
  id,
  cnpj: `1122233300018${i}`,
  nome: `Fornecedor ${i + 1}`,
  loja_id: 'loja-1',
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
}))

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

describe('FornecedoresListClient — atalho Contas a pagar (BP-E1/D5)', () => {
  it('cada linha linka para a aba "A pagar" filtrada pelo fornecedor da própria linha', () => {
    const m = getMessages('pt')
    flushSync(() =>
      root.render(
        <FornecedoresListClient idioma="pt" fornecedoresIniciais={rows} hasMoreInicial={false} />,
      ),
    )

    for (const row of rows) {
      const link = Array.from(container.querySelectorAll('a')).find((a) =>
        a.getAttribute('aria-label')?.includes(`${m.fornecedores.contas_pagar} — ${row.nome}`),
      ) as HTMLAnchorElement | undefined
      expect(link, row.nome).toBeTruthy()
      expect(link!.getAttribute('href')).toBe(adminFinanceiroContasPagarFornecedorQuery(row.id))
      expect(link!.getAttribute('href')).toBe(`/admin/financeiro?tab=pagar&fornecedor_id=${row.id}`)
    }
  })

  it('zh: o rótulo do atalho existe', () => {
    expect(getMessages('zh').fornecedores.contas_pagar).toBeTruthy()
    expect(getMessages('pt').fornecedores.contas_pagar).toBe('Contas a pagar')
  })
})
