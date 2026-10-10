/**
 * Guard de alvo para capacidade / homologação (STG-01) — SSoT CommonJS.
 *
 * Regras:
 * 1. Identificação POSITIVA do staging (ref allowlist obrigatória quando remoto).
 * 2. Denylist explícita de produção (refs + hosts) — não basta CAPACITY_ENV=staging.
 * 3. Local (localhost) permitido sem allowlist.
 */
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const DENYLIST_PATH = join(
  __dirname,
  '..',
  'docs',
  'capacity',
  'staging',
  'prod-denylist.json',
)

const SUPABASE_HOST_RE = /^([a-z0-9]{20})\.supabase\.co$/i

function loadProdDenylist() {
  const raw = JSON.parse(readFileSync(DENYLIST_PATH, 'utf8'))
  return {
    project_refs: (raw.project_refs || []).map((s) => String(s).toLowerCase()),
    hosts: (raw.hosts || []).map((s) => String(s).toLowerCase()),
    url_fragments: (raw.url_fragments || []).map((s) => String(s).toLowerCase()),
  }
}

function parseTargetUrl(url) {
  const trimmed = (url || '').trim()
  if (!trimmed) {
    return { hostname: '', projectRef: null, isLocal: false }
  }
  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error(`URL inválida: ${trimmed}`)
  }
  const hostname = parsed.hostname.toLowerCase()
  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1'
  const m = hostname.match(SUPABASE_HOST_RE)
  return { hostname, projectRef: m ? m[1].toLowerCase() : null, isLocal }
}

function evaluateCapacityTarget(input = {}) {
  const denylist = input.denylist || loadProdDenylist()
  const url = (input.url || '').trim()
  const envName = (input.envName || '').trim().toLowerCase()
  const allowed = (input.allowedProjectRef || '').trim().toLowerCase()
  const extraBlocked = (input.blockedProjectRefs || [])
    .map((s) => String(s).trim().toLowerCase())
    .filter(Boolean)
  const requireBlockedRefs = input.requireBlockedRefs !== false

  const errors = []
  const warnings = []

  if (!url) {
    errors.push('URL do alvo ausente (SUPABASE_URL / K6_SUPABASE_URL)')
    return { ok: false, mode: 'unknown', errors, warnings, projectRef: null }
  }

  const { hostname, projectRef, isLocal } = parseTargetUrl(url)

  for (const host of denylist.hosts) {
    if (hostname === host || hostname.endsWith(`.${host}`)) {
      errors.push(`host de produção bloqueado: ${hostname}`)
    }
  }
  for (const frag of denylist.url_fragments) {
    if (url.toLowerCase().includes(frag)) {
      errors.push(`URL contém fragmento de produção: ${frag}`)
    }
  }

  const blockedRefs = new Set([...denylist.project_refs, ...extraBlocked])
  if (projectRef && blockedRefs.has(projectRef)) {
    errors.push(`project ref de produção bloqueado: ${projectRef}`)
  }

  if (isLocal) {
    if (envName && envName !== 'local' && envName !== 'dev') {
      warnings.push(`URL local com CAPACITY_ENV=${envName} (aceito como local)`)
    }
    return {
      ok: errors.length === 0,
      mode: 'local',
      errors,
      warnings,
      projectRef: null,
      hostname,
    }
  }

  if (envName !== 'staging' && envName !== 'homolog' && envName !== 'preview') {
    errors.push(
      `alvo remoto exige CAPACITY_ENV=staging|homolog|preview (recebido: "${envName || '(vazio)'}")`,
    )
  }

  // Refs de produção não ficam no Git — obrigatório informar via env/param
  if (requireBlockedRefs && blockedRefs.size === 0) {
    errors.push(
      'CAPACITY_BLOCKED_PROJECT_REFS obrigatório para alvo remoto (ref de produção, não versionado)',
    )
  }

  if (!allowed) {
    errors.push(
      'CAPACITY_ALLOWED_PROJECT_REF / GATE_STAGING_PROJECT_REF obrigatório para alvo remoto',
    )
  } else if (!/^[a-z0-9]{20}$/.test(allowed)) {
    errors.push('CAPACITY_ALLOWED_PROJECT_REF deve ter 20 caracteres alfanuméricos')
  } else if (blockedRefs.has(allowed)) {
    errors.push('CAPACITY_ALLOWED_PROJECT_REF aponta para ref de produção — recusado')
  }

  if (!projectRef) {
    errors.push(`host remoto não é *.supabase.co reconhecível: ${hostname}`)
  } else if (allowed && projectRef !== allowed) {
    errors.push(
      `ref da URL (${projectRef}) ≠ CAPACITY_ALLOWED_PROJECT_REF (${allowed})`,
    )
  }

  const jwt = (input.serviceRoleJwt || '').trim()
  if (jwt && projectRef && allowed && projectRef === allowed) {
    try {
      const payload = JSON.parse(
        Buffer.from(jwt.split('.')[1] || '', 'base64url').toString('utf8'),
      )
      const refClaim = String(payload.ref || '').toLowerCase()
      if (refClaim && blockedRefs.has(refClaim)) {
        errors.push('JWT service_role pertence a projeto de produção — recusado')
      }
      if (refClaim && refClaim !== allowed) {
        errors.push(
          `JWT service_role ref=${refClaim} ≠ CAPACITY_ALLOWED_PROJECT_REF=${allowed}`,
        )
      }
    } catch {
      warnings.push('JWT service_role não pôde ser decodificado (claim ref)')
    }
  }

  return {
    ok: errors.length === 0,
    mode: 'staging',
    errors,
    warnings,
    projectRef,
    hostname,
  }
}

function assertCapacityTargetFromEnv(env = process.env) {
  const url =
    env.CAPACITY_SUPABASE_URL?.trim() ||
    env.K6_SUPABASE_URL?.trim() ||
    env.SUPABASE_URL?.trim() ||
    env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ''

  const result = evaluateCapacityTarget({
    url,
    envName: env.CAPACITY_ENV || env.GATE_ENV || '',
    allowedProjectRef:
      env.CAPACITY_ALLOWED_PROJECT_REF || env.GATE_STAGING_PROJECT_REF || '',
    blockedProjectRefs: (env.CAPACITY_BLOCKED_PROJECT_REFS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    serviceRoleJwt: env.SUPABASE_SERVICE_ROLE_KEY || env.CAPACITY_SERVICE_ROLE_KEY || '',
  })

  for (const w of result.warnings) {
    console.warn(`[capacity-target-guard] WARN: ${w}`)
  }

  if (!result.ok) {
    const detail = result.errors.map((e) => `  - ${e}`).join('\n')
    throw new Error(
      `capacity-target-guard: alvo recusado (mode=${result.mode})\n${detail}`,
    )
  }

  console.log(
    `[capacity-target-guard] OK mode=${result.mode}` +
      (result.projectRef ? ` ref=${result.projectRef}` : ' local'),
  )
  return result
}

function assertCapacityTarget(input) {
  const result = evaluateCapacityTarget(input)
  if (!result.ok) {
    throw new Error(
      `capacity-target-guard: alvo recusado\n${result.errors.map((e) => `  - ${e}`).join('\n')}`,
    )
  }
  return result
}

module.exports = {
  loadProdDenylist,
  parseTargetUrl,
  evaluateCapacityTarget,
  assertCapacityTargetFromEnv,
  assertCapacityTarget,
}

if (require.main === module) {
  try {
    assertCapacityTargetFromEnv()
    process.exit(0)
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(2)
  }
}
