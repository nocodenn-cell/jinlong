/** @vitest-environment jsdom */
/**
 * Onda B (extensão) — a data de emissão inicial da OC nova é o dia civil de Brasília, não o dia UTC.
 * `ocInicial` (edição) continua mandando.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/gerente/compras/actions', () => ({
  criarOrdemCompra: vi.fn(),
  atualizarOrdemCompra: vi.fn(),
}))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: vi.fn() }))

const { OcFormModal } = await import('./OcFormModal')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  // Só `Date` é falsificado: o agendador do React segue com timers reais.
  vi.useFakeTimers({ toFake: ['Date'] })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

function emissaoInicial(ocInicial: unknown = null): string {
  act(() => {
    root.render(
      <OcFormModal
        idioma="pt"
        ocInicial={ocInicial as never}
        fornecedores={[]}
        produtos={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
  })
  return (container.querySelectorAll('input[type="date"]')[0] as HTMLInputElement).value
}

describe('OcFormModal — data de emissão inicial (Onda B)', () => {
  it('23:30 BRT (30/09) → 2026-09-30, não 2026-10-01', () => {
    vi.setSystemTime(new Date('2026-10-01T02:30:00Z'))
    expect(emissaoInicial()).toBe('2026-09-30')
  })

  it('00:10 BRT (01/10) → 2026-10-01', () => {
    vi.setSystemTime(new Date('2026-10-01T03:10:00Z'))
    expect(emissaoInicial()).toBe('2026-10-01')
  })

  it('editando uma OC existente, a data da OC vence', () => {
    vi.setSystemTime(new Date('2026-10-01T02:30:00Z'))
    const oc = {
      id: 'oc-1',
      fornecedor_id: null,
      fornecedor_nome: null,
      status: 'RASCUNHO' as const,
      data_emissao: '2026-09-17',
      data_prevista_chegada: null,
      observacao: null,
      total_itens: 0,
      valor_total: 0,
      created_at: '2026-09-17T00:00:00Z',
      itens: [],
    }
    expect(emissaoInicial(oc)).toBe('2026-09-17')
  })
})
