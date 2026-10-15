/** @vitest-environment jsdom */
/**
 * Roadmap UX, Tarefa 3 — padrão de filtros do Admin V2 no próprio FilterBar:
 * debounce de 300 ms na busca, Limpar condicional, estado na URL e layout em
 * grid responsivo opt-in. O layout `inline` (default) é o contrato dos
 * consumidores existentes e não pode mudar.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FilterDef } from '@/components/ui/FilterBar'

let mockSearchParams = new URLSearchParams('')
const replaceSpy = vi.fn()
const pushSpy = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/estoque',
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: replaceSpy, push: pushSpy }),
}))

const { FilterBar } = await import('@/components/ui/FilterBar')

const FILTROS: FilterDef[] = [
  { type: 'search', key: 'q', placeholder: 'Buscar…' },
  {
    type: 'select',
    key: 'status',
    label: 'Status',
    defaultValue: 'todos',
    options: [
      { value: 'todos', label: 'Todos' },
      { value: 'baixo', label: 'Estoque baixo' },
    ],
  },
  {
    type: 'pills',
    key: 'periodo',
    label: 'Período',
    defaultValue: '30d',
    options: [
      { value: '7d', label: '7 dias' },
      { value: '30d', label: '30 dias' },
      { value: 'mes', label: 'Mês atual' },
    ],
  },
]

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  mockSearchParams = new URLSearchParams('')
  replaceSpy.mockClear()
  pushSpy.mockClear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  vi.useRealTimers()
  flushSync(() => root.unmount())
  container.remove()
})

function render(props: Partial<React.ComponentProps<typeof FilterBar>> = {}) {
  flushSync(() => {
    root.render(<FilterBar filters={FILTROS} {...props} />)
  })
  return container.querySelector('section[role="search"]') as HTMLElement
}

/** Digita como o usuário: setter nativo + evento `input`, para o React ver a mudança. */
function digitar(input: HTMLInputElement, texto: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  flushSync(() => {
    setter.call(input, texto)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const busca = () => container.querySelector('input[type="text"]') as HTMLInputElement
const botaoLimpar = () =>
  container.querySelector('button[aria-label="Limpar todos os filtros"]') as HTMLButtonElement | null

describe('FilterBar — busca com debounce de 300 ms', () => {
  it('só grava na URL 300 ms depois da última tecla', () => {
    vi.useFakeTimers()
    render()
    digitar(busca(), 'cam')
    vi.advanceTimersByTime(200)
    digitar(busca(), 'camisa')
    vi.advanceTimersByTime(299)
    expect(replaceSpy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(replaceSpy).toHaveBeenCalledTimes(1)
    expect(replaceSpy).toHaveBeenCalledWith('/admin/estoque?q=camisa', { scroll: false })
  })

  it('Enter aplica na hora, sem esperar o debounce', () => {
    vi.useFakeTimers()
    render()
    digitar(busca(), 'camisa')
    flushSync(() => {
      busca().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(replaceSpy).toHaveBeenCalledWith('/admin/estoque?q=camisa', { scroll: false })
    vi.advanceTimersByTime(1000)
    expect(replaceSpy).toHaveBeenCalledTimes(1)
  })

  it('debounceMs explícito do consumidor continua valendo', () => {
    vi.useFakeTimers()
    flushSync(() => {
      root.render(<FilterBar filters={[{ type: 'search', key: 'q', debounceMs: 800 }]} />)
    })
    digitar(busca(), 'x')
    vi.advanceTimersByTime(799)
    expect(replaceSpy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(replaceSpy).toHaveBeenCalledTimes(1)
  })
})

describe('FilterBar — Limpar condicional e estado na URL', () => {
  it('sem filtro ativo não mostra Limpar (valor default não conta)', () => {
    mockSearchParams = new URLSearchParams('status=todos&periodo=30d')
    render()
    expect(botaoLimpar()).toBeNull()
  })

  it('com filtro ativo mostra Limpar, e ele remove os filtros e mantém o resto da URL', () => {
    mockSearchParams = new URLSearchParams('status=baixo&periodo=7d&aba=giro')
    render()
    const limpar = botaoLimpar()
    expect(limpar).not.toBeNull()
    flushSync(() => limpar!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(pushSpy).toHaveBeenCalledWith('/admin/estoque?aba=giro', { scroll: false })
  })

  it('os controles refletem a URL (preset de período e select)', () => {
    mockSearchParams = new URLSearchParams('periodo=mes&status=baixo')
    render()
    const ativo = container.querySelector('button[aria-pressed="true"]') as HTMLButtonElement
    expect(ativo.textContent).toBe('Mês atual')
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('baixo')
  })

  it('escolher um preset grava na URL; voltar ao default limpa a chave', () => {
    mockSearchParams = new URLSearchParams('periodo=7d')
    render()
    const pill = (label: string) =>
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label)!
    flushSync(() => pill('Mês atual').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(pushSpy).toHaveBeenLastCalledWith('/admin/estoque?periodo=mes', { scroll: false })
    flushSync(() => pill('30 dias').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(pushSpy).toHaveBeenLastCalledWith('/admin/estoque', { scroll: false })
  })
})

describe('FilterBar — layout', () => {
  it('default (inline) preserva o markup dos consumidores existentes', () => {
    const section = render()
    expect(section.className).toContain('flex flex-wrap items-center gap-2')
    expect(section.className).not.toMatch(/\bgrid\b/)
    expect(section.getAttribute('data-layout')).toBe('inline')
    expect(busca().className).toContain('w-44')
  })

  it('grid: 1 coluna no mobile, 2 no sm e 4 no lg', () => {
    const section = render({ layout: 'grid' })
    expect(section.getAttribute('data-layout')).toBe('grid')
    for (const cls of ['grid', 'grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-4']) {
      expect(section.classList.contains(cls)).toBe(true)
    }
    expect(section.className).not.toContain('flex-wrap')
  })

  it('grid: cada controle ocupa a célula inteira', () => {
    render({ layout: 'grid' })
    expect(busca().className).toContain('w-full')
    expect(busca().className).not.toContain('w-44')
    expect(busca().closest('div')!.className).toContain('w-full')
    expect((container.querySelector('select') as HTMLSelectElement).className).toContain('w-full')
    const pills = container.querySelector('[role="group"]') as HTMLElement
    expect(pills.className).toContain('w-full')
    expect(pills.className).toContain('overflow-x-auto')
  })

  it('grid: inputClassName/className do consumidor continuam tendo prioridade', () => {
    flushSync(() => {
      root.render(
        <FilterBar
          layout="grid"
          filters={[{ type: 'search', key: 'q', inputClassName: 'w-72', className: 'sm:col-span-2' }]}
        />,
      )
    })
    expect(busca().className).toContain('w-72')
    expect(busca().closest('div')!.className).toContain('sm:col-span-2')
  })
})
