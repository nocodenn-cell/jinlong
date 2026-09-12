/** @vitest-environment jsdom */
/**
 * Contrato do menu de ações de linha — o gesto de "três pontos".
 *
 * O que importa aqui não é a aparência: é que uma ação indisponível continue
 * VISÍVEL e explicada, em vez de sumir. Sumir faz o operador procurar; ficar
 * desabilitada com motivo faz ele entender.
 */
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
  } & Record<string, unknown>) => React.createElement('a', { href, ...rest }, children),
}))

const { RowActionsMenu } = await import('@/components/ui/admin-v2/RowActionsMenu')

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

type Acao = React.ComponentProps<typeof RowActionsMenu>['actions'][number]

function render(actions: Acao[]) {
  flushSync(() => {
    root.render(
      React.createElement(RowActionsMenu, { actions, ariaLabel: 'Ações da conta Aluguel' }),
    )
  })
}

function abrir(): void {
  const gatilho = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')
  expect(gatilho).not.toBeNull()
  flushSync(() => gatilho?.click())
}

function itens(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]'))
}

describe('RowActionsMenu', () => {
  it('nasce fechado e abre no clique do gatilho', () => {
    render([{ id: 'a', label: 'Pagar', onSelect: () => {} }])
    expect(itens()).toHaveLength(0)
    abrir()
    expect(itens().map((el) => el.textContent)).toEqual(['Pagar'])
  })

  it('o gatilho anuncia o estado de abertura para leitor de tela', () => {
    render([{ id: 'a', label: 'Pagar', onSelect: () => {} }])
    const gatilho = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')
    expect(gatilho?.getAttribute('aria-expanded')).toBe('false')
    abrir()
    expect(gatilho?.getAttribute('aria-expanded')).toBe('true')
  })

  it('dispara a ação escolhida e fecha o menu', () => {
    const onSelect = vi.fn()
    render([{ id: 'a', label: 'Pagar', onSelect }])
    abrir()
    flushSync(() => itens()[0]?.click())
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(itens()).toHaveLength(0)
  })

  it('ação com href vira link navegável, sem onSelect', () => {
    render([{ id: 'nfe', label: 'Abrir NF-e', href: '/admin/estoque/importar-nfe?id=abc' }])
    abrir()
    const link = container.querySelector<HTMLAnchorElement>('a[role="menuitem"]')
    expect(link?.getAttribute('href')).toBe('/admin/estoque/importar-nfe?id=abc')
  })

  it('ação externa abre em nova aba — imprimir não pode custar a lista filtrada', () => {
    render([{ id: 'print', label: 'Imprimir', href: '/x', external: true }])
    abrir()
    const link = container.querySelector<HTMLAnchorElement>('a[role="menuitem"]')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toContain('noopener')
  })

  it('ação indisponível permanece visível, desabilitada e com o motivo no title', () => {
    const onSelect = vi.fn()
    render([
      {
        id: 'pagar',
        label: 'Registrar pagamento',
        onSelect,
        disabled: true,
        disabledHint: 'Conta de outra loja.',
      },
    ])
    abrir()
    const item = itens()[0] as HTMLButtonElement
    expect(item.textContent).toContain('Registrar pagamento')
    expect(item.disabled).toBe(true)
    expect(item.getAttribute('title')).toBe('Conta de outra loja.')
    flushSync(() => item.click())
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('ação destrutiva com href não vira link — não se cancela por navegação', () => {
    render([{ id: 'del', label: 'Cancelar conta', href: '/x', destructive: true, disabled: true }])
    abrir()
    expect(container.querySelector('a[role="menuitem"]')).toBeNull()
    expect(itens()[0]?.tagName).toBe('BUTTON')
  })

  it('separa a ação destrutiva das neutras que vêm antes', () => {
    render([
      { id: 'pagar', label: 'Pagar', onSelect: () => {} },
      { id: 'cancelar', label: 'Cancelar conta', destructive: true, onSelect: () => {} },
    ])
    abrir()
    const menu = container.querySelector('[role="menu"]')
    expect(menu?.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0)
  })

  it('Escape fecha o menu', () => {
    render([{ id: 'a', label: 'Pagar', onSelect: () => {} }])
    abrir()
    flushSync(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(itens()).toHaveLength(0)
  })

  it('sem ações, não renderiza nem o gatilho', () => {
    render([])
    expect(container.querySelector('button')).toBeNull()
  })
})
