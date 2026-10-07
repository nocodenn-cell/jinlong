/** @vitest-environment jsdom */
/** UX-006 — o saldo mostra a situação por texto (Zerado / Abaixo do mínimo / No mínimo), não só cor. */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const replaceMock = vi.fn()
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('q=caneca&visao=critico&page=4'), usePathname: () => '/admin/estoque', useRouter: () => ({ refresh: vi.fn(), replace: (url: string) => replaceMock(url) }) }))
vi.mock('../actions', () => ({ obterKardexProduto: vi.fn(async () => []), ajustarSaldoEstoque: vi.fn() }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { EstoqueTable } = await import('./EstoqueTable')

const labels = new Proxy({}, { get: (_t, k) => (k === 'tipoMap' ? {} : String(k)) }) as never

const linha = (id: string, saldo: number | null, minimo: number | null) => ({
  id,
  nome: `Produto ${id}`,
  codigo_barras: null,
  unidade_medida: 'UN',
  origem: 'brasil_nf',
  quantidade_atual: saldo,
  estoque_minimo: minimo,
  deficit: null,
})

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

function textoDaLinha(id: string): string {
  const tr = Array.from(container.querySelectorAll('tbody tr')).find((r) => r.textContent?.includes(`Produto ${id}`))
  return tr?.textContent ?? ''
}

describe('EstoqueTable — situação do saldo (UX-006)', () => {
  it('saldo 0 / mínimo 0 → Zerado; 9/10 → Abaixo do mínimo; 10/10 → No mínimo; 20/10 → sem rótulo', () => {
    act(() =>
      root.render(
        <EstoqueTable
          linhas={[linha('A', 0, 0), linha('B', 9, 10), linha('C', 10, 10), linha('D', 20, 10)]}
          labels={labels}
        />,
      ),
    )
    expect(textoDaLinha('A')).toContain('situacaoZerado')
    expect(textoDaLinha('A')).not.toContain('situacaoAbaixoMinimo')
    expect(textoDaLinha('B')).toContain('situacaoAbaixoMinimo')
    expect(textoDaLinha('C')).toContain('situacaoNoMinimo')
    const d = textoDaLinha('D')
    expect(d).not.toContain('situacao')
  })
})

it('ordenar preserva os filtros e volta à primeira página do servidor', () => {
  act(() => root.render(<EstoqueTable linhas={[linha('A', 1, 2)]} labels={labels} />))
  const header = Array.from(container.querySelectorAll('th')).find((item) => item.textContent?.includes('saldo'))!
  act(() => header.click())
  const url = new URL(replaceMock.mock.calls.at(-1)![0], 'https://local.test')
  expect(url.searchParams.get('q')).toBe('caneca')
  expect(url.searchParams.get('visao')).toBe('critico')
  expect(url.searchParams.get('ordem')).toBe('quantidade_atual')
  expect(url.searchParams.has('page')).toBe(false)
})
