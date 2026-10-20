/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const push = vi.fn()
let qs = 'tab=recebiveis&pagina=2'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/admin/financeiro',
  useSearchParams: () => new URLSearchParams(qs),
}))
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }))

import { PeriodoCivilFilter, periodoCivilLabelsAdmin } from './PeriodoCivilFilter'
import pt from '@/src/lib/i18n/pt.json'
import zh from '@/src/lib/i18n/zh.json'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const labels = periodoCivilLabelsAdmin(pt.admin_ui as unknown as Record<string, string>)
const HOJE = '2026-10-20'
let root: Root; let el: HTMLDivElement
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); push.mockReset(); qs = 'tab=recebiveis&pagina=2' })
afterEach(() => { act(() => root.unmount()); el.remove() })
const render = (de: string, ate: string) => act(() => { root.render(<PeriodoCivilFilter de={de} ate={ate} hoje={HOJE} locale="pt-BR" labels={labels} />) })
const btn = (p: string) => el.querySelector<HTMLButtonElement>(`[data-preset="${p}"]`)!

it('padrão Mês atual: ativo, sem chips nem Limpar', () => {
  render('2026-10-01', HOJE)
  expect(btn('mes').getAttribute('aria-pressed')).toBe('true')
  expect(el.querySelector('[data-testid="filtros-ativos"]')).toBeNull()
})

it('preset 7 dias vai para a URL preservando a aba e zerando a página', () => {
  render('2026-10-01', HOJE)
  act(() => btn('7d').click())
  expect(push).toHaveBeenCalledWith('/admin/financeiro?tab=recebiveis&de=2026-10-14&ate=2026-10-20', { scroll: false })
})

it('período personalizado mostra chip com datas pt-BR, removível, e Limpar filtros', () => {
  qs = 'tab=recebiveis&de=2026-09-01&ate=2026-09-30'
  render('2026-09-01', '2026-09-30')
  expect(btn('personalizado').getAttribute('aria-pressed')).toBe('true')
  const chip = el.querySelector<HTMLAnchorElement>('[data-filtro="periodo"]')!
  expect(chip.textContent).toContain('Período: 01/09/2026 – 30/09/2026')
  expect(chip.getAttribute('href')).toBe('/admin/financeiro?tab=recebiveis')
  expect(chip.getAttribute('aria-label')).toContain('Remover filtro')
  const limpar = el.querySelector<HTMLAnchorElement>('[data-testid="filtros-limpar"]')!
  expect(limpar.textContent).toBe('Limpar filtros')
  expect(limpar.getAttribute('href')).toBe('/admin/financeiro?tab=recebiveis')
})

it('Personalizado abre as datas e aplica normalizando inversão', () => {
  render('2026-10-01', HOJE)
  act(() => btn('personalizado').click())
  const [de, ate] = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="date"]'))
  de.value = '2026-09-30'; ate.value = '2026-09-01'
  act(() => { el.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  expect(push).toHaveBeenCalledWith('/admin/financeiro?tab=recebiveis&de=2026-09-01&ate=2026-09-30', { scroll: false })
})

it('chaves de i18n existem em pt e zh', () => {
  for (const d of [pt.admin_ui, zh.admin_ui] as unknown as Record<string, string>[]) {
    for (const v of Object.values(periodoCivilLabelsAdmin(d))) expect(typeof v === 'string' && v.length > 0).toBe(true)
  }
})
