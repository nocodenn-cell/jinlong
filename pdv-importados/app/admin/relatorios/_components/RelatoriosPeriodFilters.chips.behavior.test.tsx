/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }))
import { RelatoriosPeriodFilters } from './RelatoriosPeriodFilters'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const labels = { de: 'De', ate: 'Até', aplicar: 'Aplicar', limpar: 'Limpar filtros', exportarCsv: 'CSV', csvFilename: 'r.csv', preset7: '7 dias', preset15: '15 dias', preset30: '30 dias', presetsAria: 'Presets', imprimir: 'Imprimir', chipPeriodo: 'Período: {{label}}', chipRemover: 'Remover filtro {{label}}', filtrosAtivos: 'Filtros ativos', locale: 'pt-BR' }

it('período fora do padrão vira chip removível com datas civis pt-BR', () => {
  const el = document.createElement('div'); const root = createRoot(el)
  act(() => root.render(<RelatoriosPeriodFilters de="2025-01-01" ate="2025-01-31" csvRows={[]} labels={labels} view="vendas" />))
  const chip = el.querySelector<HTMLAnchorElement>('[data-filtro="periodo"]')!
  expect(chip.textContent).toContain('Período: 01/01/2025 – 31/01/2025')
  expect(chip.getAttribute('href')).toBe('/admin/relatorios?view=vendas')
  expect(el.querySelector('[data-testid="filtros-limpar"]')?.textContent).toBe('Limpar filtros')
  act(() => root.unmount())
})
