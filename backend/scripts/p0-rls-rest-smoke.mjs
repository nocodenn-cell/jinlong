#!/usr/bin/env node
/**
 * Smoke RLS via PostgREST com JWT de utilizador (não service_role).
 * Compara perfil PAINEL (GERENTE|DONO|ADMIN) vs CAIXA (OPERADOR) nas rotas
 * que o dashboard admin e o painel gerente usam.
 *
 * Obrigatório: SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL), SUPABASE_ANON_KEY
 *   (ou NEXT_PUBLIC_SUPABASE_ANON_KEY).
 *
 * Opcional (recomendado em staging manual / secret de CI):
 *   RLS_SMOKE_JWT_PAINEL — access_token de gerente/dono/admin (mesma loja de teste).
 *   RLS_SMOKE_JWT_CAIXA — access_token de operador.
 *
 * Sem JWTs: imprime ajuda e termina 0 (não bloqueia pipelines sem secrets).
 * Com os dois JWTs: falha se OPERADOR receber linhas em recursos só-gerente.
 *
 * Uso:
 *   node scripts/p0-rls-rest-smoke.mjs
 *   node scripts/p0-rls-rest-smoke.mjs --json
 */

const baseUrl = () =>
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
const anonKey = () =>
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

const jwtPainel = () => process.env.RLS_SMOKE_JWT_PAINEL || ""
const jwtCaixa = () => process.env.RLS_SMOKE_JWT_CAIXA || ""
const requiredInCi = () => (process.env.CI_RLS_SMOKE_REQUIRED || "").trim().toLowerCase() === "true"

function readArgs(argv) {
  return { json: argv.includes("--json") }
}

async function restGet(path, bearer) {
  const url = `${baseUrl()}${path}`
  const res = await fetch(url, {
    headers: {
      apikey: anonKey(),
      Authorization: `Bearer ${bearer}`,
      Accept: "application/json",
    },
  })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { _raw: text }
  }
  return { ok: res.ok, status: res.status, body }
}

function isEmptyArray(body) {
  return Array.isArray(body) && body.length === 0
}

function decodeSub(jwt) {
  try {
    const part = jwt.split(".")[1]
    if (!part) return null
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    const p = JSON.parse(json)
    return typeof p.sub === "string" ? p.sub : null
  } catch {
    return null
  }
}

function decodeJwtPayload(jwt) {
  try {
    const part = jwt.split(".")[1]
    if (!part) return null
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    return JSON.parse(json)
  } catch {
    return null
  }
}

function assertJwtUsable(jwt, label, supabaseUrl) {
  const p = decodeJwtPayload(jwt)
  if (!p?.sub) {
    return `${label} inválido (sem claim sub).`
  }
  if (typeof p.exp === "number" && p.exp * 1000 < Date.now() + 60_000) {
    const when = new Date(p.exp * 1000).toISOString()
    return `${label} expirado (exp=${when}). Regenerar via login/seed ou usar gate local no CI.`
  }
  if (supabaseUrl && typeof p.iss === "string") {
    try {
      const host = new URL(supabaseUrl).hostname
      const ref = host.split(".")[0]
      if (ref && !p.iss.includes(ref)) {
        return `${label} emitido para outro projeto (iss=${p.iss}, esperado ref ~${ref}). Alinhe SUPABASE_URL aos secrets.`
      }
    } catch {
      /* ignore URL parse */
    }
  }
  return null
}

