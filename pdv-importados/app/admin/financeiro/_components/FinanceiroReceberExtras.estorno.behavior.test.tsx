/** @vitest-environment jsdom */
/**
 * N-02 — estornar uma liquidação usava window.prompt() nativo pro motivo.
 * Prova que agora é um modal do próprio app (DragonModal), com validação
 * visível, e que o motivo digitado chega até estornarLiquidacaoReceber.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estornarLiquidacaoReceberMock = vi.fn()
const listarLiquidacoesReceberMock = vi.fn()

vi.mock('@/app/gerente/financeiro/actions', () => ({
  criarTituloReceber: vi.fn(),
  liquidarTitulo: vi.fn(),
  listarLiquidacoesReceber: (...args: unknown[]) => listarLiquidacoesReceberMock(...args),
  estornarLiquidacaoReceber: (...args: unknown[]) => estornarLiquidacaoReceberMock(...args),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const { FinanceiroReceberExtras } = await import('./FinanceiroReceberExtras')
const { AdminV2SessionProvider } = await import('@/components/ui/admin-v2/AdminV2SessionContext')

const conta = {
  id: 'titulo-1',
  cliente_id: 'c1',
  cliente_nome: 'Cliente Alfa',
  valor_total: 100,
  valor_aberto: 40,
  loja_id: 'loja-1',
} as unknown as import('./ContasReceberTable').ContaLinha

const liquidacao = {
  id: 'liq-1',
  tituloId: 'titulo-1',
  valor: 60,
  formaPagamento: 'PIX',
  createdAt: '2026-09-17T10:00:00Z',
  operacaoTipo: 'RECEBIMENTO' as const,
  operacaoOrigemId: null,
}

let container: HTMLDivElement
let root: Root
let promptSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  estornarLiquidacaoReceberMock.mockReset()
  listarLiquidacoesReceberMock.mockReset()
  listarLiquidacoesReceberMock.mockResolvedValue({ success: true, data: [liquidacao] })
  // Se o código voltar a usar window.prompt, este spy denuncia.
  promptSpy = vi.spyOn(window, 'prompt')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
  promptSpy.mockRestore()
})

function render() {
  flushSync(() =>
    root.render(
      <AdminV2SessionProvider idioma="pt">
        <FinanceiroReceberExtras
          contas={[conta]}
          clientesIniciais={[]}
          caixasAbertos={[]}
          actorLojaId="loja-1"
        />
      </AdminV2SessionProvider>,
    ),
  )
}

async function abrirHistorico() {
  const btnHistorico = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent === 'Histórico',
  ) as HTMLButtonElement
  await act(async () => {
    btnHistorico.click()
    await Promise.resolve()
  })
}

describe('FinanceiroReceberExtras — modal de estorno (N-02)', () => {
  it('clicar em Estornar abre um modal do app, nunca window.prompt', async () => {
    render()
    await abrirHistorico()

    const btnEstornar = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Estornar',
    ) as HTMLButtonElement
    act(() => btnEstornar.click())

    expect(promptSpy).not.toHaveBeenCalled()
    expect(container.querySelector('#motivo-estorno')).toBeTruthy()
  })

  it('motivo curto demais mostra erro visível, não chama a action', async () => {
    render()
    await abrirHistorico()
    const btnEstornar = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Estornar',
    ) as HTMLButtonElement
    act(() => btnEstornar.click())

    const input = container.querySelector('#motivo-estorno') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'x')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const btnConfirmar = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Estornar' && b.closest('[role="dialog"]'),
    ) as HTMLButtonElement
    act(() => btnConfirmar.click())

    expect(container.textContent).toContain('Motivo deve ter ao menos 2 caracteres.')
    expect(estornarLiquidacaoReceberMock).not.toHaveBeenCalled()
  })

  it('motivo válido chama estornarLiquidacaoReceber com o texto digitado', async () => {
    estornarLiquidacaoReceberMock.mockResolvedValue({ success: true })
    render()
    await abrirHistorico()
    const btnEstornar = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Estornar',
    ) as HTMLButtonElement
    act(() => btnEstornar.click())

    const input = container.querySelector('#motivo-estorno') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'Pagamento em duplicidade')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const btnConfirmar = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Estornar' && b.closest('[role="dialog"]'),
    ) as HTMLButtonElement
    await act(async () => {
      btnConfirmar.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(estornarLiquidacaoReceberMock).toHaveBeenCalledWith(
      expect.objectContaining({ liquidacao_id: 'liq-1', motivo: 'Pagamento em duplicidade' }),
    )
  })
})

describe('FinanceiroReceberExtras — card de liquidação (UX-005)', () => {
  it('identifica o título (cliente + em aberto) numa linha própria, acima dos controles', () => {
    render()
    const li = container.querySelector('li') as HTMLElement
    const form = li.querySelector('form') as HTMLFormElement
    const nome = Array.from(li.querySelectorAll('span')).find((e) => e.textContent === 'Cliente Alfa') as HTMLElement

    expect(nome).toBeTruthy()
    expect(nome.getAttribute('title')).toBe('Cliente Alfa')
    expect(nome.className).toContain('truncate')
    expect(form.contains(nome)).toBe(false)
    expect(li.className).not.toContain('sm:flex-row')
    expect(li.textContent).toContain('em aberto')
    // cliente aparece antes do formulário no DOM
    expect(nome.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('formas de pagamento têm rótulo legível, mantendo o código como value', () => {
    render()
    const select = container.querySelector('select[name="forma"]') as HTMLSelectElement
    const opts = Array.from(select.options)
    expect(opts.map((o) => o.value)).toEqual(['DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO'])
    for (const o of opts) {
      expect(o.textContent).not.toMatch(/CARTAO_|^[A-Z_]{4,}$/)
    }
  })
})
