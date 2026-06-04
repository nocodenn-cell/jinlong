export type DashboardSerieHora = {
  hora: number
  faturamento: number
  vendas: number
}

export type DashboardEstoqueCritico = {
  id: string
  nome: string
  sku: string | null
  quantidade_atual: number
  estoque_minimo: number
  deficit: number
}

export type DashboardAtividadeTipo = 'VENDA' | 'ESTOQUE' | 'CAIXA'

export type DashboardAtividadeRecente = {
  data_hora: string
  tipo: DashboardAtividadeTipo
  /** Payload estruturado da RPC (migration 080+). */
  payload?: Record<string, unknown>
  /** Texto pré-formatado da RPC legada (migration 079 e anteriores). */
  descricao?: string
}

export type DashboardResumoDTO = {
  tz: string
  hoje: string
  ontem: string
  inicio_semana_atual: string | null
  inicio_semana_anterior: string | null
  faturamento_hoje: number
  faturamento_ontem: number
  quantidade_vendas_hoje: number
  quantidade_vendas_ontem: number
  ticket_medio_hoje: number
  ticket_medio_ontem: number
  faturamento_semana_atual: number
  faturamento_semana_anterior: number
  quantidade_vendas_semana_atual: number
  quantidade_vendas_semana_anterior: number
  ticket_medio_semana_atual: number
  ticket_medio_semana_anterior: number
  margem_estimada: number | null
  cobertura_custo: number
  custo_confiavel: boolean
  produto_mais_vendido: string
  serie_horaria_hoje: DashboardSerieHora[]
  /** Mesma série horária do MESMO dia da semana, 7 dias atrás (curva fantasma #20). */
  serie_horaria_semana_anterior: DashboardSerieHora[]
  estoque_critico: DashboardEstoqueCritico[]
  atividades_recentes: DashboardAtividadeRecente[]
}
