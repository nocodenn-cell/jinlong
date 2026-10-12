/**
 * Validação mínima do envelope de evento da outbox (v1), alinhada a
 * `backend/scripts/sync-outbox-contract-smoke.mjs` e ao schema
 * `backend/contracts/sync-outbox-event-v1.schema.json`.
 * Mantém a mesma lógica para testes no PDV local sem depender de Deno/CLI do backend.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const EVENT_TYPES = new Set([
  'VENDA_REGISTRADA',
  'CAIXA_ABERTO',
  'CAIXA_FECHADO',
  'MOVIMENTO_CAIXA',
])

export function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v.trim())
}

export function validateVendaPayload(payload: unknown): { ok: true } | { ok: false; error: string } {
  if (!isRecord(payload)) return { ok: false, error: 'payload.venda deve ser objeto' }
  if (!isUuid(payload.venda_id)) return { ok: false, error: 'venda_id inválido' }
  // registrar_venda_com_itens exige p_caixa_id (migration 20260814105031) — rejeitar
  // aqui, no envio, em vez de deixar o evento retry/DLQ até um operador notar.
  if (!isUuid(payload.caixa_id)) return { ok: false, error: 'caixa_id inválido' }
  if (!isUuid(payload.loja_id)) return { ok: false, error: 'loja_id inválido' }
  if (typeof payload.forma_pagamento !== 'string' || !payload.forma_pagamento.trim()) {
    return { ok: false, error: 'forma_pagamento inválida' }
  }
  for (const k of ['total_bruto', 'total_desconto', 'total_liquido'] as const) {
    if (typeof payload[k] !== 'number' || !Number.isFinite(payload[k])) {
      return { ok: false, error: `${k} inválido` }
    }
  }
  if (!Array.isArray(payload.itens) || payload.itens.length === 0) {
    return { ok: false, error: 'itens inválido' }
  }
  for (const item of payload.itens) {
    if (!isRecord(item)) return { ok: false, error: 'item inválido' }
    if (!isUuid(item.produto_id)) return { ok: false, error: 'item.produto_id inválido' }
    if (
      typeof item.quantidade !== 'number' ||
      !Number.isFinite(item.quantidade) ||
      item.quantidade <= 0
    ) {
      return { ok: false, error: 'item.quantidade inválido' }
    }
    for (const key of ['preco_original', 'preco_unitario'] as const) {
      if (typeof item[key] !== 'number' || !Number.isFinite(item[key])) {
        return { ok: false, error: `item.${key} inválido` }
      }
    }
  }
  return { ok: true }
}

export function validateCaixaAbertoPayload(
  payload: unknown,
): { ok: true } | { ok: false; error: string } {
  if (!isRecord(payload)) return { ok: false, error: 'payload.caixa_aberto deve ser objeto' }
  if (!isUuid(payload.id)) return { ok: false, error: 'id caixa inválido' }
  if (!isUuid(payload.loja_id)) return { ok: false, error: 'loja_id inválido' }
  if (typeof payload.valor_inicial !== 'number' || !Number.isFinite(payload.valor_inicial)) {
    return { ok: false, error: 'valor_inicial inválido' }
  }
  return { ok: true }
}

export function validateCaixaFechadoPayload(
  payload: unknown,
): { ok: true } | { ok: false; error: string } {
  if (!isRecord(payload)) return { ok: false, error: 'payload.caixa_fechado deve ser objeto' }
  if (!isUuid(payload.id)) return { ok: false, error: 'id caixa inválido' }
  if (typeof payload.data_fechamento !== 'string' || !payload.data_fechamento.trim()) {
    return { ok: false, error: 'data_fechamento inválida' }
  }
  if (typeof payload.valor_fechamento !== 'number' || !Number.isFinite(payload.valor_fechamento)) {
    return { ok: false, error: 'valor_fechamento inválido' }
  }
  if (payload.fechamento_observacao !== undefined && payload.fechamento_observacao !== null) {
    if (typeof payload.fechamento_observacao !== 'string') {
      return { ok: false, error: 'fechamento_observacao inválida' }
    }
    if (payload.fechamento_observacao.length > 500) {
      return { ok: false, error: 'fechamento_observacao muito longa (máx. 500)' }
    }
  }
  return { ok: true }
}

export function validateMovimentoPayload(
  payload: unknown,
): { ok: true } | { ok: false; error: string } {
  if (!isRecord(payload)) return { ok: false, error: 'payload.movimento deve ser objeto' }
  if (!isUuid(payload.id)) return { ok: false, error: 'id movimento inválido' }
  if (!isUuid(payload.caixa_id)) return { ok: false, error: 'caixa_id inválido' }
  if (payload.tipo !== 'SANGRIA' && payload.tipo !== 'SUPRIMENTO') {
    return { ok: false, error: 'tipo movimento inválido' }
  }
  if (typeof payload.valor !== 'number' || !Number.isFinite(payload.valor)) {
    return { ok: false, error: 'valor movimento inválido' }
  }
  return { ok: true }
}

export type NormalizedOutboxEvent = {
  id: string
  tipo: string
  created_at: string
  payload: Record<string, unknown>
}

export function validateNormalizedEvent(
  event: unknown,
): { ok: true } | { ok: false; error: string } {
  if (!isRecord(event)) return { ok: false, error: 'evento deve ser objeto' }
  if (!isUuid(event.id)) return { ok: false, error: 'id evento inválido' }
  if (typeof event.created_at !== 'string' || !event.created_at.trim()) {
    return { ok: false, error: 'created_at inválido' }
  }
  if (!EVENT_TYPES.has(String(event.tipo))) return { ok: false, error: 'tipo inválido' }
  if (!isRecord(event.payload)) return { ok: false, error: 'payload inválido' }

  const tipo = String(event.tipo)
  if (tipo === 'VENDA_REGISTRADA') return validateVendaPayload(event.payload)
  if (tipo === 'CAIXA_ABERTO') return validateCaixaAbertoPayload(event.payload)
  if (tipo === 'CAIXA_FECHADO') return validateCaixaFechadoPayload(event.payload)
  return validateMovimentoPayload(event.payload)
}

/** Parse de linha SQLite outbox (payload_json stringificado). */
export function normalizeOutboxRecord(record: {
  id: string
  tipo: string
  created_at: string
  payload_json: string
}): NormalizedOutboxEvent {
  return {
    id: record.id,
    tipo: record.tipo,
    created_at: record.created_at,
    payload: JSON.parse(record.payload_json) as Record<string, unknown>,
  }
}
