// Assinatura HMAC das requisições para a Edge Function `sync-outbox`.
//
// ⚠️ SINGLE SOURCE OF TRUTH DO PROTOCOLO: `pdv-local/src-tauri/src/db.rs`.
// Este módulo é um ESPELHO em JavaScript, existente apenas para que os clientes
// de teste (smoke e e2e) falem exatamente o mesmo protocolo do cliente real.
// Se o contrato mudar, ele muda PRIMEIRO no Rust; aqui é reflexo, nunca origem.
//
// Correspondência linha a linha com o Rust:
//
//   db.rs:918   let message = format!("{ts}.{nonce}.{device_fingerprint}.{body}");
//               → buildSignaturePayload()
//   db.rs:932   let nonce = Uuid::new_v4().to_string();
//               → randomBytes/UUID em buildSignedSyncHeaders()
//   db.rs:1479  v.trim().to_lowercase() … take(200)
//               → normalizeDeviceFingerprint()
//
// E com o validador da Edge (`backend/supabase/functions/sync-outbox/index.ts`):
//
//   index.ts:80    return `${ts}.${nonce}.${deviceFingerprint}.${body}`
//   index.ts:978   (req.headers.get("x-device-fingerprint") ?? "").trim().toLowerCase()
//   index.ts:999   isUuid(nonce) — nonce PRECISA ser UUID, hex não passa
//
// Histórico: até 2026-08-06 o smoke e o e2e usavam nonce hex de 32 chars e
// omitiam o device fingerprint do payload assinado. A Edge rejeitava em
// `isUuid()` e `authErrorForClientResponse` mascarava o motivo real como
// "UNAUTHORIZED", o que levou o diagnóstico a apontar erroneamente para um
// mismatch de SYNC_KEY. Ver docs/AUDITORIA_SMOKE_SYNC_EDGE_20260806.md.

import crypto from 'node:crypto'

/** Limite de caracteres do fingerprint, espelhando `take(200)` do Rust. */
export const DEVICE_FINGERPRINT_MAX_LEN = 200

/**
 * Normaliza o device fingerprint. A Edge aplica `.trim().toLowerCase()` antes de
 * montar o payload, então o cliente precisa assinar exatamente o valor normalizado
 * — e enviar esse mesmo valor no header, senão a assinatura não fecha.
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeDeviceFingerprint(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .slice(0, DEVICE_FINGERPRINT_MAX_LEN)
}

/**
 * Payload canônico assinado: `{ts}.{nonce}.{device}.{body}`.
 * @param {string|number} ts segundos desde a época
 * @param {string} nonce UUID v4
 * @param {string} deviceFingerprint já normalizado
 * @param {string} body corpo HTTP exato, byte a byte
 * @returns {string}
 */
export function buildSignaturePayload(ts, nonce, deviceFingerprint, body) {
  return `${ts}.${nonce}.${deviceFingerprint}.${body}`
}

/**
 * HMAC-SHA256 hex do payload, com a `syncKey` como segredo.
 * @param {string} syncKey
 * @param {string} payload
 * @returns {string}
 */
export function hmacSha256Hex(syncKey, payload) {
  return crypto.createHmac('sha256', syncKey).update(payload).digest('hex')
}

/**
 * Monta os headers assinados de uma requisição ao `sync-outbox`, espelhando
 * `signed_headers_for_request` (db.rs:927).
 *
 * @param {object} params
 * @param {string} params.syncKey
 * @param {string} params.body corpo HTTP exato que será enviado
 * @param {string} params.deviceFingerprint
 * @param {string} [params.ts] override só para teste
 * @param {string} [params.nonce] override só para teste
 * @returns {Record<string, string>}
 */
export function buildSignedSyncHeaders({ syncKey, body, deviceFingerprint, ts, nonce }) {
  const device = normalizeDeviceFingerprint(deviceFingerprint)
  const tsFinal = ts ?? Math.floor(Date.now() / 1000).toString()
  // UUID v4 — a Edge rejeita qualquer outro formato em isUuid() (index.ts:999).
  const nonceFinal = nonce ?? crypto.randomUUID()
  const signature = hmacSha256Hex(
    syncKey,
    buildSignaturePayload(tsFinal, nonceFinal, device, body),
  )

  return {
    'Content-Type': 'application/json',
    'X-SYNC-KEY': syncKey,
    'X-SYNC-TS': tsFinal,
    'X-SYNC-NONCE': nonceFinal,
    'X-SYNC-SIGNATURE': signature,
    'x-device-fingerprint': device,
  }
}
