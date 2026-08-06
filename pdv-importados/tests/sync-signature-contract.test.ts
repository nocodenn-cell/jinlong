import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import {
  buildSignaturePayload,
  buildSignedSyncHeaders,
  hmacSha256Hex,
  normalizeDeviceFingerprint,
  DEVICE_FINGERPRINT_MAX_LEN,
} from '../../shared/sync-signature.mjs'

// Guarda de contrato do protocolo HMAC do sync-outbox.
//
// A fonte única é o cliente Rust (pdv-local/src-tauri/src/db.rs). Este teste
// existe para impedir que os clientes de teste (smoke + e2e) voltem a divergir
// dele — foi exatamente essa divergência que produziu 401 mascarado como
// "UNAUTHORIZED" e levou o diagnóstico a culpar a SYNC_KEY por engano.
//
// Referências fixadas de propósito, para o teste quebrar se o contrato mudar
// só de um lado:
//   db.rs:918   format!("{ts}.{nonce}.{device_fingerprint}.{body}")
//   db.rs:932   Uuid::new_v4()
//   db.rs:1479  v.trim().to_lowercase() … take(200)
//   index.ts:80 `${ts}.${nonce}.${deviceFingerprint}.${body}`
//   index.ts:999 isUuid(nonce)

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('protocolo de assinatura do sync-outbox (espelho do cliente Rust)', () => {
  it('monta o payload como {ts}.{nonce}.{device}.{body} — igual ao db.rs:918', () => {
    expect(buildSignaturePayload('1700000000', 'n1', 'dev-a', '{"events":[]}')).toBe(
      '1700000000.n1.dev-a.{"events":[]}',
    )
  })

  it('inclui o device fingerprint no payload assinado', () => {
    const comDevice = buildSignaturePayload('1', 'n', 'dev-a', 'b')
    const semDevice = `1.n.b`
    expect(comDevice).not.toBe(semDevice)
    expect(comDevice).toContain('.dev-a.')
  })

  it('gera nonce em formato UUID — a Edge rejeita hex em isUuid() (index.ts:999)', () => {
    for (let i = 0; i < 20; i++) {
      const h = buildSignedSyncHeaders({ syncKey: 'k', body: '{}', deviceFingerprint: 'd' })
      expect(h['X-SYNC-NONCE']).toMatch(UUID_V4)
    }
  })

  it('normaliza o device com trim + lowercase + teto de 200 — igual ao db.rs:1479', () => {
    expect(normalizeDeviceFingerprint('  Smoke-LOCAL  ')).toBe('smoke-local')
    expect(normalizeDeviceFingerprint('A'.repeat(300))).toHaveLength(DEVICE_FINGERPRINT_MAX_LEN)
    expect(normalizeDeviceFingerprint(undefined)).toBe('')
  })

  it('assina o device já normalizado e envia esse mesmo valor no header', () => {
    const h = buildSignedSyncHeaders({
      syncKey: 'k',
      body: '{}',
      deviceFingerprint: '  Smoke-LOCAL  ',
    })
    expect(h['x-device-fingerprint']).toBe('smoke-local')
    const esperado = hmacSha256Hex(
      'k',
      buildSignaturePayload(h['X-SYNC-TS'], h['X-SYNC-NONCE'], 'smoke-local', '{}'),
    )
    expect(h['X-SYNC-SIGNATURE']).toBe(esperado)
  })

  it('reproduz a assinatura de referência do Rust para entradas fixas', () => {
    // Vetor determinístico: mesma fórmula HMAC-SHA256 hex sobre o mesmo payload.
    const ts = '1700000000'
    const nonce = '11111111-1111-4111-8111-111111111111'
    const device = 'desktop-user-host'
    const body = '{"events":[]}'
    const esperado = crypto
      .createHmac('sha256', 'segredo')
      .update(`${ts}.${nonce}.${device}.${body}`)
      .digest('hex')

    const h = buildSignedSyncHeaders({
      syncKey: 'segredo',
      body,
      deviceFingerprint: device,
      ts,
      nonce,
    })
    expect(h['X-SYNC-SIGNATURE']).toBe(esperado)
  })

  it('muda a assinatura quando nonce, device ou corpo mudam — espelha o teste Rust', () => {
    const base = { syncKey: 'k', ts: '1', body: '{"events":[]}' }
    const a = buildSignedSyncHeaders({ ...base, nonce: 'nonce-a', deviceFingerprint: 'dev-a' })
    const b = buildSignedSyncHeaders({ ...base, nonce: 'nonce-b', deviceFingerprint: 'dev-a' })
    const c = buildSignedSyncHeaders({ ...base, nonce: 'nonce-a', deviceFingerprint: 'dev-b' })
    const d = buildSignedSyncHeaders({
      ...base,
      nonce: 'nonce-a',
      deviceFingerprint: 'dev-a',
      body: '{"events":[1]}',
    })

    const assinaturas = new Set([
      a['X-SYNC-SIGNATURE'],
      b['X-SYNC-SIGNATURE'],
      c['X-SYNC-SIGNATURE'],
      d['X-SYNC-SIGNATURE'],
    ])
    expect(assinaturas.size).toBe(4)
  })

  it('emite todos os headers que a Edge exige (index.ts:974-978)', () => {
    const h = buildSignedSyncHeaders({ syncKey: 'k', body: '{}', deviceFingerprint: 'd' })
    for (const nome of [
      'X-SYNC-KEY',
      'X-SYNC-TS',
      'X-SYNC-NONCE',
      'X-SYNC-SIGNATURE',
      'x-device-fingerprint',
    ]) {
      expect(h[nome], `header ${nome} ausente`).toBeTruthy()
    }
  })
})
