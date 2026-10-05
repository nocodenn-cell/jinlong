/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { ContaPagarRow } from './actions'

const pagar = vi.hoisted(() => vi.fn())
vi.mock('./actions', () => ({
  registrarPagamentoAction: pagar,
  listarPagamentosContaAction: vi.fn(async () => ({ ok: true, pagamentos: [] })),
  buscarContasPagarAction: vi.fn(), cancelarContaPagarAction: vi.fn(), exportarContasPagarParaCSVAction: vi.fn(),
  buscarCaixasAbertosPagamentoAction: vi.fn(async () => ({ ok: true, caixas: [] })),
}))
vi.mock('@/app/caixa/actions', () => ({
  obterLimiteSangriaSemGerente: vi.fn(async () => ({ ok: true, limite: 200 })), validarGerenteDesconto: vi.fn(),
}))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
import { ContasPagarListClient } from './ContasPagarListClient'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const inicial: ContaPagarRow = {
  id: 'conta-1', fornecedor_id: 'fornecedor-1', fornecedor_nome: 'Fornecedor Alfa', descricao: 'Compra de mercadoria',
  valor_total: 1000, valor_pago: 0, vencimento: '2026-10-10', status: 'PENDENTE', nfe_numero: '123',
  nfe_importacao_id: 'nota-1', criado_em: '2026-10-05T12:00:00Z', loja_id: 'loja-1', atrasado: false,
}
let container: HTMLDivElement
let root: Root
beforeEach(async () => {
  vi.useFakeTimers(); vi.clearAllMocks()
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  let atual = { ...inicial }
  pagar.mockImplementation(async ({ valor }: { valor: number }) => {
    atual = { ...atual, valor_pago: atual.valor_pago + valor, status: atual.valor_pago + valor === 1000 ? 'PAGO' : 'PARCIAL' }
    return { ok: true, conta: atual }
  })
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  await act(async () => root.render(<ContasPagarListClient idioma="pt" locale="pt-BR" contasIniciais={[inicial]}
    hasMoreInicial={false} fornecedoresOpts={[]} statusInicial="todos" periodoInicial="" actorLojaId="loja-1" />))
})
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })
function button(text: string): HTMLButtonElement {
  const result = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === text)
  expect(result).toBeTruthy()
  return result!
}
async function abrir() { await act(async () => button('Compra de mercadoria').click()) }
async function registrar(valor: string) {
  await act(async () => button('Registrar pagamento').click())
  const input = document.querySelector<HTMLInputElement>('#pg-valor')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => document.querySelector('#pg-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}
function detalhe(): HTMLElement { return document.querySelector('[role="dialog"]')! }

describe('Conta a pagar — detalhes e baixa parcial', () => {
  it('abre os dados do título e mantém acesso à nota de origem', async () => {
    await abrir()
    expect(detalhe().textContent).toContain('Fornecedor Alfa')
    expect(detalhe().textContent).toContain('1.000,00')
    expect(detalhe().textContent).toContain('0,00')
    expect(detalhe().textContent).toContain('10/10/2026')
    expect(detalhe().querySelector('a')?.getAttribute('href')).toBe('/admin/estoque/importar-nfe?importacao=nota-1')
  })
  it('paga 300, mostra saldo 700 e permite quitar os 700 restantes', async () => {
    await abrir(); await registrar('300,00')
    expect(pagar).toHaveBeenCalledWith(expect.objectContaining({ conta_id: inicial.id, valor: 300 }))
    await abrir()
    expect(detalhe().textContent).toContain('300,00'); expect(detalhe().textContent).toContain('700,00')
    expect(detalhe().textContent).toContain('(PARCIAL)')
    await registrar('700,00'); await abrir()
    expect(pagar).toHaveBeenLastCalledWith(expect.objectContaining({ conta_id: inicial.id, valor: 700 }))
    expect(detalhe().textContent).toContain('(PAGO)')
    expect([...detalhe().querySelectorAll('button')].some(b => b.textContent === 'Registrar pagamento')).toBe(false)
  })
  it('não envia pagamento acima do saldo', async () => {
    await abrir(); await registrar('1000,01')
    expect(pagar).not.toHaveBeenCalled()
    expect(document.querySelector('#err-valor')).not.toBeNull()
  })
})
