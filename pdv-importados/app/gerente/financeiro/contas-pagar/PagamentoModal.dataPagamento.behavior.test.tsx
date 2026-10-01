/** @vitest-environment jsdom */
/**
 * Onda B (extensão) — data de pagamento padrão e `max` do campo são o dia civil de Brasília.
 * Antes (UTC), entre 21h e 24h BRT a data padrão virava amanhã e o `max` permitia pagar com data futura.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: vi.fn() }))
vi.mock('./actions', () => ({
  buscarCaixasAbertosPagamentoAction: vi.fn().mockResolvedValue({ ok: true, caixas: [] }),
  registrarPagamentoAction: vi.fn(),
}))
vi.mock('@/app/caixa/actions', () => ({
  obterLimiteSangriaSemGerente: vi.fn().mockResolvedValue({ ok: true, limite: 200 }),
  validarGerenteDesconto: vi.fn(),
}))

const { PagamentoModal } = await import('./PagamentoModal')

const conta = {
  id: 'c1',
  fornecedor_id: 'f1',
  fornecedor_nome: 'Fornecedor Alfa',
  descricao: 'Compra de mercadoria',
  valor_total: 100,
  valor_pago: 0,
  vencimento: '2026-09-30',
  status: 'PENDENTE' as const,
  nfe_numero: null,
  nfe_importacao_id: null,
  criado_em: '2026-09-17T10:00:00Z',
  loja_id: 'loja-1',
  atrasado: false,
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
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

async function campoData(): Promise<HTMLInputElement> {
  act(() => {
    root.render(
      <PagamentoModal
        idioma="pt"
        locale="pt-BR"
        conta={conta}
        onClose={vi.fn()}
        onPagamentoRegistrado={vi.fn()}
      />,
    )
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return container.querySelector('input[type="date"]') as HTMLInputElement
}

describe('PagamentoModal — data de pagamento (Onda B)', () => {
  it('23:30 BRT (30/09): valor padrão e max = 2026-09-30 (não amanhã)', async () => {
    vi.setSystemTime(new Date('2026-10-01T02:30:00Z'))
    const campo = await campoData()
    expect(campo.value).toBe('2026-09-30')
    expect(campo.max).toBe('2026-09-30')
  })

  it('00:10 BRT (01/10): valor padrão e max = 2026-10-01', async () => {
    vi.setSystemTime(new Date('2026-10-01T03:10:00Z'))
    const campo = await campoData()
    expect(campo.value).toBe('2026-10-01')
    expect(campo.max).toBe('2026-10-01')
  })
})
