/** Tipos do feed de atividades — fora da rota para que `lib/`/`components/` não importem `app/api`. */
export type AtividadeRailTipo = 'VENDA' | 'FISCAL_OK' | 'FISCAL_ERRO' | 'CAIXA'
export type AtividadeRailSeverity = 'info' | 'warning' | 'error'

export type AtividadeRailItem = {
  id: string
  tipo: AtividadeRailTipo
  titulo: string
  ts: string
  severity: AtividadeRailSeverity
}

export type AtividadeFeedPayload = {
  items: AtividadeRailItem[]
  generatedAt: string
}
