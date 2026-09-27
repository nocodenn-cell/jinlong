#!/usr/bin/env node
/**
 * T11-RACE (auditoria Jīn Lóng 2026-09-27, achado da revisão final pós-T11)
 * — concorrência real (2 sessões PostgreSQL independentes) para
 * `criar_confirmar_remessa_entrada`.
 *
 * `SELECT e.quantidade_atual ... FOR UPDATE` só protege o cálculo do custo
 * médio ponderado quando a linha de `estoque` JÁ existe — no primeiro
 * recebimento de um produto (linha ainda inexistente) não há nada para
 * travar, e duas remessas concorrentes do mesmo produto podiam ler
 * v_estoque_antes=0 cada uma. O `INSERT ... ON CONFLICT` corrige a
 * QUANTIDADE final, mas não o custo, que já tinha sido calculado com o
 * valor obsoleto — `produtos.preco_custo` terminava no valor de quem
 * escrevia por último, não na média ponderada correta (provado fora deste
 * harness, com 2 sessões `psql` manuais: 10@10 concorrente com 10@20 sobre
 * produto sem estoque prévio fechava em 20,00, não nos 15,00 esperados).
 *
 * Correção (20260927160000): lock advisory por (loja_id, produto_id), para
 * todos os produtos distintos da remessa em ordem determinística
 * (produto_id::text ASC), adquirido antes de qualquer leitura/escrita de
 * estoque ou custo. Este teste prova as duas propriedades da correção:
 *   1. Duas remessas concorrentes do MESMO produto (sem estoque prévio)
 *      serializam de verdade (T2 fica pending até T1 commitar) e o custo
 *      médio final converge para o valor correto.
 *   2. Duas remessas concorrentes com os MESMOS 2 produtos em ordem
 *      INVERTIDA não deadlockam (ordem determinística de aquisição).
 *
 * Harness idêntico ao de test-estoque-decremento-concurrency.mjs /
 * test-varejo-tier-concurrency.mjs (mesma técnica): sessões `psql`
 * interativas persistentes, sincronizadas por marcador.
 *
 * Uso:
 *   node scripts/test-remessa-custo-medio-concurrency.mjs
 */

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'

function hasPsql() {
  const r = spawnSync('psql', ['--version'], { encoding: 'utf8' })
  return r.status === 0
}

function resolvePsqlSpawn() {
  if (process.env.FINANCIAL_TEST_PSQL) {
    const parts = process.env.FINANCIAL_TEST_PSQL.split(' ').filter(Boolean)
    return { bin: parts[0], args: parts.slice(1), label: process.env.FINANCIAL_TEST_PSQL }
  }
  const url = process.env.DB_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL
  if (url && hasPsql()) return { bin: 'psql', args: [url], label: 'psql <url>' }
  if (url) console.warn('psql não encontrado no PATH; usando o contêiner local do Supabase.')
  return {
    bin: 'docker',
    args: ['exec', '-i', 'supabase_db_fastproduct', 'psql', '-U', 'postgres', '-d', 'postgres'],
    label: 'docker exec supabase_db_fastproduct psql (fallback local)',
  }
}

const PSQL = resolvePsqlSpawn()

class Session {
  constructor(name) {
    this.name = name
    this.seq = 0
    this.buffer = ''
    this.waiters = []
    this.proc = spawn(PSQL.bin, [...PSQL.args, '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=0'])
    this.proc.stdout.on('data', (d) => this._feed(d.toString()))
    this.proc.stderr.on('data', (d) => this._feed(d.toString()))
    this.exited = false
    this.proc.on('exit', (code) => {
      this.exited = true
      this.exitCode = code
      for (const w of this.waiters) w.resolve(this.buffer)
      this.waiters = []
    })
  }

  _feed(chunk) {
    if (process.env.DEBUG_REMESSA_CONCURRENCY === '1') {
      process.stderr.write(`[${this.name}] ${JSON.stringify(chunk)}\n`)
    }
    this.buffer += chunk.replaceAll('\r\n', '\n')
    this._drain()
  }

