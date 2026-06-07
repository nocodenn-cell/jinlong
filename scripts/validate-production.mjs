#!/usr/bin/env node
/**
 * SSRA gate: Vercel platform deployment ID === runtime /api/health deploymentId.
 * Não compara Git, CI SHA, nem domínios legados.
 */
const PRODUCTION_HOST = (process.env.PRODUCTION_HOST ?? 'pdv-importados.vercel.app').replace(
  /^https?:\/\//,
  '',
).replace(/\/$/, '')

const VERCEL_TOKEN = process.env.VERCEL_TOKEN?.trim()
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID?.trim() || process.env.VERCEL_ORG_ID?.trim()
const MAX_ATTEMPTS = Number(process.env.VALIDATE_PRODUCTION_RETRIES ?? 12)
const RETRY_MS = Number(process.env.VALIDATE_PRODUCTION_RETRY_MS ?? 5000)

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function deploymentIdFromPayload(body) {
  if (!body || typeof body !== 'object') return null
  const id = body.id ?? body.uid
  return typeof id === 'string' && id.length > 0 ? id : null
}

async function fetchPlatformDeploymentId() {
  if (!VERCEL_TOKEN) {
    throw new Error('VERCEL_TOKEN é obrigatório para consultar a API da Vercel')
  }

  const host = encodeURIComponent(PRODUCTION_HOST)
  const teamQ = VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(VERCEL_TEAM_ID)}` : ''
  const url = `https://api.vercel.com/v13/deployments/${host}${teamQ}`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Vercel API GET /v13/deployments/${PRODUCTION_HOST} → HTTP ${res.status} ${text}`)
  }

  const body = await res.json()
  const id = deploymentIdFromPayload(body)
  if (!id) {
    throw new Error(`Resposta Vercel sem deployment id: ${JSON.stringify(body).slice(0, 500)}`)
  }
  return id
}

async function fetchRuntimeDeploymentId() {
  const url = `https://${PRODUCTION_HOST}/api/health`
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`GET ${url} → HTTP ${res.status}`)
  }
  const body = await res.json()
  const id = body?.deploymentId
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`Resposta /api/health inválida: ${JSON.stringify(body)}`)
  }
  if (id === 'local') {
    throw new Error('/api/health retornou deploymentId=local (não está em runtime Vercel)')
  }
  return id
}

async function waitForRuntimeMatch(platformId) {
  let lastErr
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    try {
      const runtimeId = await fetchRuntimeDeploymentId()
      if (runtimeId === platformId) return runtimeId
      throw new Error(`mismatch: platform=${platformId} runtime=${runtimeId}`)
    } catch (e) {
      lastErr = e
      if (i < MAX_ATTEMPTS) {
        console.warn(`[validate-production] tentativa ${i}/${MAX_ATTEMPTS}: ${e.message}`)
        await sleep(RETRY_MS)
      }
    }
  }
  throw lastErr
}

async function main() {
  console.log(`[validate-production] host=${PRODUCTION_HOST}`)

  const platformId = await fetchPlatformDeploymentId()
  console.log(`[validate-production] platform deploymentId=${platformId}`)

  const runtimeId = await waitForRuntimeMatch(platformId)
  console.log(`[validate-production] runtime deploymentId=${runtimeId}`)
  console.log('[validate-production] OK: SSRA — platform === runtime')
}

main().catch((e) => {
  console.error(`[validate-production] FAIL: ${e.message}`)
  process.exit(1)
})
