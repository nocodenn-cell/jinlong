/** @vitest-environment jsdom */
/**
 * UX-003 — o mesmo instante precisa mostrar o mesmo horário no Dashboard (Server Component, runtime UTC)
 * e em Vendas. Renderiza a coluna de hora de Vendas e compara com o formatador usado pelo Dashboard.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { formatDateTimeLocaleDefault, formatDateTimeOrDash } from '@/lib/format/datetime'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('../actions', () => ({ obterDetalheVenda: vi.fn() }))
vi.mock('@/app/gerente/vendas/actions', () => ({}))
vi.mock('@/app/gerente/vendas/VendaCancelarModal', () => ({ VendaCancelarModal: () => null }))
vi.mock('@/app/gerente/vendas/VendaCancelamentoReciboModal', () => ({ VendaCancelamentoReciboModal: () => null }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { VendasTable } = await import('./VendasTable')

const labels = new Proxy({}, { get: (_t, k) => String(k) }) as never
const m = getMessages('pt')
const TZ_ORIGINAL = process.env.TZ

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
  if (TZ_ORIGINAL === undefined) delete process.env.TZ
  else process.env.TZ = TZ_ORIGINAL
})

const linha = (data: string | null) => ({
  id: 'abe39580-0000-4000-8000-000000000000',
  data,
  total_liquido: 10,
  total_bruto: 10,
  forma_pagamento: 'DINHEIRO',
  status: 'CONCLUIDA',
  caixa_id: null,
  operador_id: null,
  qtd_itens_total: 1,
  qtd_itens_distintos: 1,
  primeiro_produto: 'Caneca',
  vendedor_nome: null,
})

function renderVendas(data: string | null, mostrarData = false) {
  act(() =>
    root.render(<VendasTable vendas={[linha(data)]} labels={labels} m={m} locale="pt-BR" mostrarData={mostrarData} />),
  )
}

describe('Dashboard × Vendas — mesmo instante, mesmo horário (UX-003)', () => {
  for (const tz of ['UTC', 'America/Sao_Paulo', 'Asia/Shanghai']) {
    it(`03:24:27Z aparece como 00:24 nas duas telas com runtime em ${tz}`, () => {
      process.env.TZ = tz
      const iso = '2026-09-30T03:24:27.000Z'
      renderVendas(iso)
      const textoVendas = container.textContent ?? ''
      expect(textoVendas).toContain('00:24')

      const dashboard = formatDateTimeLocaleDefault(iso, 'pt-BR') // usado em app/admin/dashboard/page.tsx
      const detalhe = formatDateTimeOrDash(iso, 'pt-BR', 'medium') // usado em VendaDetailSheet
      expect(dashboard).toBe('30/09/2026, 00:24:27')
      expect(detalhe).toContain('00:24:27')
      // hora (HH:mm) idêntica nas três apresentações
      expect(dashboard).toContain('00:24')
      expect(detalhe).toContain('00:24')
    })
  }

  it('com data visível, Vendas mostra o dia de São Paulo (30/09) e não o dia UTC', () => {
    process.env.TZ = 'UTC'
    renderVendas('2026-10-01T02:30:00.000Z', true)
    expect(container.textContent).toContain('30/09')
    expect(container.textContent).toContain('23:30')
  })

  it('data ausente continua "—"', () => {
    renderVendas(null)
    expect(container.textContent).toContain('—')
  })
})
