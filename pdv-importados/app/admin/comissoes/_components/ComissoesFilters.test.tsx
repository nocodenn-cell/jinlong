/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ComissoesFilters } from './ComissoesFilters'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

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

describe('ComissoesFilters', () => {
  it('expõe inputs de período/status e presets ativos', () => {
    act(() => {
      root.render(
        <ComissoesFilters
          filtro={{ de: '2026-07-10', ate: '2026-08-09', status: 'pendente' }}
          presets={[
            { id: '7d', label: '7 dias', de: '2026-08-02', ate: '2026-08-09' },
            { id: '30d', label: '30 dias', de: '2026-07-10', ate: '2026-08-09' },
            { id: 'mes', label: 'Este mês', de: '2026-08-01', ate: '2026-08-09' },
          ]}
          activePresetId="30d"
          labels={{
            de: 'De',
            ate: 'Até',
            status: 'Status',
            aplicar: 'Aplicar',
            statusTodos: 'Todos',
            statusPendente: 'Pendente',
            statusPago: 'Pago',
          }}
        />,
      )
    })

    const form = container.querySelector('form')
    expect(form).not.toBeNull()
    expect(container.querySelector('input[name="de"]')).not.toBeNull()
    expect(container.querySelector('input[name="ate"]')).not.toBeNull()
    expect(container.querySelector('select[name="status"]')).not.toBeNull()
    expect(container.textContent).toContain('Aplicar')

    const active = container.querySelector('[data-active="true"]')
    expect(active?.textContent).toContain('30 dias')
  })
})
