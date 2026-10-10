#!/usr/bin/env node
/**
 * F1 — smoke de isolamento Empresa A × Empresa B com AUTENTICAÇÃO REAL
 * (GoTrue emite o JWT; PostgREST aplica RLS/grants; RPCs pela API).
 *
 * SOMENTE Supabase LOCAL (`supabase start`). Recusa qualquer host que não seja
 * 127.0.0.1/localhost. Cria identidades e dados FICTÍCIOS com sufixo único por execução.
 *
 * Env obrigatórias (de `supabase status -o env`):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso: node backend/scripts/f1-rls-rest-smoke.mjs
 * Saída: uma linha por verificação; exit 1 se qualquer uma falhar.
 */
import { randomUUID } from 'node:crypto'

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const ANON = process.env.SUPABASE_ANON_KEY || ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!URL_BASE || !ANON || !SERVICE) {
  console.error('f1-rls-rest-smoke: defina SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY (supabase status -o env).')
  process.exit(2)
}
const host = new URL(URL_BASE).hostname
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  console.error(`f1-rls-rest-smoke: recusado — alvo não local (${host}). Este smoke cria dados fictícios.`)
  process.exit(2)
}

const RUN = randomUUID().slice(0, 8)
const SENHA = `F1-smoke-${randomUUID()}`
let falhas = 0
const resultados = []

function check(ok, nome, detalhe = '') {
  resultados.push({ ok, nome })
  if (!ok) falhas += 1
  console.log(`${ok ? 'F1-REST OK  ' : 'F1-REST FAIL'} ${nome}${!ok && detalhe ? ` :: ${detalhe}` : ''}`)
}

