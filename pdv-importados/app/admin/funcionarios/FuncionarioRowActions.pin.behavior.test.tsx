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

function render(r: FuncionarioListRow, ator = { id: 'dono-1', perfil: 'DONO' }, cb = { onPin: vi.fn(), onDesbloquearPin: vi.fn() }) {
  act(() => {
    root.render(
      <FuncionarioRowActions
        row={r}
        ator={ator}
        labels={{ ...L, pinDefinir: 'Definir PIN', pinTrocar: 'Trocar PIN', pinDesbloquear: 'Desbloquear' }}
        busy={false}
        onEditar={() => {}}
        onToggle={() => {}}
        {...cb}
      />,
    )
  })
  return cb
}
const q = (id: string) => container.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)

describe('Funcionários → PIN do caixa', () => {
  it('sem PIN: "Definir PIN"; com PIN: "Trocar PIN"', () => {
    render(row({ pin_status: 'sem' }))
    expect(q('funcionario-pin-definir')?.textContent).toContain('Definir PIN')
    render(row({ pin_status: 'ativo' }))
    expect(q('funcionario-pin-definir')?.textContent).toContain('Trocar PIN')
    expect(q('funcionario-pin-desbloquear')).toBeNull()
  })

  it('bloqueado mostra "Desbloquear" e chama o callback', () => {
    const cb = render(row({ pin_status: 'bloqueado' }))
    act(() => q('funcionario-pin-desbloquear')!.click())
    expect(cb.onDesbloquearPin).toHaveBeenCalledTimes(1)
  })

  it('gerente não gerencia PIN de outro gerente; ninguém pelo próprio cadastro; recurso indisponível oculta', () => {
    render(row({ perfil: 'GERENTE', pin_status: 'sem' }), { id: 'g-2', perfil: 'GERENTE' })
    expect(q('funcionario-pin-definir')).toBeNull()
    render(row({ id: 'g-2', perfil: 'OPERADOR', pin_status: 'sem' }), { id: 'g-2', perfil: 'GERENTE' })
    expect(q('funcionario-pin-definir')).toBeNull()
    render(row({ pin_status: null }))
    expect(q('funcionario-pin-definir')).toBeNull()
    render(row({ pin_status: 'sem', ativo: false }))
    expect(q('funcionario-pin-definir')).toBeNull()
  })

  it('gerente gerencia PIN de operador', () => {
    const cb = render(row({ pin_status: 'sem' }), { id: 'g-2', perfil: 'GERENTE' })
    act(() => q('funcionario-pin-definir')!.click())
    expect(cb.onPin).toHaveBeenCalledTimes(1)
  })
})