  _drain() {
    while (this.waiters.length) {
      const w = this.waiters[0]
      const idx = this.buffer.indexOf(w.marker)
      if (idx === -1) return
      const result = this.buffer.slice(0, idx)
      this.buffer = this.buffer.slice(idx + w.marker.length)
      this.waiters.shift()
      w.resolve(result)
    }
  }

  exec(sql) {
    if (this.exited) throw new Error(`sessao ${this.name} ja encerrada (exit ${this.exitCode})`)
    const id = `__MARK_${this.name}_${this.seq++}__`
    const marker = `${id}\n`
    const p = new Promise((resolve) => {
      this.waiters.push({ marker, resolve })
    })
    this.proc.stdin.write(sql.trimEnd() + `\nSELECT '${id}';\n`)
    if (process.env.DEBUG_REMESSA_CONCURRENCY === '1') {
      process.stderr.write(`[${this.name}] sent ${id}\n`)
    }
    this._drain()
    return p
  }

  static async pending(promise, ms) {
    const TIMEOUT = Symbol('timeout')
    const t = new Promise((resolve) => setTimeout(() => resolve(TIMEOUT), ms))
    const result = await Promise.race([promise, t])
    return result === TIMEOUT ? { pending: true } : { pending: false, result }
  }

  static async execTimed(session, sql, label, ms = 8000) {
    return Session.raceTimeout(session.exec(sql), ms, `[${session.name}] ${label} — SQL: ${sql.slice(0, 200)}`)
  }

  static async raceTimeout(promise, ms, label) {
    let timer
    const t = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`TIMEOUT (${ms}ms) esperando: ${label}`)), ms)
    })
    try {
      return await Promise.race([promise, t])
    } finally {
      clearTimeout(timer)
    }
  }

  close() {
    if (!this.exited) this.proc.stdin.end('\\q\n')
  }
}

function hasError(text) {
  return /ERROR:/.test(text)
}

function runOnce(sql) {
  const r = spawnSync(PSQL.bin, [...PSQL.args, '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], {
    input: sql,
    encoding: 'utf8',
    timeout: 15_000,
  })
  if (r.error?.code === 'ETIMEDOUT') {
    throw new Error(`runOnce excedeu 15s (travado) — SQL: ${sql.slice(0, 300)}`)
  }
  if (r.status !== 0) throw new Error(`setup falhou: ${r.stderr || r.stdout}`)
  return r.stdout
}

function uuid() {
  return runOnce(`SELECT gen_random_uuid();`).trim()
}

/** 1 loja, 1 gerente, 1 categoria — produtos são criados por cenário, sempre SEM linha em estoque (o caso que expõe a race). */
function setupFixture() {
  const loja = uuid()
  const codigo = `REMCONC-${loja.slice(0, 8)}`
  const categoria = uuid()
  const gerente = uuid()
  runOnce(`
    INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES ('${loja}', 'REMCONC Loja', '${codigo}', true) ON CONFLICT (id) DO UPDATE SET ativo = true;
    INSERT INTO auth.users (id) VALUES ('${gerente}') ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
    VALUES ('${gerente}', 'REMCONC Gerente', 'GERENTE', true, '${loja}')
    ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;
    INSERT INTO public.categorias (id, nome) VALUES ('${categoria}', 'REMCONC Categoria') ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;
  `)
  return { loja, categoria, gerente }
}

function criarProduto(fx, sufixo) {
  const produto = uuid()
  runOnce(`
    INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id)
    VALUES ('${produto}', '${('7899' + produto.replace(/-/g, '')).slice(0, 13)}', 'REMCONC Produto ${sufixo}', '${fx.categoria}', 10, 'china_manual', false, true, '${fx.loja}');
  `)
  return produto
}

function itensJson(produto, qtd, custo) {
  return `jsonb_build_array(jsonb_build_object('produto_id','${produto}','quantidade_esperada',${qtd},'quantidade_conferida',${qtd},'custo_unitario',${custo}))`
}

const results = []

