import type {
  DashboardAtividadeTipo,
  DashboardAtividadeRecente,
  DashboardEstoqueCritico,
  DashboardResumoDTO,
  DashboardSerieHora,
} from '@/lib/gerente/dashboardResumoTypes'

/** Parser puro da resposta JSON da RPC — usado pela server action e pelos testes. */
export function parseDashboardResumo(raw: unknown): DashboardResumoDTO {
  const r = (raw ?? {}) as Record<string, unknown>
  if (typeof r.error === 'string') {
    throw new Error(r.error)
  }
  const num = (v: unknown) => Number(v ?? 0)
  return {
    tz: String(r.tz ?? 'America/Sao_Paulo'),
    hoje: String(r.hoje ?? ''),
    ontem: String(r.ontem ?? ''),
    inicio_semana_atual: r.inicio_semana_atual != null ? String(r.inicio_semana_atual) : null,
    inicio_semana_anterior: r.inicio_semana_anterior != null ? String(r.inicio_semana_anterior) : null,
    faturamento_hoje: num(r.faturamento_hoje),
    faturamento_ontem: num(r.faturamento_ontem),
    quantidade_vendas_hoje: num(r.quantidade_vendas_hoje),
    quantidade_vendas_ontem: num(r.quantidade_vendas_ontem),
    ticket_medio_hoje: num(r.ticket_medio_hoje),
    ticket_medio_ontem: num(r.ticket_medio_ontem),
    faturamento_semana_atual: num(r.faturamento_semana_atual),
    faturamento_semana_anterior: num(r.faturamento_semana_anterior),
    quantidade_vendas_semana_atual: num(r.quantidade_vendas_semana_atual),
    quantidade_vendas_semana_anterior: num(r.quantidade_vendas_semana_anterior),
    ticket_medio_semana_atual: num(r.ticket_medio_semana_atual),
    ticket_medio_semana_anterior: num(r.ticket_medio_semana_anterior),
    margem_estimada:
      r.margem_estimada === null || r.margem_estimada === undefined
        ? null
        : Number(r.margem_estimada),
    cobertura_custo: num(r.cobertura_custo),
    custo_confiavel: Boolean(r.custo_confiavel),
    produto_mais_vendido: typeof r.produto_mais_vendido === 'string' ? r.produto_mais_vendido : 'Nenhum hoje (0 un)',
    serie_horaria_hoje: parseSerieHoraria(r.serie_horaria_hoje),
    // Ausente até a migration 225 entrar → parseSerieHoraria devolve [] (forward-compat).
    serie_horaria_semana_anterior: parseSerieHoraria(r.serie_horaria_semana_anterior),
    estoque_critico: parseEstoqueCritico(r.estoque_critico),
    atividades_recentes: parseAtividades(r.atividades_recentes),
  }
}

export function parseSerieHoraria(raw: unknown): DashboardSerieHora[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      hora: Number(x.hora ?? 0),
      faturamento: Number(x.faturamento ?? 0),
      vendas: Number(x.vendas ?? 0),
    }))
}

export function parseEstoqueCritico(raw: unknown): DashboardEstoqueCritico[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      id: String(x.id ?? ''),
      nome: String(x.nome ?? ''),
      sku: x.sku === null || x.sku === undefined ? null : String(x.sku),
      quantidade_atual: Number(x.quantidade_atual ?? 0),
      estoque_minimo: Number(x.estoque_minimo ?? 0),
      deficit: Number(x.deficit ?? 0),
    }))
}

export function parseAtividades(raw: unknown): DashboardAtividadeRecente[] {
  if (!Array.isArray(raw)) return []
  const tiposPermitidos: DashboardAtividadeTipo[] = ['VENDA', 'ESTOQUE', 'CAIXA']
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => {
      const tipoRaw = String(x.tipo ?? '')
      const tipo = (tiposPermitidos as string[]).includes(tipoRaw)
        ? (tipoRaw as DashboardAtividadeTipo)
        : 'VENDA'

      const legacyDesc =
        typeof x.descricao === 'string' && x.descricao.length > 0 ? x.descricao : undefined

      const payloadRaw = x.payload
      const payload =
        payloadRaw !== null &&
        payloadRaw !== undefined &&
        typeof payloadRaw === 'object' &&
        !Array.isArray(payloadRaw)
          ? (payloadRaw as Record<string, unknown>)
          : undefined

      return {
        data_hora: String(x.data_hora ?? ''),
        tipo,
        payload,
        descricao: legacyDesc,
      }
    })
}
