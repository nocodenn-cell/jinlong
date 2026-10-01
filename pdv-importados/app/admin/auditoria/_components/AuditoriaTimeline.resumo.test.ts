import { describe, expect, it } from 'vitest'
import { resumoTexto } from './AuditoriaTimeline'

const labels = {
  resumoTemplates: { ajuste_estoque: '{{tipo}} • {{delta}}' },
  ajusteLabels: { SAIDA_VENDA: 'Saída por venda' },
  alertaLabels: {},
  formaLabels: {},
} as never

const base = {
  id: 'e1',
  tipo: 'AJUSTE_ESTOQUE',
  ocorridoEm: '2026-09-30T12:00:00Z',
  operadorId: null,
  operadorNome: null,
  resumoCodigo: 'ajuste_estoque',
  resumoParams: { codigo: 'SAIDA_VENDA', delta: '-1' },
  valor: null,
} as const

describe('resumoTexto — ajuste de estoque (UX-021 / P-30)', () => {
  it('inclui o nome do produto quando conhecido', () => {
    const t = resumoTexto({ ...base, detalhe: { produto_nome: 'Caneca', tipo_codigo: 'SAIDA_VENDA' } } as never, labels)
    expect(t).toBe('Caneca — Saída por venda • -1')
  })

  it('sem nome do produto, mantém o texto de antes', () => {
    const t = resumoTexto({ ...base, detalhe: {} } as never, labels)
    expect(t).toBe('Saída por venda • -1')
  })

  it('código de movimento desconhecido vira texto legível (não o código cru)', () => {
    const t = resumoTexto(
      { ...base, resumoParams: { codigo: 'ENTRADA_REMESSA_LOJA', delta: '+5' }, detalhe: {} } as never,
      labels,
    )
    expect(t).toBe('Entrada remessa loja • +5')
  })
})