async function scenario(name, fn) {
  console.log(`\n=== ${name} ===`)
  const sessions = []
  try {
    await fn({ open: (label) => { const s = new Session(label); sessions.push(s); return s }, log: console.log })
    console.log(`OK   ${name}`)
    results.push({ name, ok: true })
  } catch (err) {
    console.error(`FAIL ${name}: ${err.stack || err.message}`)
    results.push({ name, ok: false, detail: err.message })
  } finally {
    for (const s of sessions) s.close()
  }
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error('\n##[error] WATCHDOG: test-remessa-custo-medio-concurrency.mjs excedeu 45s — abortando para não travar o job de CI.')
    process.exit(1)
  }, 45_000)
  watchdog.unref?.()

  console.log(`Concorrência custo médio (remessa) — conexão: ${PSQL.label}\n`)
  const fx = setupFixture()
  console.log(`fixture: loja=${fx.loja} gerente=${fx.gerente}`)

  // ==========================================================================
  // CENÁRIO 1 — duas remessas concorrentes recebem o MESMO produto NOVO (sem
  // linha em estoque ainda) pela primeira vez, com custos diferentes. A
  // segunda sessão deve BLOQUEAR de verdade no lock advisory (T11-RACE) até a
  // primeira commitar — não apenas "por sorte" terminar depois. No fim:
  // quantidade_atual = soma das duas, preco_custo = média ponderada correta
  // (nem o custo de quem chegou primeiro, nem o de quem chegou depois).
  // ==========================================================================
  await scenario('duas remessas concorrentes do mesmo produto novo (custo médio)', async ({ open, log }) => {
    const produto = criarProduto(fx, 'Race')
    const T1 = open('T1-custo10')
    const T2 = open('T2-custo20')
    for (const s of [T1, T2]) {
      await Session.execTimed(s, `SET statement_timeout = '6s'; SET lock_timeout = '5s';`, `${s.name}: SET timeouts`)
      await Session.execTimed(s, `SELECT set_config('request.jwt.claim.sub', '${fx.gerente}', false);`, `${s.name}: set auth.uid()`)
    }

    await Session.execTimed(T1, `BEGIN;`, 'T1: BEGIN')
    await Session.execTimed(T2, `BEGIN;`, 'T2: BEGIN')

    const key1 = `race-a-${produto}`
    const key2 = `race-b-${produto}`

    // T1 entra na RPC, adquire o lock advisory do produto, faz todo o
    // trabalho (INSERT estoque, calcula custo=10.00) e RETORNA — mas como a
    // transação segue aberta (sem COMMIT), o lock continua com T1.
    const r1 = await Session.execTimed(
      T1,
      `SELECT public.criar_confirmar_remessa_entrada('T1 origem', NULL, ${itensJson(produto, 10, 10)}, '${key1}');`,
      'T1: criar_confirmar_remessa_entrada (custo 10)',
    )
    assert.ok(!hasError(r1), `T1 não deveria dar erro: ${r1}`)
    log('T1 resultado (remessa_id):', r1.trim())

    // T2 tenta o MESMO produto — deve ficar PENDING (bloqueada no lock
    // advisory) enquanto T1 não commita. Sem a correção, T2 não bloquearia
    // aqui: entraria direto, leria v_estoque_antes=0 (linha só existe dentro
    // da transação NÃO commitada de T1, invisível para T2) e calcularia
    // errado.
    const p2 = T2.exec(
      `SELECT public.criar_confirmar_remessa_entrada('T2 origem', NULL, ${itensJson(produto, 10, 20)}, '${key2}');`,
    )
    const wait2 = await Session.pending(p2, 1500)
    assert.ok(wait2.pending, 'T2 deveria estar bloqueada no lock advisory do produto enquanto T1 não commita — se não bloqueou, a correção não está serializando')
    log('T2 confirmado bloqueado (pending) enquanto T1 segura o lock — OK')

    // T1 commita — libera o lock advisory. T2 prossegue, agora vendo a linha
    // de estoque já criada por T1.
    await Session.execTimed(T1, `COMMIT;`, 'T1: COMMIT')

    const r2 = await Session.raceTimeout(p2, 6000, 'T2: criar_confirmar_remessa_entrada (custo 20) após T1 commitar')
    assert.ok(!hasError(r2), `T2 não deveria dar erro: ${r2}`)
    log('T2 resultado (remessa_id):', r2.trim())

    await Session.execTimed(T2, `COMMIT;`, 'T2: COMMIT')

    const final = runOnce(`
      SELECT quantidade_atual, (SELECT preco_custo FROM public.produtos WHERE id = '${produto}')
      FROM public.estoque WHERE produto_id = '${produto}';
    `)
    const [qtd, custo] = final.trim().split('|').map((v) => Number(v.trim()))
    log(`Verificação final: quantidade_atual=${qtd} preco_custo=${custo}`)
    assert.equal(qtd, 20, `quantidade_atual deveria ser 20 (10+10): obtido ${qtd}`)
    assert.equal(custo, 15, `preco_custo deveria ser a média ponderada correta 15.00 ((10×10 + 10×20)/20) — 10.00 ou 20.00 indicam a race de volta: obtido ${custo}`)
  })

  // ==========================================================================
  // CENÁRIO 2 — duas remessas concorrentes com os MESMOS 2 produtos em ORDEM
  // INVERTIDA não devem deadlockar. A correção adquire os locks em ordem
  // determinística (produto_id::text ASC), não na ordem do JSON — prova que
  // isso realmente evita espera circular.
  // ==========================================================================
  await scenario('duas remessas concorrentes, mesmos produtos em ordem invertida (sem deadlock)', async ({ open, log }) => {
    const p1 = criarProduto(fx, 'Multi1')
    const p2 = criarProduto(fx, 'Multi2')
    const T1 = open('T1-multiA')
    const T2 = open('T2-multiB')
    for (const s of [T1, T2]) {
      await Session.execTimed(s, `SET statement_timeout = '8s'; SET lock_timeout = '8s'; SET deadlock_timeout = '2s';`, `${s.name}: SET timeouts`)
      await Session.execTimed(s, `SELECT set_config('request.jwt.claim.sub', '${fx.gerente}', false);`, `${s.name}: set auth.uid()`)
    }

    const itensA = `jsonb_build_array(jsonb_build_object('produto_id','${p1}','quantidade_esperada',5,'quantidade_conferida',5,'custo_unitario',5), jsonb_build_object('produto_id','${p2}','quantidade_esperada',5,'quantidade_conferida',5,'custo_unitario',5))`
    const itensB = `jsonb_build_array(jsonb_build_object('produto_id','${p2}','quantidade_esperada',7,'quantidade_conferida',7,'custo_unitario',7), jsonb_build_object('produto_id','${p1}','quantidade_esperada',7,'quantidade_conferida',7,'custo_unitario',7))`

    const pA = T1.exec(`SELECT public.criar_confirmar_remessa_entrada('T1 origem', NULL, ${itensA}, 'multi-a-${p1}-${p2}');`)
    const pB = T2.exec(`SELECT public.criar_confirmar_remessa_entrada('T2 origem', NULL, ${itensB}, 'multi-b-${p1}-${p2}');`)

    const rA = await Session.raceTimeout(pA, 10000, 'T1: remessa multi-produto (ordem p1,p2)')
    const rB = await Session.raceTimeout(pB, 10000, 'T2: remessa multi-produto (ordem p2,p1)')

    assert.ok(!/deadlock/i.test(rA), `T1 não deveria dar deadlock: ${rA}`)
    assert.ok(!/deadlock/i.test(rB), `T2 não deveria dar deadlock: ${rB}`)
    assert.ok(!hasError(rA), `T1 não deveria dar erro: ${rA}`)
    assert.ok(!hasError(rB), `T2 não deveria dar erro: ${rB}`)
    log('T1 resultado:', rA.trim())
    log('T2 resultado:', rB.trim())

    const final = runOnce(`
      SELECT produto_id, quantidade_atual FROM public.estoque WHERE produto_id IN ('${p1}','${p2}') ORDER BY produto_id;
    `)
    log('Estoque final:', final.trim().replaceAll('\n', ' | '))
  })

  clearTimeout(watchdog)

  console.log('')
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  — ${r.detail}` : ''}`)
  }
  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    console.error(`\nConcorrência custo médio (remessa) FALHOU: ${failed.length}/${results.length} cenário(s).`)
    process.exit(1)
  }
  console.log(`\nConcorrência custo médio (remessa) OK: ${results.length}/${results.length} cenário(s).`)
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
