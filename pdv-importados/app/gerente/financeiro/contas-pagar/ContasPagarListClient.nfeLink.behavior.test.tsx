/** @vitest-environment jsdom */
/**
 * G-08 — quando a conta a pagar tem número de NF-e mas não tem
 * `nfe_importacao_id` (ex.: dado histórico incompleto), a linha mostrava um
 * link clicável (`href="#"`, `preventDefault`) que não levava a lugar
 * nenhum. Prova que agora vira texto simples nesse caso, e continua link
 * de verdade quando o id está presente.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./actions', () => ({
  buscarContasPagarAction: vi.fn(),
  cancelarContaPagarAction: vi.fn(),
  exportarContasPagarParaCSVAction: vi.fn(),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const { ContasPagarListClient } = await import('./ContasPagarListClient')

const contaBase = {
  id: 'c1',
  fornecedor_id: 'f1',
  fornecedor_nome: 'Fornecedor Alfa',
  descricao: 'Compra de mercadoria',
  valor_total: 100,
  valor_pago: 0,
  vencimento: '2026-09-30',
  status: 'PENDENTE' as const,
  nfe_numero: '12345',
  nfe_importacao_id: null as string | null,
  criado_em: '2026-09-17T10:00:00Z',
  loja_id: 'loja-1',
  atrasado: false,
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

describe('ContasPagarListClient — link de NF-e (G-08)', () => {
  it('sem nfe_importacao_id: mostra o número da NF-e como texto, sem link morto', () => {
    flushSync(() =>
      root.render(
        <ContasPagarListClient
          idioma="pt"
          locale="pt-BR"
          contasIniciais={[contaBase]}
          hasMoreInicial={false}
          fornecedoresOpts={[]}
          statusInicial="todos"
          periodoInicial=""
        />,
      ),
    )

    expect(container.textContent).toContain('NF-e #12345')
    const links = Array.from(container.querySelectorAll('a')).filter((a) =>
      a.textContent?.includes('NF-e #12345'),
    )
    expect(links).toHaveLength(0)
  })

  it('com nfe_importacao_id: continua sendo um link de verdade, não morto', () => {
    flushSync(() =>
      root.render(
        <ContasPagarListClient
          idioma="pt"
          locale="pt-BR"
          contasIniciais={[{ ...contaBase, nfe_importacao_id: 'nfe-1' }]}
          hasMoreInicial={false}
          fornecedoresOpts={[]}
          statusInicial="todos"
          periodoInicial=""
        />,
      ),
    )

    const link = Array.from(container.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('NF-e #12345'),
    ) as HTMLAnchorElement | undefined
    expect(link).toBeTruthy()
    expect(link!.getAttribute('href')).toBe('/gerente/estoque/importar-nfe?id=nfe-1')
    expect(link!.getAttribute('href')).not.toBe('#')
  })
})