async function http(method, path, { token, body, prefer } = {}) {
  const headers = { apikey: token === SERVICE ? SERVICE : ANON, 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (prefer) headers.Prefer = prefer
  const res = await fetch(`${URL_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { _raw: text }
  }
  return { status: res.status, body: json }
}

const svc = (method, path, body, prefer = 'return=representation') =>
  http(method, `/rest/v1/${path}`, { token: SERVICE, body, prefer })
const rest = (token, method, path, body, prefer = 'return=representation') =>
  http(method, `/rest/v1/${path}`, { token, body, prefer })
const rpc = (token, fn, args) => http('POST', `/rest/v1/rpc/${fn}`, { token, body: args })

async function svcOk(method, path, body) {
  const r = await svc(method, path, body)
  if (r.status >= 300) throw new Error(`fixture ${method} ${path}: ${r.status} ${JSON.stringify(r.body)}`)
  return r.body
}

async function criarIdentidade(rotulo) {
  const email = `${rotulo}.${RUN}@f1-smoke.test`
  const r = await http('POST', '/auth/v1/admin/users', {
    token: SERVICE,
    body: { email, password: SENHA, email_confirm: true },
  })
  if (r.status >= 300) throw new Error(`GoTrue admin create ${rotulo}: ${r.status} ${JSON.stringify(r.body)}`)
  return { id: r.body.id, email }
}

async function login(email) {
  const r = await http('POST', '/auth/v1/token?grant_type=password', { body: { email, password: SENHA } })
  if (r.status !== 200 || !r.body?.access_token) throw new Error(`login ${email}: ${r.status}`)
  return r.body.access_token
}

const negado = (r) => r.status === 401 || r.status === 403 || (r.body && r.body.code === '42501')
const vazio = (r) => r.status === 200 && Array.isArray(r.body) && r.body.length === 0

async function main() {
  // ------------------------------------------------------------- fixtures --
  const [empA] = await svcOk('POST', 'empresas', { nome: `F1 smoke A ${RUN}` })
  const [empB] = await svcOk('POST', 'empresas', { nome: `F1 smoke B ${RUN}` })
  const [lojaA1] = await svcOk('POST', 'lojas', { nome: `F1S A1 ${RUN}`, codigo: `F1S-A1-${RUN}`, empresa_id: empA.id })
  const [lojaA2] = await svcOk('POST', 'lojas', { nome: `F1S A2 ${RUN}`, codigo: `F1S-A2-${RUN}`, empresa_id: empA.id })
  const [lojaB1] = await svcOk('POST', 'lojas', { nome: `F1S B1 ${RUN}`, codigo: `F1S-B1-${RUN}`, empresa_id: empB.id })

  const ids = {}
  for (const r of ['dono_a', 'gerente_a1', 'operador_a1', 'dono_b', 'sem_vinculo', 'plat_com', 'plat_prov']) {
    ids[r] = await criarIdentidade(r.replace('_', '-'))
  }
  const usuarios = [
    [ids.dono_a, 'DONO', lojaA1.id],
    [ids.gerente_a1, 'GERENTE', lojaA1.id],
    [ids.operador_a1, 'OPERADOR', lojaA1.id],
    [ids.dono_b, 'DONO', lojaB1.id],
    [ids.plat_com, 'ADMIN', lojaA1.id],
    [ids.plat_prov, 'ADMIN', lojaA1.id],
  ]
  for (const [u, perfil, loja] of usuarios) {
    await svcOk('POST', 'usuarios', { id: u.id, nome: `F1S ${perfil} ${RUN}`, perfil, loja_id: loja, ativo: true })
  }
  const [cat] = await svcOk('POST', 'categorias', { nome: `F1S cat ${RUN}` })
  const prod = (loja, cod) => ({
    codigo_barras: cod, nome: `F1S prod ${cod}`, categoria_id: cat.id, preco_varejo: 200, preco_custo: 50,
    origem: 'brasil_nf', tem_nf: true, ativo: true, status_publicacao: 'PUBLICADO', loja_id: loja,
  })
  const sufixo = String(Date.now()).slice(-7)
  const [prodA] = await svcOk('POST', 'produtos', prod(lojaA1.id, `789${sufixo}01`))
  const [prodB] = await svcOk('POST', 'produtos', prod(lojaB1.id, `789${sufixo}02`))
  await svcOk('POST', 'estoque', { produto_id: prodA.id, loja_id: lojaA1.id, quantidade_atual: 10, estoque_minimo: 0, version: 0 })
  await svcOk('POST', 'estoque', { produto_id: prodB.id, loja_id: lojaB1.id, quantidade_atual: 10, estoque_minimo: 0, version: 0 })

  // Plataforma: cadastro pelo PROCEDIMENTO (service_role, sem identidade de usuário)
  const motivo = `smoke F1 ${RUN}: identidade fictícia de homologação`
  let r = await rpc(SERVICE, 'ops_definir_plataforma_admin', {
    p_usuario: ids.plat_com.id, p_ativo: true, p_capacidades: ['COMERCIAL'], p_motivo: motivo, p_executado_por: 'f1-rls-rest-smoke',
  })
  check(r.status < 300, 'P0 procedimento de plataforma via service_role (sem identidade) registra COMERCIAL', JSON.stringify(r.body))
  await rpc(SERVICE, 'ops_definir_plataforma_admin', {
    p_usuario: ids.plat_prov.id, p_ativo: true, p_capacidades: ['PROVISIONAMENTO'], p_motivo: motivo, p_executado_por: 'f1-rls-rest-smoke',
  })

  const tk = {}
  for (const k of Object.keys(ids)) tk[k] = await login(ids[k].email)

  // ------------------------------------------------------------ lojas (P0) --
  r = await rest(tk.dono_a, 'GET', `lojas?select=id&id=in.(${lojaA1.id},${lojaA2.id},${lojaB1.id})`)
  const vistos = new Set((r.body || []).map((x) => x.id))
  check(r.status === 200 && vistos.has(lojaA1.id) && vistos.has(lojaA2.id) && !vistos.has(lojaB1.id),
    'L1 GET lojas: DONO de A vê A1 e A2, não B1', JSON.stringify(r.body))

  r = await rest(tk.sem_vinculo, 'GET', `lojas?select=id&id=in.(${lojaA1.id},${lojaB1.id})`)
  check(vazio(r), 'L2 GET lojas: identidade sem vínculo não vê lojas', JSON.stringify(r.body))

  r = await rest(tk.gerente_a1, 'PATCH', `lojas?id=eq.${lojaB1.id}`, { telefone: '1100000000' })
  check(vazio(r), 'L3 PATCH lojas: GERENTE de A não altera B1 (antes: lojas_write_gerente permitia)', JSON.stringify(r.body))

  r = await rest(tk.gerente_a1, 'PATCH', `lojas?id=eq.${lojaA2.id}`, { telefone: '1100000000' })
  check(vazio(r), 'L4 PATCH lojas: GERENTE de A1 não altera a loja irmã A2', JSON.stringify(r.body))

  r = await rest(tk.gerente_a1, 'PATCH', `lojas?id=eq.${lojaA1.id}`, { telefone: '1100000001' })
  check(r.status === 200 && r.body?.length === 1, 'L5 PATCH lojas: GERENTE altera a própria loja (preservado)', JSON.stringify(r.body))

  r = await rest(tk.dono_a, 'PATCH', `lojas?id=eq.${lojaA1.id}`, { empresa_id: empB.id })
  check(negado(r), 'L6 PATCH lojas.empresa_id: transferência de titularidade negada', JSON.stringify(r.body))

  r = await rest(tk.dono_a, 'POST', 'lojas', { nome: 'Criada via API', empresa_id: empA.id })
  check(negado(r), 'L7 POST lojas: DONO não cria loja (D1)', JSON.stringify(r.body))

  r = await rest(tk.dono_a, 'DELETE', `lojas?id=eq.${lojaB1.id}`)
  check(negado(r), 'L8 DELETE lojas: negado', JSON.stringify(r.body))

  r = await svc('POST', 'lojas', { nome: `Sem empresa ${RUN}` })
  check(r.status >= 400 && /LOJA_SEM_EMPRESA/.test(JSON.stringify(r.body)), 'L9 POST lojas sem empresa: recusado inclusive para service_role', JSON.stringify(r.body))

  // ----------------------------------------------------------- cerca A × B --
  r = await rest(tk.dono_b, 'GET', `produtos?select=id&loja_id=eq.${lojaA1.id}`)
  check(vazio(r), 'C1 GET produtos: DONO de B não lê produtos de A (DONO global legado cercado)', JSON.stringify(r.body))

  r = await rest(tk.dono_b, 'GET', `estoque?select=produto_id&loja_id=eq.${lojaA1.id}`)
  check(vazio(r), 'C2 GET estoque: DONO de B não lê estoque de A', JSON.stringify(r.body))

  r = await rest(tk.dono_b, 'GET', `usuarios?select=id&loja_id=eq.${lojaA1.id}`)
  check(vazio(r), 'C3 GET usuarios: DONO de B não lista usuários de A', JSON.stringify(r.body))

  r = await rest(tk.dono_a, 'GET', `produtos?select=id&loja_id=eq.${lojaA1.id}`)
  check(r.status === 200 && r.body?.length === 1, 'C4 GET produtos: DONO de A lê os próprios (preservado)', JSON.stringify(r.body))

  // return=minimal: produtos tem SELECT por coluna (preco_custo protegido); o efeito é conferido via service_role.
  r = await rest(tk.dono_a, 'PATCH', `produtos?loja_id=eq.${lojaB1.id}`, { nome: 'invadido' }, 'return=minimal')
  const prodBDepois = await svc('GET', `produtos?select=nome&id=eq.${prodB.id}`)
  check((r.status < 300 || negado(r)) && prodBDepois.body?.[0]?.nome === prodB.nome,
    'C5 PATCH produtos de B por A: sem efeito', `${r.status} ${JSON.stringify(prodBDepois.body)}`)

  r = await rpc(tk.dono_a, 'ajustar_estoque_manual_seguro', {
    p_produto_id: prodB.id, p_loja_id: lojaB1.id, p_quantidade_atual: 99, p_estoque_minimo: 0,
    p_motivo_codigo: 'ACERTO_INVENTARIO', p_observacao: null, p_ator_id: null, p_quantidade_esperada: 10, p_minimo_esperado: 0,
  })
  const estB = await svc('GET', `estoque?select=quantidade_atual&produto_id=eq.${prodB.id}&loja_id=eq.${lojaB1.id}`)
  check(r.status >= 400 && Number(estB.body?.[0]?.quantidade_atual) === 10,
    'C6 RPC SECURITY DEFINER ajustar_estoque_manual_seguro: A não altera estoque de B', `${r.status} ${JSON.stringify(r.body)}`)

  r = await rpc(tk.dono_a, 'obter_estoque_disponivel_transferencia', { p_loja_id: lojaB1.id, p_produto_id: prodB.id })
  check(negado(r), 'C7 RPC obter_estoque_disponivel_transferencia: B negado para A', JSON.stringify(r.body))

  r = await rpc(tk.dono_a, 'relatorio_consistencia_vendas_gerente', {})
  check(negado(r), 'C8 RPC relatório global: negado com outra empresa existente', JSON.stringify(r.body))

  // ------------------------------------------------ plataforma e autopromoção --
  r = await rpc(tk.dono_a, 'ops_definir_plataforma_admin', {
    p_usuario: ids.dono_a.id, p_ativo: true, p_capacidades: ['COMERCIAL'], p_motivo: 'autopromoção via API', p_executado_por: 'eu',
  })
  check(negado(r), 'P1 RPC ops_definir_plataforma_admin: authenticated negado (sem autopromoção)', JSON.stringify(r.body))

  r = await rest(tk.dono_a, 'POST', 'plataforma_admins', { usuario_id: ids.dono_a.id, ativo: true, capacidades: ['COMERCIAL'] })
  check(negado(r), 'P2 POST plataforma_admins: negado', JSON.stringify(r.body))

  r = await rest(tk.dono_a, 'GET', 'plataforma_admins?select=usuario_id')
  check(negado(r), 'P3 GET plataforma_admins: negado', JSON.stringify(r.body))

  r = await rpc(tk.plat_prov, 'plataforma_criar_empresa', { p_nome: `Empresa C ${RUN}` })
  check(negado(r) && /MULTIEMPRESA_ERP_NAO_LIBERADO/.test(JSON.stringify(r.body)),
    'P4 plataforma_criar_empresa: segunda empresa bloqueada pela trava', JSON.stringify(r.body))

  r = await rpc(tk.plat_prov, 'plataforma_provisionar_loja', { p_empresa: empA.id, p_nome: `F1S A3 ${RUN}`, p_codigo: `F1S-A3-${RUN}` })
  check(r.status === 200 && r.body?.[0]?.nova === true, 'P5 provisionamento de loja pela plataforma com empresa explícita', JSON.stringify(r.body))

  r = await rpc(tk.dono_a, 'plataforma_provisionar_loja', { p_empresa: empA.id, p_nome: 'x', p_codigo: `F1S-X-${RUN}` })
  check(negado(r), 'P6 provisionamento por DONO: negado', JSON.stringify(r.body))

  // ------------------------------------------------------------ módulo (D3) --
  r = await rpc(tk.dono_a, 'fp_empresa_contexto_modulo', { p_modulo: 'IMPORT_INTELLIGENCE' })
  check(r.status === 200 && r.body === null, 'M1 módulo desabilitado por padrão: contexto nulo para o DONO', JSON.stringify(r.body))

  r = await rpc(tk.plat_prov, 'plataforma_definir_modulo_empresa', {
    p_empresa: empA.id, p_modulo: 'IMPORT_INTELLIGENCE', p_habilitado: true, p_autorizado_por: 'x', p_motivo: 'sem capacidade comercial',
  })
  check(negado(r), 'M2 PROVISIONAMENTO não habilita módulo', JSON.stringify(r.body))

  r = await rpc(tk.plat_com, 'plataforma_definir_modulo_empresa', {
    p_empresa: empA.id, p_modulo: 'IMPORT_INTELLIGENCE', p_habilitado: true,
    p_autorizado_por: `contrato fictício ${RUN}`, p_motivo: `homologação F1 smoke ${RUN}`,
  })
  check(r.status < 300, 'M3 administrador COMERCIAL habilita o módulo para A', JSON.stringify(r.body))

  r = await rpc(tk.dono_a, 'fp_empresa_contexto_modulo', { p_modulo: 'IMPORT_INTELLIGENCE' })
  check(r.status === 200 && r.body === empA.id, 'M4 DONO de A resolve o contexto do módulo para A', JSON.stringify(r.body))

  r = await rpc(tk.dono_b, 'fp_empresa_contexto_modulo', { p_modulo: 'IMPORT_INTELLIGENCE', p_papeis: ['DONO'], p_empresa: empA.id })
  check(r.status === 200 && r.body === null, 'M5 DONO de B com empresa forjada (A): negado', JSON.stringify(r.body))

  r = await rpc(tk.gerente_a1, 'fp_empresa_contexto_modulo', { p_modulo: 'IMPORT_INTELLIGENCE' })
  check(r.status === 200 && r.body === null, 'M6 GERENTE de A: negado pelo papel padrão (DONO)', JSON.stringify(r.body))

  r = await rest(tk.dono_b, 'GET', `empresa_modulos?select=empresa_id&empresa_id=eq.${empA.id}`)
  check(vazio(r), 'M7 DONO de B não vê a licença de A', JSON.stringify(r.body))

  r = await rpc(null, 'fp_empresa_contexto_modulo', { p_modulo: 'IMPORT_INTELLIGENCE' })
  check(negado(r), 'M8 anon: negado', JSON.stringify(r.body))

  const total = resultados.length
  console.log(`\nf1-rls-rest-smoke: ${total - falhas}/${total} OK (run ${RUN})`)
  process.exit(falhas === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('f1-rls-rest-smoke: erro de execução:', e.message)
  process.exit(1)
})
