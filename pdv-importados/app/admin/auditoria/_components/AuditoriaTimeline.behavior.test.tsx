/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { AuditoriaTimeline, type AuditoriaTimelineLabels } from './AuditoriaTimeline'
import type { AuditoriaEvento } from '../actions'

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
  detalheLabels: {
    forma_pagamento: '付款方式',
    itens: '商品数量',
    motivo: '原因',
    tipo_codigo: '移动类型',
    quantidade_delta: '数量',
    tipo: '警报类型',
    desconto_percentual: '折扣（%）',
    forma_estorno: '退款方式',
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
  },
  ajusteLabels: { COMPRA: '采购入库' },
  alertaLabels: { margem_negativa: '负毛利' },
  formaLabels: { PIX: 'PIX' },
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
})
