/** Payloads das rotas /api/gerente/* — tipos fora de `app/api` para `components/` não importarem rotas. */
export type FilaStatusPayload = {
  fiscal: { pendente: number; erro: number }
  aprovacoes: number
}

export type HealthPayload = {
  status: 'online' | 'degraded' | 'offline'
  latency: number
  fiscal_erro: number
  fiscal_fila: number
}
