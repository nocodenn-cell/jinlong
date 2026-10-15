/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const push = vi.fn()
vi.mock('next/link', () => ({
  default: ({ children, href, onClick }: { children: React.ReactNode; href: string; onClick?: (event: { stopPropagation: () => void }) => void }) => (
    <a href={href} onClick={onClick}>{children}</a>
  ),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/admin/estoque/movimentacoes',
  useSearchParams: () => new URLSearchParams('q=caneca&sentido=entrada'),
}))

import { MovimentacoesTable } from './MovimentacoesTable'
import type { MovimentoLinha } from './actions'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const row: MovimentoLinha = {
  evento_id: 'ev-1',
  ocorrido_em: '2026-10-12T15:00:00.000Z',
  tipo_codigo: 'VENDA',
  quantidade_delta: -2,
  observacao: 'balcão',
  produto_id: 'p1',
  produto_nome: 'Caneca',
}

const labels = {
  detalhe: 'Detalhe do movimento',
  fechar: 'Fechar',
  produto: 'Produto',
  data: 'Data',
  tipo: 'Tipo de movimento',
  variacao: 'Variação',
  observacao: 'Observação',
  verProduto: 'Ver nos saldos',
  vazio: 'Nenhuma movimentação encontrada',
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  push.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

it('abre o detalhe ao lado sem trocar a consulta', () => {
  act(() => {
    root.render(<MovimentacoesTable rows={[row]} zh={false} tipos={{ VENDA: 'Venda' }} labels={labels} />)
  })
  const linha = container.querySelector('tbody tr') as HTMLTableRowElement
  act(() => linha.click())
  const painel = container.querySelector('[data-testid="mov-detalhe"]')
  expect(painel?.textContent).toContain('Caneca')
  expect(painel?.textContent).toContain('balcão')
  expect(painel?.textContent).toContain('Venda')
  expect(container.querySelector('tbody tr')?.textContent).toContain('Caneca')
  expect(push).not.toHaveBeenCalled()
})
