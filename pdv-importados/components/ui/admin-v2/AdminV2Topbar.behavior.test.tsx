/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { AdminV2Topbar } = await import('./AdminV2Topbar')
const { getMessages } = await import('@/i18n/getMessages')
const { AdminV2SessionProvider } = await import('./AdminV2SessionContext')

let host: HTMLDivElement
let root: Root

function mount(idioma: 'pt' | 'zh', props: Record<string, unknown> = {}) {
  const ui = getMessages(idioma).admin_ui
  act(() => {
    root.render(
      <AdminV2SessionProvider idioma={idioma}>
        <AdminV2Topbar ui={ui} {...props} />
      </AdminV2SessionProvider>,
    )
  })
}
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null

describe('AdminV2Topbar', () => {
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('só aparece em >= lg e traz busca + notificações', () => {
    mount('pt')
    const bar = q('admin-v2-topbar')!
    expect(bar.className).toMatch(/(^|\s)hidden(\s|$)/)
    expect(bar.className).toContain('lg:flex')
    expect(bar.textContent).toContain('Buscar')
    expect(q('admin-v2-topbar-notificacoes')!.getAttribute('aria-label')).toBe('Notificações: Sem notificações')
    expect(q('admin-v2-topbar-empresa')).toBeNull()
  })

  it('mostra alerta de estoque baixo e empresa com troca (pt)', () => {
    mount('pt', { stockAlertCount: 3, empresaNome: 'Loja Centro', podeTrocarEmpresa: true })
    expect(q('admin-v2-topbar-notificacoes')!.getAttribute('aria-label')).toBe(
      'Notificações: 3 itens com estoque baixo',
    )
    const emp = q('admin-v2-topbar-empresa')!
    expect(emp.textContent).toContain('Loja Centro')
    const link = emp.querySelector('a')!
    expect(link.textContent).toBe('Trocar empresa')
    expect(link.getAttribute('href')).toBe('/selecionar-empresa?next=%2Fadmin%2Fdashboard')
  })

  it('textos em chinês e sem troca quando só há uma empresa', () => {
    mount('zh', { stockAlertCount: 2, empresaNome: '金龙', podeTrocarEmpresa: false })
    expect(q('admin-v2-topbar-notificacoes')!.getAttribute('aria-label')).toBe('通知: 2 个商品库存不足')
    expect(q('admin-v2-topbar-empresa')!.querySelector('a')).toBeNull()
  })
})
