#!/usr/bin/env node
/**
 * Readiness real da stack Supabase local antes do E2E — não confia em "supabase start"
 * ter retornado sucesso (isso só garante que os containers reportaram healthy no Docker
 * Compose, não que Postgres/GoTrue/PostgREST já aceitam as chamadas que os testes fazem).
 *
 * Causa raiz que motivou este script: `admin.auth.admin.listUsers()` falhou com
 * `AuthRetryableFetchError: {}` (corpo vazio — erro de rede de baixo nível, não HTTP do
 * GoTrue) DEPOIS do seed já ter rodado com sucesso na mesma execução — ou seja, o Auth
 * não estava "nunca pronto", ficou indisponível/instável num instante posterior. Este
 * script valida os 3 serviços de forma isolada, com retry curto (não infinito) e log de
 * qual serviço falhou e por quê, para o job falhar rápido em vez de descobrir isso só
 * dentro da suíte Playwright, 20+ minutos depois.
 *
 * Uso: SB_URL=... SB_ANON=... SB_SR=... node scripts/ci-e2e-readiness-check.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Absoluto e independente do cwd de quem chama — o step do workflow roda da raiz do
// repo, mas rodar manualmente de dentro de backend/ (como neste teste) não deve quebrar
// a coleta de diagnóstico por causa de um `cd backend` relativo.
const backendDir = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, '')

const SB_URL = (process.env.SB_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
const SB_ANON = (process.env.SB_ANON ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
const SB_SR = (process.env.SB_SR ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

const MAX_ATTEMPTS = 6
const ATTEMPT_TIMEOUT_MS = 5_000
const RETRY_DELAY_MS = 2_000

function requireEnv(name, value) {
  if (!value) {
    console.error(`::error::Readiness check: env obrigatório ausente: ${name}`)
    process.exit(1)
  }
}
requireEnv('SB_URL', SB_URL)
requireEnv('SB_ANON', SB_ANON)
requireEnv('SB_SR', SB_SR)

/** checagem HTTP crua (sem SDK) — isola erro de rede de erro de sessão/parsing do client. */
async function probeHttp(label, url, headers) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers, signal: controller.signal })
    clearTimeout(t)
    // Não exigimos 200: PostgREST/GoTrue respondem 401/404 sem apikey certa em algumas
    // rotas, e isso já prova que o serviço está de pé e aceitando conexão TCP+HTTP.
    // O que importa aqui é "respondeu de forma válida", não "autorizou" — mas 5xx É um
    // sinal real de serviço quebrado (PostgREST/GoTrue erraram ao processar), não apenas
    // "não autorizado"; `fetch` resolve normalmente para respostas HTTP de erro, então sem
    // este corte um 500/503 (Postgres/schema inutilizável por trás) passava como "pronto"
    // (apontado no code review do PR #315).
    if (res.status >= 500) {
      return { ok: false, status: res.status, error: `${label}: HTTP ${res.status}` }
    }
    return { ok: true, status: res.status }
  } catch (err) {
    clearTimeout(t)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function probePostgrest() {
  return probeHttp('PostgREST', `${SB_URL}/rest/v1/`, { apikey: SB_ANON })
}

async function probeGoTrueHealth() {
  return probeHttp('GoTrue health', `${SB_URL}/auth/v1/health`, { apikey: SB_ANON })
}

/**
 * A checagem que importa de verdade: a MESMA chamada que os specs de E2E fazem.
 *
 * `AbortController` real (não `withTimeout`/`Promise.race`): `Promise.race` só rejeita o
 * WRAPPER quando o timer dispara — a chamada HTTP de `listUsers()` continua em voo por
 * baixo. Numa tentativa que trava e um retry seguinte que dá certo, essa chamada antiga
 * ainda pendente pode manter o processo vivo até o timeout do step do CI (apontado no code
 * review do PR #315). `global.fetch` do client aceita `AbortSignal` — repassar o mesmo
 * signal do timer cancela a requisição de verdade, não só a espera por ela.
 */
async function probeAuthAdminListUsers() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS)
  try {
    const admin = createClient(SB_URL, SB_SR, {
      auth: { persistSession: false },
      global: {
        fetch: (url, options) => fetch(url, { ...options, signal: controller.signal }),
      },
    })
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    const aborted = controller.signal.aborted
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: aborted ? `timeout ${ATTEMPT_TIMEOUT_MS}ms aguardando admin.auth.admin.listUsers() (abortado)` : msg }
  } finally {
    clearTimeout(timer)
  }
}

