/** @vitest-environment jsdom */
/**
 * Ações de linha das vendas no Admin — e a reimpressão de cupom.
 *
 * O buraco que este arquivo tranca: o PDV reimprime (F12 e histórico de
 * caixa), mas `/admin/vendas` só oferecia *Detalhes* e *Cancelar*. Quem
 * administra a loja não conseguia reimprimir venda nenhuma. Existia um
 * `VendaActionsMenu` com o gesto certo (Ver · Imprimir · Cancelar) e ele era
 * **código morto** — nenhum importador — e seu "imprimir" era só um link para
 * `/gerente/vendas/{id}`, hoje rota de redirect: não imprimia nada.
 *
 * Agora a capacidade vive no `RowActionsMenu`, o mesmo gesto de Compras,
 * Contas a Pagar, Contas a Receber, Estoque, Funcionários e Fornecedores.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))

const obterDetalheSpy = vi.fn()
vi.mock('../actions', () => ({
  obterDetalheVenda: (...args: unknown[]) => obterDetalheSpy(...args),
}))

import { VendasTable, type VendaLinha } from './VendasTable'
import { getMessages } from '@/i18n/getMessages'

const m = getMessages('pt')

const labels = {
  colVenda: 'Venda', colHora: 'Hora', colItens: 'Itens', colPagamento: 'Pagamento',
  colTotal: 'Total', colStatus: 'Status', colVendedor: 'Vendedor',
  concluida: 'Concluída', cancelada: 'Cancelada',
  unidade: 'un', unidades: 'un', item: 'item', itensPl: 'itens',
  pagDinheiro: 'Dinheiro', pagPix: 'PIX', pagCredito: 'Crédito', pagDebito: 'Débito',
  pagCartao: 'Cartão', pagOutro: 'Outro',
  vazioTitulo: 'Sem vendas', vazioSub: '—',
  detalheTitulo: 'Detalhes', detalheErroTitulo: 'Erro', detalheErroSub: '—',
  detalheData: 'Data', detalheTipo: 'Tipo', detalheOperador: 'Operador', detalheNfe: 'NF-e',
  detalheBruto: 'Bruto', detalheDesconto: 'Desconto', detalheLiquido: 'Líquido',
  detalheItens: 'Itens', detalheNenhumItem: 'Nenhum item',
  cancelarAcao: 'Cancelar venda', devolverAcao: 'Devolver',
} as Parameters<typeof VendasTable>[0]['labels']

function venda(over: Partial<VendaLinha> = {}): VendaLinha {
  return {
    id: 'aa11bb22-0000-4000-8000-000000000001',
    data: '2026-09-12T10:00:00Z',
    total_liquido: 250,
    total_bruto: 250,
    forma_pagamento: 'PIX',
    status: 'CONCLUIDA',
    caixa_id: null,
    operador_id: null,
    qtd_itens_total: 2,
    qtd_itens_distintos: 1,
    primeiro_produto: 'Luminária LED',
    ...over,
  } as VendaLinha
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  obterDetalheSpy.mockReset()
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

function render(vendas: VendaLinha[]) {
  flushSync(() => {
    root.render(
      React.createElement(VendasTable, { vendas, labels, m, idioma: 'pt', locale: 'pt-BR' }),
    )
  })
}

function abrirMenu(): HTMLElement[] {
  const gatilho = container.querySelector<HTMLButtonElement>('button[aria-label*="Ações da venda"]')
  expect(gatilho, 'a linha precisa ter o gesto de três pontos').not.toBeNull()
  flushSync(() => gatilho!.click())
  return Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]'))
}

describe('ações de linha das vendas', () => {
  it('usa o gesto único de três pontos, não ícones soltos', () => {
    render([venda()])
    expect(container.querySelector('button[aria-label*="Ações da venda"]')).not.toBeNull()
    expect(container.querySelector('[role="menu"]')).toBeNull() // fechado por padrão
  })

  it('oferece detalhes, reimprimir cupom e cancelar numa venda concluída', () => {
    render([venda({ status: 'CONCLUIDA' })])
    const rotulos = abrirMenu().map((e) => e.textContent?.trim())
    expect(rotulos).toContain('Abrir detalhes')
    expect(rotulos).toContain('Reimprimir cupom')
    expect(rotulos).toContain('Cancelar venda')
  })

  it('venda cancelada continua reimprimível, mas não cancelável de novo', () => {
    render([venda({ status: 'CANCELADA' })])
    const rotulos = abrirMenu().map((e) => e.textContent?.trim())
    // Reimprimir precisa sobreviver ao cancelamento: o cupom da venda cancelada
    // é justamente o que o cliente leva junto com a devolução.
    expect(rotulos).toContain('Reimprimir cupom')
    expect(rotulos).not.toContain('Cancelar venda')
  })
})

describe('reimpressão de cupom', () => {
  it('abre o cupom e busca o detalhe daquela venda', async () => {
    obterDetalheSpy.mockResolvedValue(null)
    render([venda()])
    const reimprimir = abrirMenu().find((e) => e.textContent?.trim() === 'Reimprimir cupom')
    flushSync(() => reimprimir!.click())

    expect(document.querySelector('[data-testid="cupom-venda-modal"]')).not.toBeNull()
    expect(obterDetalheSpy).toHaveBeenCalledWith('aa11bb22-0000-4000-8000-000000000001')
  })
})
