/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/app/gerente/suspensao/actions', () => ({
  atualizarSuspensaoVendas: vi.fn(),
}))

import { SuspensaoContent } from './SuspensaoContent'

const LABELS = {
  titulo: 'Suspensão de Vendas',
  subtitulo: 'Controle de operações da loja',
  erroCarregar: 'Não foi possível carregar o status de suspensão.',
  alertaTitulo: 'Vendas suspensas',
  alertaTexto: 'Nenhuma venda poderá ser processada.',
  statusSuspensas: 'Vendas estão SUSPENSAS',
  statusAtivas: 'Vendas estão ATIVAS',
  motivoLabel: 'Motivo (se suspensas)',
  motivoPlaceholder: 'Descreva o motivo...',
  motivoContador: '{{n}} / 300 caracteres',
  sucesso: 'Suspensão atualizada com sucesso',
  salvarBtn: 'Salvar alterações',
  salvando: 'Salvando...',
}

let container: HTMLDivElement
let root: Root

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui)
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

describe('SuspensaoContent — falha de carga inicial', () => {
  it('mostra o alerta de falha real e desabilita o botão Salvar quando loadError está presente', () => {
    render(
      <SuspensaoContent
        statusInicial={{ suspensas: false, motivo: '' }}
        loadError="Não foi possível carregar o status de suspensão."
        labels={LABELS}
      />,
    )
    const alerta = container.querySelector('[role="alert"]')
    expect(alerta).not.toBeNull()
    expect(alerta?.textContent).toContain('Não foi possível carregar')

    const botao = container.querySelector('button') as HTMLButtonElement
    expect(botao.disabled).toBe(true)

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox.disabled).toBe(true)
  })

  it('sem loadError, não mostra alerta e o botão Salvar fica habilitado', () => {
    render(
      <SuspensaoContent
        statusInicial={{ suspensas: false, motivo: '' }}
        loadError={null}
        labels={LABELS}
      />,
    )
    expect(container.querySelector('[role="alert"]')).toBeNull()

    const botao = container.querySelector('button') as HTMLButtonElement
    expect(botao.disabled).toBe(false)

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox.disabled).toBe(false)
  })

  it('exibe "Vendas estão ATIVAS" apenas quando o estado carregado de fato é suspensas=false, não como default silencioso', () => {
    render(
      <SuspensaoContent
        statusInicial={{ suspensas: true, motivo: 'Falta de energia' }}
        loadError={null}
        labels={LABELS}
      />,
    )
    expect(container.textContent).toContain('Vendas estão SUSPENSAS')
    expect(container.textContent).not.toContain('Vendas estão ATIVAS')
  })
})
