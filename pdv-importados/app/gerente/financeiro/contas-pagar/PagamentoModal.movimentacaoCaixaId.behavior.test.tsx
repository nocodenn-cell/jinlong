/** @vitest-environment jsdom */
/**
 * G-09 — o backend já calcula `movimentacaoCaixaId` ao registrar um
 * pagamento em dinheiro (sangria correspondente), mas a action descartava
 * esse dado antes de devolvê-lo à UI. Prova que agora ele chega até o toast
 * de sucesso quando presente, e que o fluxo sem dinheiro continua com a
 * mensagem genérica (sem inventar uma movimentação que não existe).
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const emitGerenteToastMock = vi.fn()
const registrarPagamentoActionMock = vi.fn()
const buscarCaixasAbertosPagamentoActionMock = vi.fn()
const obterLimiteSangriaSemGerenteMock = vi.fn()

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: emitGerenteToastMock,
}))

vi.mock('./actions', () => ({
  buscarCaixasAbertosPagamentoAction: (...args: unknown[]) => buscarCaixasAbertosPagamentoActionMock(...args),
  registrarPagamentoAction: (...args: unknown[]) => registrarPagamentoActionMock(...args),
}))

vi.mock('@/app/caixa/actions', () => ({
  obterLimiteSangriaSemGerente: () => obterLimiteSangriaSemGerenteMock(),
  validarGerenteDesconto: vi.fn(),
}))

const { PagamentoModal } = await import('./PagamentoModal')
const { getMessages } = await import('@/i18n/getMessages')

const m = getMessages('pt')

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
  emitGerenteToastMock.mockReset()
  registrarPagamentoActionMock.mockReset()
  buscarCaixasAbertosPagamentoActionMock.mockReset()
  obterLimiteSangriaSemGerenteMock.mockReset()
  buscarCaixasAbertosPagamentoActionMock.mockResolvedValue({
    ok: true,
    caixas: [{ id: 'caixa-1', operador: 'Operador 1' }],
  })
  obterLimiteSangriaSemGerenteMock.mockResolvedValue({ ok: true, limite: 200 })

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function montarESelecionarDinheiro() {
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
  // Espera o efeito de busca de caixas/limite resolver (auto-seleciona o único caixa aberto).
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

  const botaoDinheiro = Array.from(container.querySelectorAll('button[role="radio"]')).find((b) =>
    b.textContent?.includes(m.contas_pagar.forma_dinheiro),
  ) as HTMLButtonElement
  act(() => botaoDinheiro.click())
}

describe('PagamentoModal — movimentacaoCaixaId no toast (G-09)', () => {
  it('no hub financeiro, a baixa física oferece só dinheiro e preserva a sangria', async () => {
    registrarPagamentoActionMock.mockResolvedValue({ ok: true, conta: { ...conta, valor_pago: 100, status: 'PAGO' }, movimentacaoCaixaId: 'mov-caixa' })
    await act(async () => {
      root.render(<PagamentoModal somenteCaixa idioma="pt" locale="pt-BR" conta={conta} onClose={vi.fn()} onPagamentoRegistrado={vi.fn()} />)
    })
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(1)
    expect(container.querySelector('[role="radio"]')?.getAttribute('aria-checked')).toBe('true')
    expect(container.textContent).toContain('Pagar pela conta financeira')
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(registrarPagamentoActionMock).toHaveBeenCalledWith(expect.objectContaining({ forma: 'DINHEIRO', caixa_id: 'caixa-1' }))
  })
  it('pagamento em dinheiro com movimentacaoCaixaId: toast inclui a referência da sangria', async () => {
    registrarPagamentoActionMock.mockResolvedValue({
      ok: true,
      conta: { ...conta, valor_pago: 100, status: 'PAGO' },
      movimentacaoCaixaId: 'mov-11112222',
    })

    await montarESelecionarDinheiro()

    const form = container.querySelector('form') as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    expect(registrarPagamentoActionMock).toHaveBeenCalled()
    const chamada = emitGerenteToastMock.mock.calls.find((c) => c[0]?.kind === 'success')
    expect(chamada).toBeTruthy()
    expect(chamada![0].message).toContain('mov-1111')
  })

  it('sem movimentacaoCaixaId (forma não-dinheiro): toast genérico, sem inventar referência', async () => {
    registrarPagamentoActionMock.mockResolvedValue({
      ok: true,
      conta: { ...conta, valor_pago: 100, status: 'PAGO' },
      movimentacaoCaixaId: null,
    })

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
    // forma padrão é PIX — não precisa trocar.

    const form = container.querySelector('form') as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    const chamada = emitGerenteToastMock.mock.calls.find((c) => c[0]?.kind === 'success')
    expect(chamada).toBeTruthy()
    expect(chamada![0].message).toBe(m.comum.sucesso)
  })
})
