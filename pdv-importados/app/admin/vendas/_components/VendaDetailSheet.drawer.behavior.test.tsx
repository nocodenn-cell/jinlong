/** @vitest-environment jsdom */
/**
 * Roadmap UX, Tarefa 5 — o detalhe da venda abre na gaveta do DragonModal: header fixo com
 * título e id, corpo rolável, ações no footer fixo, ESC fecha. Com um modal de ação aberto
 * por cima (cancelar/devolver), o ESC fecha só o modal, nunca a gaveta junto.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import type { VendaDetalhe } from '../actions'

const venda: VendaDetalhe = {
  id: 'abcdef12-3456-4000-8000-000000000000',
  data: '2026-09-30T03:24:27Z',
  total_bruto: 50,
  total_desconto: 0,
  total_liquido: 50,
  forma_pagamento: 'DINHEIRO',
  tipo_venda: 'COM_NF',
  status: 'CONCLUIDA',
  numero_nf: null,
  operador_nome: 'Ana',
  cliente_nome: null,
  tem_conta_receber: false,
  valor_aberto_cr: 0,
  pagamentos: [],
  desconto_gerente_valor: 0,
  desconto_gerente_percentual: 0,
  itens: [],
  showMargemVisual: false,
  showPrecoFonte: false,
  cancelamento: null,
}

vi.mock('../actions', () => ({ obterDetalheVenda: vi.fn(async () => venda) }))
vi.mock('@/app/caixa/actions', () => ({ obterNomeLojaAtual: vi.fn(async () => ({ ok: true, nome: 'Loja' })) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
// O modal real de cancelamento é um DragonModal; o stub mantém essa natureza.
vi.mock('@/app/gerente/vendas/VendaCancelarModal', async () => {
  const { DragonModal } = await import('@/components/ui/DragonModal')
  return {
    VendaCancelarModal: ({ onClose }: { onClose: () => void }) => (
      <DragonModal open onClose={onClose} title="Cancelar venda?">
        motivo
      </DragonModal>
    ),
  }
})
vi.mock('@/app/gerente/vendas/VendaDevolucaoModal', () => ({ VendaDevolucaoModal: () => null }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { VendaDetailSheet } = await import('./VendaDetailSheet')

const labels = {
  titulo: 'Detalhe da venda', erroTitulo: 'Erro', erroSub: '', data: 'Data', tipo: 'Tipo', operador: 'Operador',
  nfe: 'NF-e', cliente: 'Cliente', saldoAberto: 'Saldo', verFinanceiro: 'Financeiro', bruto: 'Bruto',
  desconto: 'Desconto', liquido: 'Líquido', itens: 'Itens', nenhumItem: 'Nenhum',
  devolver: 'Devolver / trocar itens', cancelar: 'Cancelar venda',
}

let container: HTMLDivElement
let root: Root
const onClose = vi.fn()

beforeEach(() => {
  onClose.mockClear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.style.overflow = ''
})

async function abrir() {
  await act(async () => {
    root.render(
      <VendaDetailSheet
        alvo={{ id: venda.id } as never}
        onClose={onClose}
        labels={labels}
        m={getMessages('pt')}
        locale="pt-BR"
      />,
    )
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

const gaveta = () => document.querySelector('[role="dialog"][data-placement="drawer"]') as HTMLElement
const esc = () =>
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  })

describe('VendaDetailSheet — gaveta (Tarefa 5)', () => {
  it('abre como gaveta, com título e id da venda no header fixo', async () => {
    await abrir()
    expect(gaveta()).not.toBeNull()
    const header = gaveta().querySelector('[data-dragon-header]') as HTMLElement
    expect(header.textContent).toContain('Detalhe da venda')
    expect(header.textContent).toContain(venda.id)
    expect(document.getElementById(gaveta().getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Detalhe da venda',
    )
  })

  it('as ações primárias ficam no footer fixo, fora do corpo rolável', async () => {
    await abrir()
    const footer = gaveta().querySelector('[data-dragon-footer]') as HTMLElement
    const corpo = gaveta().querySelector('[data-dragon-body]') as HTMLElement
    for (const rotulo of ['Devolver / trocar itens', 'Cancelar venda']) {
      const botao = Array.from(footer.querySelectorAll('button')).find((b) => b.textContent === rotulo)
      expect(botao, rotulo).toBeDefined()
      expect(corpo.contains(botao!)).toBe(false)
    }
    expect(footer.querySelector('[data-testid="venda-detalhe-imprimir-cupom"]')).not.toBeNull()
  })

  it('ESC fecha a gaveta', async () => {
    await abrir()
    esc()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('com o modal de cancelamento aberto, ESC fecha só o modal', async () => {
    await abrir()
    const cancelar = Array.from(gaveta().querySelectorAll('button')).find(
      (b) => b.textContent === 'Cancelar venda',
    )!
    act(() => cancelar.click())
    expect(document.body.textContent).toContain('Cancelar venda?')
    esc()
    expect(document.body.textContent).not.toContain('Cancelar venda?')
    expect(onClose).not.toHaveBeenCalled()
    esc()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
