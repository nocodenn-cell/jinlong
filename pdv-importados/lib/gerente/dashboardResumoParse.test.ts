import { describe, expect, it } from 'vitest'
import { parseDashboardResumo, parseAtividades } from '@/lib/gerente/dashboardResumoParse'

describe('dashboardResumoParse', () => {
  it('parseDashboardResumo normaliza RPC completa (080+)', () => {
    const dto = parseDashboardResumo({
      tz: 'America/Sao_Paulo',
      hoje: '2026-05-10',
      ontem: '2026-05-09',
      inicio_semana_atual: '2026-05-05',
      inicio_semana_anterior: '2026-04-28',
      faturamento_hoje: 100,
      faturamento_ontem: 50,
      quantidade_vendas_hoje: 2,
      quantidade_vendas_ontem: 1,
      ticket_medio_hoje: 50,
      ticket_medio_ontem: 50,
      faturamento_semana_atual: 400,
      faturamento_semana_anterior: 300,
      quantidade_vendas_semana_atual: 10,
      quantidade_vendas_semana_anterior: 8,
      ticket_medio_semana_atual: 40,
      ticket_medio_semana_anterior: 37.5,
      margem_estimada: 80,
      cobertura_custo: 1,
      custo_confiavel: true,
      serie_horaria_hoje: [{ hora: 10, faturamento: 20, vendas: 1 }],
      estoque_critico: [
        {
          id: 'p1',
          nome: 'Produto',
          sku: 'SKU',
          quantidade_atual: 1,
          estoque_minimo: 5,
          deficit: 4,
        },
      ],
      atividades_recentes: [
        {
          data_hora: '2026-05-10T12:00:00Z',
          tipo: 'VENDA',
          payload: { total_liquido: 42.5 },
        },
      ],
    })

    expect(dto.faturamento_semana_atual).toBe(400)
    expect(dto.inicio_semana_atual).toBe('2026-05-05')
    expect(dto.atividades_recentes[0]?.tipo).toBe('VENDA')
    expect(dto.atividades_recentes[0]?.payload?.total_liquido).toBe(42.5)
    expect(dto.serie_horaria_hoje[0]?.hora).toBe(10)
    // #20 forward-compat: chave ausente (pré-migration 225) → [] em vez de quebrar.
    expect(dto.serie_horaria_semana_anterior).toEqual([])
  })

  it('#20 parseia serie_horaria_semana_anterior quando presente (pós-migration 225)', () => {
    const dto = parseDashboardResumo({
      serie_horaria_semana_anterior: [
        { hora: 14, faturamento: 1480, vendas: 9 },
        { hora: 15, faturamento: 0, vendas: 0 },
      ],
    })
    expect(dto.serie_horaria_semana_anterior).toHaveLength(2)
    expect(dto.serie_horaria_semana_anterior[0]?.faturamento).toBe(1480)
  })

  it('parseAtividades aceita payload estruturado e legado descricao', () => {
    const parsed = parseAtividades([
      {
        data_hora: '2026-01-01',
        tipo: 'CAIXA',
        payload: { tipo_movimento: 'suprimento', valor: 10, motivo: 'troco' },
      },
      { data_hora: '2026-01-02', tipo: 'VENDA', descricao: 'texto legado' },
    ])
    expect(parsed[0]?.payload?.tipo_movimento).toBe('suprimento')
    expect(parsed[1]?.descricao).toBe('texto legado')
  })
})
