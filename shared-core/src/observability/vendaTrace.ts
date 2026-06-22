/**
 * Correlação de trace_id por venda — fonte canônica de rastreio entre plataformas.
 *
 * Cada venda tem dois identificadores de rastreio:
 *   trace_id  — gerado no CLIENTE no momento "venda_iniciada", antes do RPC.
 *               Permite correlacionar erros que ocorrem ANTES da persistência.
 *   venda_id  — UUID retornado pelo RPC após persistência bem-sucedida.
 *               É a chave de negócio no banco de dados.
 *
 * Propagação por plataforma:
 *   Web:     trace_id → Sentry scope → RPC → venda_id → Sentry scope (atualizado)
 *   Desktop: trace_id = outbox_event.id → Sentry scope → Edge → RPC → venda_id
 *   Edge:    lê trace_id do outbox event ou venda_id do payload → Sentry tag
 */

/** Gera trace_id para correlação de venda. Disponível em browser, Node.js e Deno. */
export function generateVendaTraceId(): string {
  return crypto.randomUUID()
}

/** Contexto de rastreio completo para um evento de venda. */
export type VendaTraceContext = {
  trace_id: string
  venda_id?: string
  caixa_id?: string
  operador_id?: string
  loja_id?: string
  total_liquido?: number
  itens_count?: number
  plataforma: 'web' | 'desktop' | 'edge'
}

/** Eventos de negócio do fluxo de venda — aparecem como breadcrumbs no Sentry. */
export const VENDA_EVENTS = {
  VENDA_INICIADA: 'venda_iniciada',
  ITEM_ADICIONADO: 'item_adicionado',
  ITEM_REMOVIDO: 'item_removido',
  DESCONTO_APLICADO: 'desconto_aplicado',
  DESCONTO_GERENTE_SOLICITADO: 'desconto_gerente_solicitado',
  DESCONTO_GERENTE_APROVADO: 'desconto_gerente_aprovado',
  PAGAMENTO_PROCESSADO: 'pagamento_processado',
  VENDA_ENVIADA_SYNC: 'venda_enviada_sync',
  VENDA_CONFIRMADA_RPC: 'venda_confirmada_rpc',
  VENDA_CANCELADA: 'venda_cancelada',
  ERRO_SYNC_OUTBOX: 'erro_sync_outbox',
  ERRO_RPC_VENDA: 'erro_rpc_venda',
  ERRO_VALIDACAO: 'erro_validacao',
  DUPLICIDADE_DETECTADA: 'duplicidade_detectada',
  DLQ_ATINGIDO: 'dlq_atingido',
} as const

export type VendaEvent = (typeof VENDA_EVENTS)[keyof typeof VENDA_EVENTS]

/** Payload de um breadcrumb de negócio. */
export type VendaBreadcrumb = {
  event: VendaEvent
  trace_id: string
  message?: string
  data?: Record<string, string | number | boolean | null>
  level?: 'info' | 'warning' | 'error'
}
