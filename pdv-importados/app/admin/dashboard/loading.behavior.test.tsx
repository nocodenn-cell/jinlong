/** @vitest-environment jsdom */
/**
 * Roadmap UX, Tarefa 6 — skeleton do Dashboard na hierarquia do conteúdo final
 * (KPI → gráfico → tabela), para o layout não "pular" quando os dados chegam.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import DashboardLoading from './loading'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  flushSync(() => root.render(<DashboardLoading />))
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

const raiz = () => container.querySelector('[data-testid="dashboard-loading"]') as HTMLElement

describe('Dashboard — loading', () => {
  it('anuncia o carregamento para leitores de tela', () => {
    expect(raiz().getAttribute('aria-busy')).toBe('true')
    expect(raiz().getAttribute('aria-live')).toBe('polite')
  })

  it('segue a hierarquia KPI → gráfico → tabela', () => {
    const blocos = Array.from(raiz().querySelectorAll<HTMLElement>('[data-skeleton]')).map(
      (el) => el.dataset.skeleton,
    )
    expect(blocos).toEqual(['kpis', 'chart', 'table'])
  })

  it('4 KPIs em grid responsivo (2 colunas no mobile, 4 no sm)', () => {
    const kpis = raiz().querySelector('[data-skeleton="kpis"]') as HTMLElement
    expect(kpis.children).toHaveLength(4)
    for (const cls of ['grid', 'grid-cols-2', 'sm:grid-cols-4']) {
      expect(kpis.classList.contains(cls)).toBe(true)
    }
  })

  it('o gráfico reserva a altura do ChartCard e a tabela mostra linhas', () => {
    const chart = raiz().querySelector('[data-skeleton="chart"]') as HTMLElement
    const alturas = Array.from(chart.querySelectorAll('*')).filter((el) => el.classList.contains('h-[260px]'))
    expect(alturas.length).toBeGreaterThan(0)
    const table = raiz().querySelector('[data-skeleton="table"]') as HTMLElement
    expect(table.querySelectorAll('.h-10').length).toBeGreaterThanOrEqual(5)
  })
})