async function probeDbViaPostgrest() {
  // Sem acesso direto a psql daqui garantido; usar PostgREST com service_role é uma prova
  // indireta mas real de que o Postgres por trás responde a query (não só que o container
  // está de pé).
  return probeHttp('Postgres via PostgREST', `${SB_URL}/rest/v1/usuarios?select=id&limit=1`, {
    apikey: SB_SR,
    Authorization: `Bearer ${SB_SR}`,
  })
}

function dumpDiagnostics(reason) {
  console.error(`\n::group::Diagnóstico — readiness falhou (${reason})`)
  const cmds = [
    ['supabase status (backend/)', `npx supabase status`],
    ['docker ps', 'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"'],
    ['docker logs supabase_auth_fastproduct (tail)', 'docker logs --tail 100 supabase_auth_fastproduct'],
    ['docker logs supabase_rest_fastproduct (tail)', 'docker logs --tail 100 supabase_rest_fastproduct'],
    ['docker logs supabase_db_fastproduct (tail)', 'docker logs --tail 100 supabase_db_fastproduct'],
    ['docker stats (snapshot)', 'docker stats --no-stream'],
  ]
  for (const [label, cmd] of cmds) {
    console.error(`\n--- ${label} ---`)
    try {
      const cwd = label.startsWith('supabase status') ? backendDir : undefined
      console.error(execSync(cmd, { encoding: 'utf8', timeout: 15_000, cwd }))
    } catch (err) {
      console.error(`(falhou ao coletar: ${err instanceof Error ? err.message : String(err)})`)
    }
  }
  console.error('::endgroup::\n')
}

async function checkOnce() {
  // Em paralelo: o pior caso de uma tentativa é o maior timeout individual (~5s), não a
  // soma dos 4 — falhar rápido importa mais aqui do que economizar uma chamada HTTP.
  const [postgrest, gotrueHealth, authAdminListUsers, dbViaPostgrest] = await Promise.all([
    probePostgrest(),
    probeGoTrueHealth(),
    probeAuthAdminListUsers(),
    probeDbViaPostgrest(),
  ])
  const results = { postgrest, gotrueHealth, authAdminListUsers, dbViaPostgrest }
  const failed = Object.entries(results).filter(([, r]) => !r.ok)
  return { ok: failed.length === 0, results, failed }
}

async function main() {
  console.log(`Readiness check — alvo: ${SB_URL}`)
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const { ok, results, failed } = await checkOnce()
    if (ok) {
      console.log(
        `OK (tentativa ${attempt}/${MAX_ATTEMPTS}) — PostgREST=${results.postgrest.status}, ` +
          `GoTrue health=${results.gotrueHealth.status}, ` +
          `admin.auth.admin.listUsers()=OK, ` +
          `Postgres via PostgREST=${results.dbViaPostgrest.status}`,
      )
      // process.exitCode (não process.exit()): deixa o event loop drenar handles nativos
      // do client supabase-js/undici antes de sair — em runners Linux isso evita qualquer
      // corrida de encerramento; em Windows local, `process.exit()` imediato após uma
      // chamada de rede recente pode derrubar o processo com um assert nativo do libuv
      // (`UV_HANDLE_CLOSING`), não relacionado à validação em si (que já terminou OK acima).
      process.exitCode = 0
      return
    }
    const detalhe = failed
      .map(([nome, r]) => `${nome}: ${r.error ?? `status ${r.status}`}`)
      .join(' | ')
    console.log(`Tentativa ${attempt}/${MAX_ATTEMPTS} falhou — ${detalhe}`)
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    } else {
      console.error(`::error::Readiness check esgotou ${MAX_ATTEMPTS} tentativas — ${detalhe}`)
      dumpDiagnostics(detalhe)
      process.exit(1)
    }
  }
}

main()
