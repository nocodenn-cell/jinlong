/** @vitest-environment jsdom */
/**
 * UX-IA-01 (i18n): as 4 views executivas em 中文 não podem exibir nenhum texto fixo em português.
 * O teste renderiza cada view em ZH com dados que exercitam tabelas, estados vazios, avisos de custo e
 * procura, no HTML, qualquer texto PT dos painéis (derivado do próprio dicionário).
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { describe, expect, it, vi } from 'vitest'
import type { RelatoriosDados, RelatoriosLabels } from '../RelatoriosContent'
import { EXEC_TEXTS, traduzir, type ExecTextKey } from '@/lib/i18n/useExecT'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))
vi.mock('../RelatoriosBarChart', () => ({
  RelatoriosBarChart: () => React.createElement('div', null, 'chart'),
}))
vi.mock('@/app/admin/dashboard/_components/PaymentDonutChart', () => ({
  PaymentDonutChart: () => React.createElement('div', null, 'donut'),
}))

const { ExecutiveDomainView } = await import('./ExecutiveDomainView')
const { AdminV2SessionProvider } = await import('@/components/ui/admin-v2/AdminV2SessionContext')

const LABELS = new Proxy({ locale: 'zh-CN' } as Record<string, unknown>, {
  // Rótulos do dicionário geral viram códigos neutros: aqui só interessa o texto dos painéis.
  get: (t, k) => (k in t ? t[k as string] : `#${[...String(k)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 99991, 7)}`),
}) as unknown as RelatoriosLabels

const venda = (id: string, status: string) => ({
  id,
  data: '2026-10-07T14:00:00Z',
  cliente_nome: 'Maria',
  vendedor_nome: 'Joao',
  total_liquido: 100,
  forma_pagamento: 'DINHEIRO',
  status,
})

const dados = {
  periodo: { de: '2026-10-01', ate: '2026-10-07', aviso: 'nenhum' },
  tzRelatorio: 'America/Sao_Paulo',
  resumoExecutivo: {
    itens_vendidos: 10,
    vendas_concluidas: 3,
    vendas_canceladas: 1,
    taxa_cancelamento: 0.25,
    cobertura_custo: 0.8,
    custo_confiavel: false,
    margem_bruta_estimada: null,
  },
  devolucoes: 20,
  receitaLiquida: 280,
  porDia: [{ dia: '2026-10-07', num_vendas: 2, total_liquido: 200, ticket_medio: 100, total_desconto: 0 }],
  top: [],
  baixo: [{ id: 'p1', nome: 'Item', codigo_barras: null, quantidade_atual: 0, estoque_minimo: 3, deficit: 3 }],
  margemPorVenda: [
    { venda_id: 'v-1', data: '2026-10-07T10:00:00Z', num_itens: 1, total_liquido: 100, total_desconto: 5, custo_total_estimado: null, margem_estimada: null, custo_confiavel: false },
  ],
  curvaAbc: [
    { produtoId: 'a1', nome: 'Garrafa A', totalQuantidade: 3, totalValor: 100, percentualValor: 40, percentualAcumulado: 40, classeAbc: 'A' },
  ],
  coberturaEstoque: [
    { produtoId: 'g1', nome: 'Garrafa', lojaId: 'l1', quantidadeAtual: 10, mediaDiariaVendida: 0.001, diasCobertura: 7470 },
  ],
  divergenciaEstoque: [],
  semGiro: [
    { produto_id: 's1', nome: 'Encalhado', quantidade_atual: 4, valor_imobilizado: 80, ultima_venda: null },
  ],
  vendasDetalhe: [venda('v1', 'CONCLUIDA'), venda('v2', 'CANCELADA')],
  vendasDetalheErro: null,
  rpcErro: null,
} as unknown as RelatoriosDados

const extras = {
  caixasResumo: { fechadosHoje: 1, comDiferenca: 1, fechadosIncompletos: 0 },
  caixasLinhas: [
    { id: 'c1', operadorNome: 'Joao', dataAbertura: '2026-10-07T08:00:00Z', dataFechamento: '2026-10-07T18:00:00Z', valorInicial: 0, valorSistema: 100, valorContado: 90, diferenca: -10, motivo: null, retomado: false },
  ],
  caixasErro: null,
  financeiro: {
    hoje: '2026-10-07',
    receber: [{ id: 'r1', nome: 'Fatura X', status: 'ABERTO', vencimento: '2026-10-01', valor_total: 50, valor_aberto: 50 }],
    pagar: [],
    fluxo: [{ dia: '2026-10-07', entradas: 10, saidas: 5, saldo: 5 }],
    resultado_gerencial: { receita_vendas: 300, custo_conhecido: 100, despesas_manuais: 10, taxas_conferidas: 5 },
  },
  financeiroErro: null,
} as never

function renderZh(view: Parameters<typeof ExecutiveDomainView>[0]['view'], d: RelatoriosDados = dados, ex = extras) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  flushSync(() =>
    root.render(
      <AdminV2SessionProvider idioma="zh">
        <ExecutiveDomainView view={view} dados={d} extras={ex} locale="zh-CN" labels={LABELS} />
      </AdminV2SessionProvider>,
    ),
  )
  const html = el.innerHTML
  const text = el.textContent ?? ''
  root.unmount()
  el.remove()
  return { html, text }
}

/** Trechos PT estáticos do dicionário (sem placeholders) que não podem aparecer em ZH. */
const TRECHOS_PT = (Object.keys(EXEC_TEXTS) as ExecTextKey[])
  .map((k) => ({ k, pt: EXEC_TEXTS[k][0] as string, zh: EXEC_TEXTS[k][1] as string }))
  .filter(({ pt, zh }) => pt !== zh && !/[{}]/.test(pt) && pt.length >= 4)

