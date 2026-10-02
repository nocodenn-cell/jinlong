/** @vitest-environment jsdom */
/**
 * PR-2D (D-3) — a devolução em dinheiro sai de UM caixa pagador:
 *  · 2+ caixas abertos  → o operador ESCOLHE (não há "primeiro/último"): sem escolha o envio fica bloqueado
 *  · 1 caixa aberto     → nada a escolher; a UI não envia `caixa_id` (o servidor usa o único)
 *  · outra forma (PIX)  → o seletor não aparece e `caixa_id` nunca é enviado
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const devolverMock = vi.fn()
const listarCaixasMock = vi.fn()

vi.mock('./actions', () => ({
  devolverOuTrocarVendaAction: (...args: unknown[]) => devolverMock(...args),
  listarCaixasElegiveisDevolucaoAction: (...args: unknown[]) => listarCaixasMock(...args),
}))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: vi.fn() }))

import { VendaDevolucaoModal } from '@/app/gerente/vendas/VendaDevolucaoModal'
import type { VendaDetalhe } from '@/app/admin/vendas/actions'

const m = getMessages('pt')
let container: HTMLDivElement
let root: Root

const VENDA: VendaDetalhe = {
  id: '11111111-1111-4111-8111-111111111111',
  data: '2026-09-30T12:00:00.000Z',
  total_bruto: 100,
  total_desconto: 0,
  total_liquido: 100,
  forma_pagamento: 'DINHEIRO',
  tipo_venda: null,
  status: 'CONCLUIDA',
  numero_nf: null,
  operador_nome: 'Op',
  cliente_nome: null,
  tem_conta_receber: false,
  valor_aberto_cr: 0,
  pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: 100 }],
  desconto_gerente_valor: 0,
  desconto_gerente_percentual: 0,
  itens: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      nome: 'Produto',
      codigo_barras: null,
      quantidade: 4,
      quantidade_devolvida: 0,
      preco_unitario: 25,
      preco_unitario_original: 25,
      desconto_unitario: 0,
      subtotal: 100,
      tipo_preco: null,
      tipo_preco_fonte: null,
      custo_unitario_snap: null,
      regra_aplicada_id: null,
    },
  ],
  showMargemVisual: false,
  showPrecoFonte: false,
}

const CAIXA_A = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', operador: 'Ana' }
const CAIXA_B = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', operador: 'Beto' }

async function montar(): Promise<void> {
  await act(async () => {
    root.render(
      <VendaDevolucaoModal venda={VENDA} locale="pt" m={m} onClose={vi.fn()} onConcluido={vi.fn()} />,
    )
    await Promise.resolve()
    await Promise.resolve()
  })
}

function setValor(el: HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  act(() => {
    setter?.call(el, value)
    el.dispatchEvent(new Event(el instanceof HTMLTextAreaElement ? 'input' : 'change', { bubbles: true }))
  })
}

function clicarMais(): void {
  const botoes = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent === '+')
  act(() => {
    botoes[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    botoes[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function preencherDevolucao(): void {
  setValor(container.querySelector('#motivo-devolucao') as HTMLTextAreaElement, 'Defeito')
  clicarMais()
}

function botaoConfirmar(): HTMLButtonElement {
  return container.querySelector('button[type="submit"]') as HTMLButtonElement
}

async function enviar(): Promise<void> {
  const form = container.querySelector('#devolver-venda-form') as HTMLFormElement
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  devolverMock.mockResolvedValue({ ok: true, operacaoId: 'op', vendaId: VENDA.id, tipo: 'DEVOLUCAO', valorEstornado: 50, valorCaixaEstornado: 50, itens: [], operadorNome: 'G' })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('VendaDevolucaoModal — caixa pagador (D-3)', () => {
  it('2+ caixas abertos: exige escolher o caixa e envia caixa_id', async () => {
    listarCaixasMock.mockResolvedValue({ ok: true, caixas: [CAIXA_A, CAIXA_B] })
    await montar()
    // forma padrão da venda sem título é PIX → troca para DINHEIRO
    setValor(container.querySelector('#forma-estorno') as HTMLSelectElement, 'DINHEIRO')
    preencherDevolucao()

    expect(container.querySelector('#caixa-pagador')).not.toBeNull()
    expect(botaoConfirmar().disabled).toBe(true) // sem escolher o caixa, não envia

    setValor(container.querySelector('#caixa-pagador') as HTMLSelectElement, CAIXA_B.id)
    expect(botaoConfirmar().disabled).toBe(false)

    await enviar()
    expect(devolverMock).toHaveBeenCalledTimes(1)
    const fd = devolverMock.mock.calls[0][0] as FormData
    expect(fd.get('forma_estorno')).toBe('DINHEIRO')
    expect(fd.get('caixa_id')).toBe(CAIXA_B.id)
  })

  it('1 caixa aberto: não pede escolha e não envia caixa_id (o servidor usa o único)', async () => {
    listarCaixasMock.mockResolvedValue({ ok: true, caixas: [CAIXA_A] })
    await montar()
    setValor(container.querySelector('#forma-estorno') as HTMLSelectElement, 'DINHEIRO')
    preencherDevolucao()

    expect(container.querySelector('#caixa-pagador')).toBeNull()
    expect(botaoConfirmar().disabled).toBe(false)
    await enviar()
    const fd = devolverMock.mock.calls[0][0] as FormData
    expect(fd.get('caixa_id')).toBeNull()
  })

  it('outra forma (PIX): nenhum seletor e nenhum caixa_id', async () => {
    listarCaixasMock.mockResolvedValue({ ok: true, caixas: [CAIXA_A, CAIXA_B] })
    await montar()
    preencherDevolucao() // forma padrão PIX
    expect(container.querySelector('#caixa-pagador')).toBeNull()
    expect(botaoConfirmar().disabled).toBe(false)
    await enviar()
    const fd = devolverMock.mock.calls[0][0] as FormData
    expect(fd.get('forma_estorno')).toBe('PIX')
    expect(fd.get('caixa_id')).toBeNull()
  })

  it('0 caixas abertos: avisa que o dinheiro não poderá ser devolvido', async () => {
    listarCaixasMock.mockResolvedValue({ ok: true, caixas: [] })
    await montar()
    setValor(container.querySelector('#forma-estorno') as HTMLSelectElement, 'DINHEIRO')
    expect(container.textContent).toContain('Não há caixa aberto')
  })
})
