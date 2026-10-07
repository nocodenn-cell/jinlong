/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RelatoriosDados } from '../RelatoriosContent'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))

const { ExecutiveDomainView } = await import('./ExecutiveDomainView')

const baseDados: RelatoriosDados = {
  periodo: {
    de: '2026-10-01',
    ate: '2026-10-07',
    aviso: 'nenhum',
  },
  tzRelatorio: 'America/Sao_Paulo',
  resumoExecutivo: {
    itens_vendidos: 10,
    vendas_concluidas: 3,
    vendas_canceladas: 1,
    taxa_cancelamento: 0.25,
    cobertura_custo: 1,
    custo_confiavel: true,
    margem_bruta_estimada: 100,
  },
  devolucoes: 0,
  receitaLiquida: 300,
  porDia: [{ dia: '2026-10-07', num_vendas: 3, total_liquido: 300, ticket_medio: 100, total_desconto: 0 }],
  top: [],
  baixo: [],
  margemPorVenda: [],
  curvaAbc: [],
  coberturaEstoque: [],
  divergenciaEstoque: [],
  semGiro: [],
  vendasDetalhe: [],
  vendasDetalheErro: null,
  rpcErro: null,
}

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

describe('ExecutiveDomainView', () => {
  it('monta painel Vendas & Caixas', () => {
    flushSync(() => {
      root.render(
        React.createElement(ExecutiveDomainView, {
          view: 'vendas-caixas',
          dados: baseDados,
          locale: 'pt-BR',
        }),
      )
    })
    expect(container.querySelector('[data-testid="exec-vendas-caixas"]')).not.toBeNull()
  })

  it('monta painel Produtos & Estoque', () => {
    flushSync(() => {
      root.render(
        React.createElement(ExecutiveDomainView, {
          view: 'produtos-estoque',
          dados: baseDados,
          locale: 'pt-BR',
        }),
      )
    })
    expect(container.querySelector('[data-testid="exec-produtos-estoque"]')).not.toBeNull()
  })

  it('monta painel DRE & Financeiro', () => {
    flushSync(() => {
      root.render(
        React.createElement(ExecutiveDomainView, {
          view: 'dre-financeiro',
          dados: baseDados,
          locale: 'pt-BR',
        }),
      )
    })
    expect(container.querySelector('[data-testid="exec-dre-financeiro"]')).not.toBeNull()
  })

  it('monta painel CRM & Auditoria', () => {
    flushSync(() => {
      root.render(
        React.createElement(ExecutiveDomainView, {
          view: 'crm-auditoria',
          dados: baseDados,
          locale: 'pt-BR',
        }),
      )
    })
    expect(container.querySelector('[data-testid="exec-crm-auditoria"]')).not.toBeNull()
  })
})