describe('i18n dos painéis executivos', () => {
  it('toda chave tem texto em chinês (exceto siglas idênticas) e os mesmos placeholders', () => {
    for (const [k, par] of Object.entries(EXEC_TEXTS) as [string, readonly [string, string]][]) {
      const [pt, zh] = par
      expect(zh.length, k).toBeGreaterThan(0)
      const ph = (s: string) => (s.match(/\{[a-zA-Z]+\}/g) ?? []).sort().join(',')
      expect(ph(zh), `placeholders de ${k}`).toBe(ph(pt))
      if (pt !== zh) expect(zh, k).toMatch(/[一-鿿]/)
    }
  })

  it('interpola parâmetros nos dois idiomas', () => {
    expect(traduzir('pt', 'vc.pico_vendas', { n: 3 })).toBe('(3 vendas)')
    expect(traduzir('zh', 'vc.pico_vendas', { n: 3 })).toBe('（3 笔销售）')
  })

  it.each(['vendas-caixas', 'dre-financeiro', 'produtos-estoque', 'crm-auditoria'] as const)(
    '%s em 中文 não contém textos fixos em português',
    (view) => {
      const { text } = renderZh(view)
      expect(text.length).toBeGreaterThan(20)
      const vazados = TRECHOS_PT.filter(({ pt }) => text.includes(pt)).map(({ k }) => k)
      expect(vazados).toEqual([])
    },
  )

  it('estados vazios e avisos de custo também saem em 中文', () => {
    const vazio = {
      ...dados,
      vendasDetalhe: [],
      curvaAbc: [],
      semGiro: [],
      baixo: [],
      coberturaEstoque: [],
      margemPorVenda: Array.from({ length: 200 }, (_, i) => ({
        venda_id: `v${i}`, data: '2026-10-07T10:00:00Z', num_itens: 1, total_liquido: 10, total_desconto: 0,
        custo_total_estimado: i === 0 ? null : 5, margem_estimada: i === 0 ? null : 5, custo_confiavel: i !== 0,
      })),
    } as unknown as RelatoriosDados
    for (const view of ['vendas-caixas', 'dre-financeiro', 'produtos-estoque', 'crm-auditoria'] as const) {
      const { text } = renderZh(view, vazio, { ...(extras as object), caixasLinhas: [] } as never)
      const vazados = TRECHOS_PT.filter(({ pt }) => text.includes(pt)).map(({ k }) => k)
      expect(vazados, view).toEqual([])
    }
    const dre = renderZh('dre-financeiro', vazio).text
    expect(dre).toContain('列表不完整')
    expect(dre).toMatch(/至/)
  })

  it('o título e as ações da página vêm do dicionário (PT intacto sem provider)', () => {
    expect(traduzir('pt', 'view.dre-financeiro')).toBe('DRE & Financeiro')
    expect(traduzir('zh', 'view.dre-financeiro')).toBe('损益与财务')
  })
})
