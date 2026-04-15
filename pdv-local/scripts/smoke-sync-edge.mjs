#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const cwd = process.cwd()
const envPath = path.join(cwd, '.env')

function parseEnv(content) {
  const out = new Map()
  for (const lineRaw of content.split(/\r?\n/)) {
    const line = lineRaw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    out.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim())
  }
  return out
}

if (!fs.existsSync(envPath)) {
  console.error(`[smoke-sync] Arquivo .env não encontrado em ${envPath}`)
  process.exit(1)
}

const env = parseEnv(fs.readFileSync(envPath, 'utf8'))
const endpoint = env.get('SYNC_ENDPOINT')
const syncKey = env.get('SYNC_KEY')
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

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SYNC-KEY': syncKey,
      'X-SYNC-TS': ts,
      'X-SYNC-NONCE': nonce,
      'X-SYNC-SIGNATURE': signature,
      'x-device-fingerprint': 'smoke-local',
    },
    body,
  })

  const text = await res.text()
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
