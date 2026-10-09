/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComissaoResumoRow } from '@/app/gerente/comissoes/actions'
import type { ComissoesLabels } from './comissoesLabels'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const carregarDetalheMock = vi.fn()

vi.mock('@/app/gerente/comissoes/actions', () => ({
  carregarDetalheComissoes: (...args: unknown[]) => carregarDetalheMock(...args),
  marcarComissoesPagas: vi.fn(),
}))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { ComissoesContent } from './ComissoesContent'

// Rótulos: o teste só valida o deep-link, então cada chave devolve o próprio nome.
const LABELS = new Proxy({ locale: 'pt-BR' } as Record<string, string>, {
  get: (t, k) => (k in t ? t[k as string] : String(k)),
}) as unknown as ComissoesLabels

const linha = (id: string, nome: string): ComissaoResumoRow => ({
  operadorId: id,
  operadorNome: nome,
  totalVendas: 1,
  totalComissaoBruta: 10,
  totalAjustes: 0,
  totalLiquidoPago: 0,
  totalSaldoResidual: 0,
})
const FILTRO = { de: '2026-09-01', ate: '2026-09-30', status: 'todos' as const }

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  carregarDetalheMock.mockReset()
  carregarDetalheMock.mockResolvedValue({ success: true, data: [] })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function render(operadorInicialId: string | null) {
  await act(async () => {
    root.render(
      <ComissoesContent
        dados={[linha('op-1', 'Ana'), linha('op-2', 'Bia')]}
        filtroInicial={FILTRO}
        operadorInicialId={operadorInicialId}
        labels={LABELS}
      />,
    )
  })
}

describe('Comissões — deep-link ?operador= (vindo de Funcionários)', () => {
  it('abre o detalhe do operador indicado, com o filtro da página', async () => {
    await render('op-2')
    expect(carregarDetalheMock).toHaveBeenCalledTimes(1)
    expect(carregarDetalheMock).toHaveBeenCalledWith('op-2', FILTRO)
  })

  it('sem parâmetro, não abre nenhum detalhe', async () => {
    await render(null)
    expect(carregarDetalheMock).not.toHaveBeenCalled()
  })

  it('operador sem comissão no período: não abre nada e não quebra', async () => {
    await render('op-inexistente')
    expect(carregarDetalheMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Ana')
  })
})
