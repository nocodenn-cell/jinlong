/** @vitest-environment jsdom */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { AuditoriaEvento } from '../actions'
import type { AuditoriaTimelineLabels } from './AuditoriaTimeline'

// KardexSheet tem sua própria busca de dados (obterKardexProduto) e não é o
// alvo deste teste — só a passagem do alvo certo (RM-10) importa aqui.
vi.mock('@/app/admin/estoque/_components/KardexSheet', () => ({
  KardexSheet: ({ alvo }: { alvo: { produtoId: string; produtoNome: string } | null }) =>
    alvo
      ? React.createElement('div', { 'data-testid': 'kardex-sheet' }, alvo.produtoNome)
      : null,
}))

const { AuditoriaTimeline } = await import('./AuditoriaTimeline')

// Item 16 do Plano Mestre: resumo/labels 100% vindos de `labels` (nenhuma
// string PT hardcoded no componente) — este teste usa um dicionário zh
// sintético para provar que a interpolação funciona e nada PT vaza.
const labelsZh: AuditoriaTimelineLabels = {
  locale: 'zh-CN',
  chipVenda: '销售',
  chipCancelamento: '取消',
  chipEstoque: '库存',
  chipAlerta: '警报',
  chipDesconto: '折扣',
  chipDevolucao: '退货/换货',
  chipPreco: '价格',
  detalheLabels: {
    forma_pagamento: '付款方式',
    itens: '商品数量',
    motivo: '原因',
    tipo_codigo: '移动类型',
    quantidade_delta: '数量',
    tipo: '警报类型',
    desconto_percentual: '折扣（%）',
    forma_estorno: '退款方式',
    preco_varejo_anterior: '零售价（修改前）',
    preco_atacado_novo: '档案批发价（修改后）',
  },
  vazioTitulo: '本期没有事件',
  vazioSub: '调整时间范围或事件类型以查看审计轨迹。',
  fecharAria: '关闭',
  valorLabel: '金额',
  semDetalhes: '没有更多详情。',
  resumoTemplates: {
    venda_1: '已登记销售 • {{n}} 件商品',
    venda_n: '已登记销售 • {{n}} 件商品',
    cancelada: '销售已取消',
    cancelada_motivo: '销售已取消 • {{motivo}}',
    ajuste_estoque: '{{tipo}} • {{delta}}',
    alerta: '{{tipo}}',
    desconto: '经理折扣 • {{pct}}%',
    troca: '换货 • {{forma}}',
    devolucao: '退货 • {{forma}}',
    preco_produto: '商品价格已修改',
  },
  ajusteLabels: { COMPRA: '采购入库' },
  alertaLabels: { margem_negativa: '负毛利' },
  formaLabels: { PIX: 'PIX' },
  verKardex: '查看库存卡',
  kardex: {
    titulo: '库存卡',
    semMovimentos: '没有记录的移动',
    semMovimentosSub: '该产品的进出将显示在这里。',
    verAuditoria: '在审计中查看',
    tipoMap: {},
  },
}

function evento(overrides: Partial<AuditoriaEvento>): AuditoriaEvento {
  return {
    id: 'e1',
    tipo: 'VENDA',
    ocorridoEm: '2026-09-04T12:00:00.000Z',
    operadorId: null,
    operadorNome: null,
    resumoCodigo: 'venda_n',
    resumoParams: { n: 3 },
    valor: 100,
    detalhe: {},
    ...overrides,
  }
}

