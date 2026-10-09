/** @vitest-environment jsdom */
/**
 * Paridade clássico × views, achada na conferência valor a valor (homologação local):
 * três informações que o relatório clássico mostrava e as views não.
 *  - Transações: coluna Cliente (venda a prazo precisa mostrar quem é o devedor).
 *  - Encalhe: Valor imobilizado (capital parado).
 *  - Cobertura: Média/dia vendida.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RelatoriosDados } from '../RelatoriosContent'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))

const { ExecutiveDomainView } = await import('./ExecutiveDomainView')

const dados = {
  periodo: { de: '2026-10-01', ate: '2026-10-09', aviso: 'nenhum' },
  tzRelatorio: 'America/Sao_Paulo',
  resumoExecutivo: {
    itens_vendidos: 3, vendas_concluidas: 2, vendas_canceladas: 0, taxa_cancelamento: 0,
    cobertura_custo: 1, custo_confiavel: true, margem_bruta_estimada: 10,
  },
  devolucoes: 0,
  receitaLiquida: 100,
  porDia: [],
  top: [],
  baixo: [],
  margemPorVenda: [],
  curvaAbc: [],
  coberturaEstoque: [
    { produtoId: 'p1', nome: 'Hashis', lojaId: 'l1', quantidadeAtual: 9993, mediaDiariaVendida: 0.23, diasCobertura: 999 },
  ],
  divergenciaEstoque: [],
  semGiro: [
    { produto_id: 'p2', nome: 'Chaleira', codigo_barras: null, quantidade_atual: 10000, estoque_minimo: 0, preco_custo: 31, valor_imobilizado: 310000, ultima_venda: null },
  ],
  vendasDetalhe: [
    { id: 'v1', data: '2026-10-08T23:39:00Z', cliente_nome: 'Maria Souza', vendedor_nome: 'Operador', total_liquido: 50, forma_pagamento: 'FIADO', status: 'CONCLUIDA' },
    { id: 'v2', data: '2026-10-08T23:40:00Z', cliente_nome: null, vendedor_nome: 'Operador', total_liquido: 50, forma_pagamento: 'PIX', status: 'CONCLUIDA' },
  ],
  vendasDetalheErro: null,
  rpcErro: null,
} as unknown as RelatoriosDados

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})
const render = (view: 'vendas-caixas' | 'produtos-estoque') =>
  flushSync(() => root.render(<ExecutiveDomainView view={view} dados={dados} locale="pt-BR" />))

describe('paridade clássico × views', () => {
  it('Transações mostra o cliente da venda (e "—" quando é venda anônima)', () => {
    render('vendas-caixas')
    const t = container.textContent ?? ''
    expect(t).toContain('Cliente')
    expect(t).toContain('Maria Souza')
    const linhas = Array.from(container.querySelectorAll('tbody tr')).map((r) => r.textContent ?? '')
    const anonima = linhas.find((l) => l.includes('PIX'))
    expect(anonima).toContain('—')
  })

  it('Encalhe mostra o valor imobilizado (capital parado)', () => {
    render('produtos-estoque')
    const t = container.textContent ?? ''
    expect(t).toContain('Valor imobilizado')
    expect(t).toMatch(/310\.000,00/)
  })

  it('Cobertura mostra a média diária vendida', () => {
    render('produtos-estoque')
    const t = container.textContent ?? ''
    expect(t).toContain('Média/dia')
    expect(t).toContain('0.23')
  })

})
