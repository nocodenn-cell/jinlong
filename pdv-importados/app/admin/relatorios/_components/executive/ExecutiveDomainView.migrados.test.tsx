/** @vitest-environment jsdom */
/**
 * UX-IA-01 (D1/D2): conteúdo que só existia nas abas clássicas de Relatórios agora também
 * aparece nas views executivas. Estes testes travam DONDE cada seção mora e que o
 * clássico não perdeu nada (as mesmas funções renderizam nos dois lugares).
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RelatoriosDados, RelatoriosLabels } from '../RelatoriosContent'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))
// Gráficos dependem de layout real (recharts); aqui só importa que o cartão foi montado.
vi.mock('../RelatoriosBarChart', () => ({
  RelatoriosBarChart: ({ data }: { data: unknown[] }) =>
    React.createElement('div', { 'data-testid': 'stub-barras' }, `barras:${data.length}`),
}))
vi.mock('@/app/admin/dashboard/_components/PaymentDonutChart', () => ({
  PaymentDonutChart: ({ slices }: { slices: Array<{ label: string; value: number }> }) =>
    React.createElement('div', { 'data-testid': 'stub-donut' }, slices.map((s) => `${s.label}=${s.value}`).join(',')),
}))

const { ExecutiveDomainView } = await import('./ExecutiveDomainView')

// Cada rótulo devolve o próprio nome: o teste valida estrutura, não tradução (essa é do dicionário).
const LABELS = new Proxy({ locale: 'pt-BR' } as Record<string, unknown>, {
  get: (t, k) => (k in t ? t[k as string] : String(k)),
}) as unknown as RelatoriosLabels

const dados: RelatoriosDados = {
  periodo: { de: '2026-10-01', ate: '2026-10-07', aviso: 'nenhum' },
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
  porDia: [
    { dia: '2026-10-07', num_vendas: 2, total_liquido: 200, ticket_medio: 100, total_desconto: 0 },
    { dia: '2026-10-06', num_vendas: 1, total_liquido: 100, ticket_medio: 100, total_desconto: 0 },
  ],
  top: [{ id: 'p-1', nome: 'Garrafa Térmica', origem: 'China', total_valor: 500 }] as unknown as RelatoriosDados['top'],
  baixo: [],
  margemPorVenda: [
    { venda_id: 'v-1', data: '2026-10-07T10:00:00Z', total_liquido: 100, custo_total_estimado: 60, margem_estimada: 40, custo_confiavel: true },
  ] as unknown as RelatoriosDados['margemPorVenda'],
  curvaAbc: [],
  coberturaEstoque: [],
  divergenciaEstoque: [
    { produtoId: 'p-9', lojaId: 'l-1', nome: 'Caneca', saldoEstoque: 10, somaMovimentos: 7, divergencia: 3 },
  ] as unknown as RelatoriosDados['divergenciaEstoque'],
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

function render(view: Parameters<typeof ExecutiveDomainView>[0]['view'], withLabels = true, onAbrirKardex = vi.fn()) {
  flushSync(() => {
    root.render(
      <ExecutiveDomainView
        view={view}
        dados={dados}
        locale="pt-BR"
        labels={withLabels ? LABELS : undefined}
        onAbrirKardex={onAbrirKardex}
      />,
    )
  })
  return onAbrirKardex
}
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`)

describe('Vendas & Caixas — migrado do clássico (R2, R6, R7)', () => {
  it('mostra ticket médio, faturamento por dia e status das vendas', () => {
    render('vendas-caixas')
    const extra = q('exec-extra-vendas')
    expect(extra).not.toBeNull()
    // 300 de faturamento / 3 vendas concluídas = R$ 100,00
    expect(extra!.textContent).toMatch(/100,00/)
    expect(extra!.textContent).toContain('kpiTicket')
    expect(q('stub-barras')?.textContent).toBe('barras:2')
    expect(q('stub-donut')?.textContent).toBe('labelConcluidas=3,labelCanceladas=1')
  })

  it('sem vendas concluídas o ticket médio é "—" (não divide por zero)', () => {
    flushSync(() => {
      root.render(
        <ExecutiveDomainView
          view="vendas-caixas"
          dados={{ ...dados, resumoExecutivo: { ...dados.resumoExecutivo, vendas_concluidas: 0 }, porDia: [] }}
          locale="pt-BR"
          labels={LABELS}
        />,
      )
    })
    expect(q('exec-extra-vendas')!.textContent).toContain('—')
  })
})

describe('Produtos & Estoque — migrado do clássico (R8, R11)', () => {
  it('mostra "mais vendidos" com link para o produto', () => {
    render('produtos-estoque')
    const extra = q('exec-extra-produtos')!
    expect(extra.textContent).toContain('secTopProdutos')
    expect(extra.textContent).toContain('Garrafa Térmica')
    expect(extra.querySelector('a')?.getAttribute('href')).toBe('/admin/catalogo/p-1/completo')
  })

  it('mostra a divergência de estoque e abre o Kardex do produto ao clicar', () => {
    const onAbrirKardex = render('produtos-estoque')
    const extra = q('exec-extra-produtos')!
    expect(extra.textContent).toContain('secDivergenciaEstoque')
    expect(extra.textContent).toContain('Caneca')
    expect(extra.textContent).toContain('+3')
    const botao = Array.from(extra.querySelectorAll('button')).find((b) => b.textContent?.includes('Caneca'))!
    flushSync(() => botao.click())
    expect(onAbrirKardex).toHaveBeenCalledWith({ produtoId: 'p-9', produtoNome: 'Caneca' })
  })

  it('divergência vazia (todos zerados) mostra o estado vazio, não uma lista falsa', () => {
    flushSync(() => {
      root.render(
        <ExecutiveDomainView
          view="produtos-estoque"
          dados={{ ...dados, divergenciaEstoque: [{ ...(dados.divergenciaEstoque[0] as object), divergencia: 0 }] as RelatoriosDados['divergenciaEstoque'] }}
          locale="pt-BR"
          labels={LABELS}
        />,
      )
    })
    expect(q('exec-extra-produtos')!.textContent).toContain('vazioDivergenciaEstoque')
  })
})

describe('DRE & Financeiro — migrado do clássico (R14)', () => {
  it('mostra a margem por venda com link para a venda', () => {
    render('dre-financeiro')
    const extra = q('exec-extra-dre')!
    expect(extra.textContent).toContain('secMargemPorVenda')
    expect(extra.querySelector('a')?.getAttribute('href')).toBe('/admin/vendas?venda=v-1')
    expect(extra.textContent).toMatch(/60,00/)
    expect(extra.textContent).toMatch(/40,00/)
  })
})

describe('isolamento das seções migradas', () => {
  it('cada seção aparece só na sua view', () => {
    render('vendas-caixas')
    expect(q('exec-extra-produtos')).toBeNull()
    expect(q('exec-extra-dre')).toBeNull()
    render('produtos-estoque')
    expect(q('exec-extra-vendas')).toBeNull()
    expect(q('exec-extra-dre')).toBeNull()
    render('dre-financeiro')
    expect(q('exec-extra-vendas')).toBeNull()
    expect(q('exec-extra-produtos')).toBeNull()
  })

  it('sem rótulos (uso antigo/testes) nenhuma seção extra é montada — painel base intacto', () => {
    for (const v of ['vendas-caixas', 'produtos-estoque', 'dre-financeiro'] as const) {
      render(v, false)
      expect(q('exec-extra-vendas')).toBeNull()
      expect(q('exec-extra-produtos')).toBeNull()
      expect(q('exec-extra-dre')).toBeNull()
    }
    render('vendas-caixas', false)
    expect(q('exec-vendas-caixas')).not.toBeNull()
  })
})