describe('AuditoriaTimeline — i18n (item 16)', () => {
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

  it('interpola resumo de venda (plural) no idioma passado, sem PT hardcoded', () => {
    flushSync(() => {
      root.render(<AuditoriaTimeline eventos={[evento({})]} labels={labelsZh} />)
    })
    expect(container.textContent).toContain('已登记销售 • 3 件商品')
    expect(container.textContent).toContain('销售')
    expect(container.textContent).not.toContain('Venda registrada')
  })

  it('resolve resumo de ajuste de estoque combinando ajusteLabels + delta', () => {
    flushSync(() => {
      root.render(
        <AuditoriaTimeline
          eventos={[
            evento({
              tipo: 'AJUSTE_ESTOQUE',
              resumoCodigo: 'ajuste_estoque',
              resumoParams: { codigo: 'COMPRA', delta: '+5' },
              valor: null,
            }),
          ]}
          labels={labelsZh}
        />,
      )
    })
    expect(container.textContent).toContain('采购入库 • +5')
  })

  it('resolve resumo de alerta via alertaLabels', () => {
    flushSync(() => {
      root.render(
        <AuditoriaTimeline
          eventos={[
            evento({
              tipo: 'ALERTA',
              resumoCodigo: 'alerta',
              resumoParams: { tipo: 'margem_negativa' },
              valor: null,
            }),
          ]}
          labels={labelsZh}
        />,
      )
    })
    expect(container.textContent).toContain('负毛利')
  })

  it('estado vazio usa labels.vazioTitulo/vazioSub', () => {
    flushSync(() => {
      root.render(<AuditoriaTimeline eventos={[]} labels={labelsZh} />)
    })
    expect(container.textContent).toContain('本期没有事件')
    expect(container.textContent).toContain('调整时间范围或事件类型以查看审计轨迹。')
  })

  it('RM-10: abrir o detalhe de um ajuste de estoque com produto oferece "Ver Kardex", que abre o Kardex certo', () => {
    flushSync(() => {
      root.render(
        <AuditoriaTimeline
          eventos={[
            evento({
              id: 'e-ajuste',
              tipo: 'AJUSTE_ESTOQUE',
              resumoCodigo: 'ajuste_estoque',
              resumoParams: { codigo: 'COMPRA', delta: '+5' },
              valor: null,
              detalhe: { produto_id: 'produto-77', produto_nome: 'Cabo USB-C', tipo_codigo: 'COMPRA' },
            }),
          ]}
          labels={labelsZh}
        />,
      )
    })

    const linha = container.querySelector('li button') as HTMLButtonElement
    flushSync(() => linha.click())

    expect(container.querySelector('[data-testid="kardex-sheet"]')).toBeNull()
    const btnKardex = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cabo USB-C'),
    ) as HTMLButtonElement
    expect(btnKardex).toBeTruthy()
    flushSync(() => btnKardex.click())

    const sheet = container.querySelector('[data-testid="kardex-sheet"]')
    expect(sheet?.textContent).toBe('Cabo USB-C')
  })

  it('RM-10: evento sem produto associado não oferece "Ver Kardex"', () => {
    flushSync(() => {
      root.render(<AuditoriaTimeline eventos={[evento({})]} labels={labelsZh} />)
    })
    const linha = container.querySelector('li button') as HTMLButtonElement
    flushSync(() => linha.click())
    expect(container.textContent).not.toContain(labelsZh.verKardex)
  })

  it('evento de preço de produto: mostra valores em BRL, preço limpo como traço e NÃO oferece Kardex', () => {
    flushSync(() => {
      root.render(
        <AuditoriaTimeline
          eventos={[
            evento({
              id: 'e-preco',
              tipo: 'PRECO_PRODUTO',
              resumoCodigo: 'preco_produto',
              resumoParams: {},
              valor: null,
              detalhe: {
                produto_id: 'produto-77',
                produto_nome: 'Cabo USB-C',
                preco_varejo_anterior: 10,
                preco_atacado_novo: '—',
              },
            }),
          ]}
          labels={labelsZh}
        />,
      )
    })
    expect(container.textContent).toContain('商品价格已修改')
    expect(container.textContent).toContain('价格')

    const linha = container.querySelector('li button') as HTMLButtonElement
    flushSync(() => linha.click())

    expect(container.textContent).toContain('零售价（修改前）')
    expect(container.textContent).toMatch(/R\$\s?10,00/)
    expect(container.textContent).toContain('档案批发价（修改后）')
    expect(container.textContent).toContain('Cabo USB-C')
    // Evento de preço não é movimento de estoque: sem botão "Ver Kardex".
    expect(container.textContent).not.toContain(labelsZh.verKardex)
  })
})
