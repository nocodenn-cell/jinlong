/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import type { VendaDetalhe } from '../actions'

const venda: VendaDetalhe = {
  id: 'abcdef12-3456-4000-8000-000000000000',
  data: '2026-09-29T15:00:00Z',
  total_bruto: 200,
  total_desconto: 30,
  total_liquido: 170,
  forma_pagamento: 'DINHEIRO',
  tipo_venda: null,
  status: 'CONCLUIDA',
  numero_nf: null,
  operador_nome: 'Ana',
  cliente_nome: 'Maria',
  tem_conta_receber: false,
  valor_aberto_cr: 0,
  pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: 170 }],
  desconto_gerente_valor: 20,
  desconto_gerente_percentual: 10,
  itens: [
    {
      id: 'i1',
      nome: 'Produto Teste',
      codigo_barras: null,
      quantidade: 2,
      quantidade_devolvida: 0,
      preco_unitario: 100,
      preco_unitario_original: 105,
      desconto_unitario: 5,
      subtotal: 200,
      tipo_preco: 'ATACADO',
      tipo_preco_fonte: null,
      custo_unitario_snap: null,
      regra_aplicada_id: null,
    },
  ],
  showMargemVisual: false,
  showPrecoFonte: false,
}

vi.mock('../actions', () => ({ obterDetalheVenda: vi.fn(async () => venda) }))
vi.mock('@/app/caixa/actions', () => ({
  obterNomeLojaAtual: vi.fn(async () => ({ ok: true, nome: 'Loja Centro' })),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/app/gerente/vendas/VendaCancelarModal', () => ({ VendaCancelarModal: () => null }))
vi.mock('@/app/gerente/vendas/VendaDevolucaoModal', () => ({ VendaDevolucaoModal: () => null }))

import { VendaDetailSheet } from './VendaDetailSheet'

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
})

const labels = {
  titulo: 'Venda',
  erroTitulo: 'Erro',
  erroSub: '',
  data: 'Data',
  tipo: 'Tipo',
  operador: 'Operador',
  nfe: 'NF-e',
  cliente: 'Cliente',
  saldoAberto: 'Saldo',
  verFinanceiro: 'Financeiro',
  bruto: 'Bruto',
  desconto: 'Desconto',
  liquido: 'Líquido',
  itens: 'Itens',
  nenhumItem: 'Nenhum',
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('VendaDetailSheet — 2ª via do cupom', () => {
  it('abre o cupom com dados da venda (loja, 2ª via, descontos) e ESC fecha só o cupom', async () => {
    const m = getMessages('pt')
    const onClose = vi.fn()
    await act(async () => {
      root.render(
        <VendaDetailSheet
          alvo={{ id: venda.id } as never}
          onClose={onClose}
          labels={labels}
          m={m}
          locale="pt-BR"
        />,
      )
    })
    await flush()

    const botao = container.querySelector('[data-testid="venda-detalhe-imprimir-cupom"]') as HTMLButtonElement
    expect(botao).not.toBeNull()
    expect(botao.textContent).toBe(m.caixa.historico_tool_imprimir_cupom)

    await act(async () => botao.click())
    await flush()

    const cupom = document.querySelector('[data-testid="caixa-recibo-modal"]')
    expect(cupom).not.toBeNull()
    const txt = cupom?.textContent ?? ''
    expect(txt).toContain('Loja Centro')
    expect(txt).toContain(m.caixa.recibo.segunda_via)
    expect(txt).toContain('Produto Teste')
    expect(txt).toContain(m.caixa.recibo.desconto_produtos)
    expect(txt).toContain(m.caixa.recibo.desconto_gerente)
    // sem as ações de fluxo do PDV
    expect(txt).not.toContain(m.caixa.btn_adicionar_nova_venda)

    // ESC fecha o cupom, mas NÃO o painel de detalhe
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.querySelector('[data-testid="caixa-recibo-modal"]')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()

    // sem comprovante aberto, ESC volta a fechar o painel
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