async function main() {
  const opts = readArgs(process.argv.slice(2))
  const url = baseUrl()
  const key = anonKey()
  const jp = jwtPainel()
  const jc = jwtCaixa()

  const payload = {
    ok: true,
    skipped: false,
    checks: [],
    hint:
      "Defina RLS_SMOKE_JWT_PAINEL e RLS_SMOKE_JWT_CAIXA (access_token após login). Ver também backend/supabase/scripts/smoke_rls_painel_gerente.sql",
  }

  if (!jp || !jc) {
    if (!url || !key) {
      if (requiredInCi()) {
        payload.ok = false
        payload.error = "missing_env_or_jwt"
        payload.message =
          "CI exige smoke RLS REST: defina SUPABASE_URL, SUPABASE_ANON_KEY, RLS_SMOKE_JWT_PAINEL e RLS_SMOKE_JWT_CAIXA."
        if (opts.json) console.log(JSON.stringify(payload, null, 2))
        else console.error(payload.message)
        process.exit(2)
      }
      payload.skipped = true
      payload.message =
        "Smoke RLS REST ignorado (exit 0): defina SUPABASE_URL, SUPABASE_ANON_KEY, RLS_SMOKE_JWT_PAINEL e RLS_SMOKE_JWT_CAIXA para executar."
      if (opts.json) console.log(JSON.stringify(payload, null, 2))
      else console.log(payload.message + "\n" + payload.hint)
      process.exit(0)
    }
  }

  if (!url || !key) {
    payload.ok = false
    payload.error = "missing_env"
    payload.message = "Defina SUPABASE_URL e SUPABASE_ANON_KEY (ou NEXT_PUBLIC_*)."
    if (opts.json) console.log(JSON.stringify(payload, null, 2))
    else console.error(payload.message)
    process.exit(2)
  }

  if (!jp || !jc) {
    if (requiredInCi()) {
      payload.ok = false
      payload.error = "missing_jwts"
      payload.message = "CI exige JWTs de painel e caixa para smoke RLS REST."
      if (opts.json) console.log(JSON.stringify(payload, null, 2))
      else console.error(payload.message + "\n" + payload.hint)
      process.exit(2)
    }
    payload.skipped = true
    payload.message =
      "JWTs ausentes — smoke RLS REST não executado (exit 0). Exporte RLS_SMOKE_JWT_PAINEL e RLS_SMOKE_JWT_CAIXA para validar."
    if (opts.json) console.log(JSON.stringify(payload, null, 2))
    else console.log(payload.message + "\n" + payload.hint)
    process.exit(0)
  }

  const jwtPainelErr = assertJwtUsable(jp, "RLS_SMOKE_JWT_PAINEL", url)
  if (jwtPainelErr) {
    payload.ok = false
    payload.error = "jwt_painel_invalid"
    payload.message = jwtPainelErr
    if (opts.json) console.log(JSON.stringify(payload, null, 2))
    else console.error(jwtPainelErr)
    process.exit(2)
  }

  const subPainel = decodeSub(jp)
  if (!subPainel) {
    payload.ok = false
    payload.error = "jwt_painel_invalid"
    if (opts.json) console.log(JSON.stringify(payload, null, 2))
    else console.error("RLS_SMOKE_JWT_PAINEL inválido (sem claim sub).")
    process.exit(2)
  }

  const jwtCaixaErr = assertJwtUsable(jc, "RLS_SMOKE_JWT_CAIXA", url)
  if (jwtCaixaErr) {
    payload.ok = false
    payload.error = "jwt_caixa_invalid"
    payload.message = jwtCaixaErr
    if (opts.json) console.log(JSON.stringify(payload, null, 2))
    else console.error(jwtCaixaErr)
    process.exit(2)
  }

  const painelPaths = [
    { name: "vendas_select", path: "/rest/v1/vendas?select=id&limit=3" },
    { name: "v_estoque_baixo_select", path: "/rest/v1/v_estoque_baixo?select=id,loja_id&limit=5" },
    { name: "usuarios_self", path: `/rest/v1/usuarios?select=id,perfil&id=eq.${subPainel}` },
  ]

  const operadorMustBeEmpty = [
    { name: "documentos_fiscais_eventos_gerente_only", path: "/rest/v1/documentos_fiscais_eventos?select=id&limit=5" },
    { name: "documentos_fiscais_pendentes_gerente_only", path: "/rest/v1/documentos_fiscais_pendentes?select=id&limit=5" },
    { name: "contas_receber_gerente_only", path: "/rest/v1/contas_receber?select=id&limit=5" },
  ]

  for (const t of painelPaths) {
    const r = await restGet(t.path, jp)
    const pass = r.status === 200 && Array.isArray(r.body)
    payload.checks.push({ token: "PAINEL", ...t, status: r.status, pass })
    if (!pass) payload.ok = false
  }

  for (const t of operadorMustBeEmpty) {
    const r = await restGet(t.path, jc)
    const pass = r.status === 200 && isEmptyArray(r.body)
    payload.checks.push({ token: "CAIXA", ...t, status: r.status, pass, note: "esperado []" })
    if (!pass) payload.ok = false
  }

  if (!payload.ok) {
    const all401 = payload.checks.every((c) => !c.pass && c.status === 401)
    payload.message = all401
      ? "RLS_REST_SMOKE_FAIL: HTTP 401 em todas as rotas — JWT inválido/expirado ou SUPABASE_URL/ANON_KEY não correspondem ao emissor do token."
      : "RLS_REST_SMOKE_FAIL: operador deve receber [] em recursos só-gerente, ou painel não obteve 200 nas leituras esperadas."
    if (opts.json) console.log(JSON.stringify(payload, null, 2))
    else {
      console.error(payload.message)
      for (const c of payload.checks) {
        if (!c.pass) console.error(JSON.stringify(c, null, 2))
      }
    }
    process.exit(1)
  }

  payload.message = "RLS_REST_SMOKE_OK"
  if (opts.json) console.log(JSON.stringify(payload, null, 2))
  else console.log(payload.message)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
