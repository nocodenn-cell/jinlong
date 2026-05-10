#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { parseEnv } from '../../shared/env-check-lib.mjs'

const cwd = process.cwd()
const envPath = path.join(cwd, '.env')

if (!fs.existsSync(envPath)) {
  console.error(`[smoke-sync] Arquivo .env não encontrado em ${envPath}`)
  process.exit(1)
}

const env = parseEnv(fs.readFileSync(envPath, 'utf8'))
const endpoint = env.get('SYNC_ENDPOINT')
const syncKey = env.get('SYNC_KEY')
const anonKey = env.get('SUPABASE_ANON_KEY')
if (!endpoint || !syncKey) {
  console.error('[smoke-sync] SYNC_ENDPOINT e SYNC_KEY são obrigatórios no .env.')
  process.exit(1)
}

async function executarSmoke() {
  const body = JSON.stringify({ events: [] })
  const ts = Math.floor(Date.now() / 1000).toString()
  const nonce = crypto.randomBytes(16).toString('hex')
  const payload = `${ts}.${nonce}.${body}`
  const signature = crypto.createHmac('sha256', syncKey).update(payload).digest('hex')

  const baseHeaders = {
    'Content-Type': 'application/json',
    'X-SYNC-KEY': syncKey,
    'X-SYNC-TS': ts,
    'X-SYNC-NONCE': nonce,
    'X-SYNC-SIGNATURE': signature,
    'x-device-fingerprint': 'smoke-local',
  }

  let res = await fetch(endpoint, {
    method: 'POST',
    headers: baseHeaders,
    body,
  })
  let text = await res.text()

  // Alguns gateways/proxies de Functions exigem Authorization + apikey.
  if (
    res.status === 401 &&
    anonKey &&
    /authorization/i.test(text)
  ) {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...baseHeaders,
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body,
    })
    text = await res.text()
  }

  let parsed = null
  let jsonInvalido = false
  try {
    parsed = JSON.parse(text)
  } catch {
    console.error('[smoke-sync] Resposta não é JSON:', text)
    jsonInvalido = true
  }

  if (jsonInvalido) {
    process.exitCode = 1
    return
  }
  if (!res.ok || parsed?.ok !== true) {
    if (
      res.status === 401 &&
      !anonKey &&
      String(parsed?.message ?? '').toLowerCase().includes('authorization')
    ) {
      console.error(
        '[smoke-sync] Endpoint exige Authorization/apikey. Defina SUPABASE_ANON_KEY no pdv-local/.env para validar esse cenário.',
      )
    }
    console.error('[smoke-sync] Falhou:', {
      status: res.status,
      body: parsed,
    })
    process.exitCode = 1
    return
  }
  console.log('[smoke-sync] OK', {
    status: res.status,
    request_id: parsed.request_id ?? null,
    processed: Array.isArray(parsed.processed) ? parsed.processed.length : null,
    failed: Array.isArray(parsed.failed) ? parsed.failed.length : null,
  })
}

executarSmoke().catch((err) => {
  console.error('[smoke-sync] Erro inesperado:', err)
  process.exitCode = 1
})
