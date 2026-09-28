/** @vitest-environment jsdom */
/**
 * G-10 — fechar o modal de pagamento com valor digitado usava confirm()
 * nativo pra perguntar "descartar?". Prova que agora é um modal do app:
 * fechar com valor limpo não pergunta nada; fechar com valor digitado abre
 * o modal de confirmação; "Não" mantém aberto; "Sim" fecha de verdade.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const buscarCaixasAbertosPagamentoActionMock = vi.fn()
const obterLimiteSangriaSemGerenteMock = vi.fn()

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: vi.fn(),
}))

vi.mock('./actions', () => ({
  buscarCaixasAbertosPagamentoAction: (...args: unknown[]) => buscarCaixasAbertosPagamentoActionMock(...args),
  registrarPagamentoAction: vi.fn(),
}))

vi.mock('@/app/caixa/actions', () => ({
  obterLimiteSangriaSemGerente: () => obterLimiteSangriaSemGerenteMock(),
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
let confirmSpy: ReturnType<typeof vi.spyOn>
let onCloseMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  buscarCaixasAbertosPagamentoActionMock.mockReset()
  obterLimiteSangriaSemGerenteMock.mockReset()
  buscarCaixasAbertosPagamentoActionMock.mockResolvedValue({ ok: true, caixas: [] })
  obterLimiteSangriaSemGerenteMock.mockResolvedValue({ ok: true, limite: 200 })
  // Se o código voltar a usar confirm(), este spy denuncia.
  confirmSpy = vi.spyOn(window, 'confirm')
  onCloseMock = vi.fn()

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  confirmSpy.mockRestore()
})

async function montar() {
  act(() => {
    root.render(
      <PagamentoModal
        idioma="pt"
        locale="pt-BR"
        conta={conta}
        onClose={onCloseMock}
        onPagamentoRegistrado={vi.fn()}
      />,
    )
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function botaoFechar(): HTMLButtonElement {
  return Array.from(container.querySelectorAll('button')).find(
    (b) => b.getAttribute('aria-label')?.toLowerCase().includes('fechar'),
  ) as HTMLButtonElement
}

describe('PagamentoModal — confirmação de descarte (G-10)', () => {
  it('fechar sem valor digitado (0): fecha direto, sem perguntar nada', async () => {
    await montar()
    const valorInput = container.querySelector('#pg-valor') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(valorInput, '')
      valorInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    act(() => botaoFechar().click())

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onCloseMock).toHaveBeenCalledTimes(1)
  })

  it('fechar com valor digitado: abre modal do app, nunca confirm() nativo', async () => {
    await montar()
    // valor inicial já vem preenchido com o total em aberto — "sujo" por padrão.
    act(() => botaoFechar().click())

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onCloseMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Descartar o pagamento em digitação?')
  })

  it('"Não" mantém o modal de pagamento aberto', async () => {
    await montar()
    act(() => botaoFechar().click())

    const btnNao = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Não') as HTMLButtonElement
    act(() => btnNao.click())

    expect(onCloseMock).not.toHaveBeenCalled()
  })

  it('"Sim" fecha de fato o modal de pagamento', async () => {
    await montar()
    act(() => botaoFechar().click())

    const btnSim = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Sim') as HTMLButtonElement
    act(() => btnSim.click())

    expect(onCloseMock).toHaveBeenCalledTimes(1)
  })
})
