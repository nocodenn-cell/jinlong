/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))

import { FuncionarioRowActions } from './FuncionarioRowActions'
import type { FuncionarioListRow } from './actions'

const L = {
  editar: 'Editar',
  verComissoes: 'Comissões',
  ativar: 'Ativar',
  desativar: 'Desativar',
  somenteLeitura: 'Somente leitura',
  bloqueioDonoAdmin: 'bloq-dono',
  bloqueioSemPermissao: 'bloq-perm',
  bloqueioSiMesmo: 'bloq-si',
  menuMais: 'Mais ações',
}

const row = (over: Partial<FuncionarioListRow>): FuncionarioListRow =>
  ({ id: 'u-1', nome: 'Ana', email: 'a@x.com', perfil: 'OPERADOR', ativo: true, ...over }) as FuncionarioListRow

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

function render(r: FuncionarioListRow, ator = { id: 'dono-1', perfil: 'DONO' }) {
  act(() => {
    root.render(
      <FuncionarioRowActions
        row={r}
        ator={ator}
        labels={L}
        busy={false}
        onEditar={() => {}}
        onToggle={() => {}}
      />,
    )
  })
  const menu = container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')
  if (menu) act(() => menu.click())
  return document.querySelector<HTMLAnchorElement>('[data-testid="funcionario-ver-comissoes"]')
}

describe('Funcionários → Comissões', () => {
  it('operador tem link para as comissões dele', () => {
    expect(render(row({ id: 'u-9' }))?.getAttribute('href')).toBe('/admin/comissoes?operador=u-9')
  })

  it('gerente também tem link', () => {
    expect(render(row({ perfil: 'GERENTE' }))).not.toBeNull()
  })

  it('DONO e ADMIN não têm comissão: sem link', () => {
    expect(render(row({ perfil: 'DONO' }), { id: 'x', perfil: 'ADMIN' })).toBeNull()
    expect(render(row({ perfil: 'ADMIN' }), { id: 'x', perfil: 'ADMIN' })).toBeNull()
  })

  it('linha somente leitura (sem permissão de editar) continua mostrando o link', () => {
    const a = render(row({ perfil: 'GERENTE' }), { id: 'g-2', perfil: 'GERENTE' })
    expect(container.textContent).toContain('Somente leitura')
    expect(a).not.toBeNull()
  })
})
