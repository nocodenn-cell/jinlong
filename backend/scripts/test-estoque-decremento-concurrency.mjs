#!/usr/bin/env node
/**
 * Item 24 do plano de fechamento de gaps (auditoria Jīn Lóng) — concorrência
 * real (2 sessões PostgreSQL independentes, não 2 chamadas sequenciais na
 * mesma conexão) para `decrementar_estoque_seguro`.
 *
 * A leitura de código já mostra lock pessimista correto (`SELECT ... FOR
 * UPDATE` antes de checar `quantidade_atual < p_quantidade`), mas — igual ao
 * que já aconteceu duas vezes nesta base (comissões, tier de preço) — só uma
 * prova com 2 sessões reais confirma que o lock realmente serializa e que
 * duas vendas concorrentes do ÚLTIMO item em estoque não geram saldo
 * negativo nem duas baixas bem-sucedidas.
 *
 * Harness idêntico ao de test-varejo-tier-concurrency.mjs /
 * test-nfe-conferencia-concurrency.mjs (mesma técnica): duas sessões `psql`
 * interativas persistentes, sincronizadas por marcador.
 *
 * Uso:
 *   node scripts/test-estoque-decremento-concurrency.mjs
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
    if (process.env.DEBUG_ESTOQUE_CONCURRENCY === '1') {
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
    if (process.env.DEBUG_ESTOQUE_CONCURRENCY === '1') {
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

/** 1 loja, 1 caixa aberto, 1 produto com quantidade_atual=1 (só resta 1 unidade), 2 vendas prontas para decrementar o mesmo produto. */
function setupFixture() {
  const loja = uuid()
  const codigo = `ESTQCONC-${loja.slice(0, 8)}`
  const caixa = uuid()
  const categoria = uuid()
  const produto = uuid()
  const venda1 = uuid()
  const venda2 = uuid()
  const operador = uuid()
  runOnce(`
    INSERT INTO public.empresas (id, nome) VALUES ('fa5e0000-0000-4000-8000-0000000000f1', 'Fixture empresa (concorrencia)') ON CONFLICT (id) DO NOTHING; INSERT INTO public.lojas (empresa_id, id, nome, codigo, ativo) VALUES ('fa5e0000-0000-4000-8000-0000000000f1', '${loja}', 'ESTQCONC Loja', '${codigo}', true) ON CONFLICT (id) DO UPDATE SET ativo = true;
    INSERT INTO auth.users (id) VALUES ('${operador}') ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id, idioma_preferido)
    VALUES ('${operador}', 'ESTQCONC Operador', 'OPERADOR', true, '${loja}', 'pt')
    ON CONFLICT (id) DO UPDATE SET ativo = true, loja_id = EXCLUDED.loja_id;
    INSERT INTO public.caixas (id, operador_id, loja_id, status, valor_inicial) VALUES ('${caixa}', '${operador}', '${loja}', 'ABERTO', 100);
    INSERT INTO public.categorias (empresa_id, id, nome) VALUES ('fa5e0000-0000-4000-8000-0000000000f1', '${categoria}', 'ESTQCONC Categoria') ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;
    INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id)
    VALUES ('${produto}', '${('7899' + produto.replace(/-/g, '')).slice(0, 13)}', 'ESTQCONC Produto', '${categoria}', 50, 'china_manual', false, true, '${loja}');
    INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo) VALUES ('${produto}', '${loja}', 1, 0);
    INSERT INTO public.vendas (id, caixa_id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
    VALUES ('${venda1}', '${caixa}', '${operador}', 50, 0, 50, 'PIX', 'CONCLUIDA');
    INSERT INTO public.vendas (id, caixa_id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
    VALUES ('${venda2}', '${caixa}', '${operador}', 50, 0, 50, 'PIX', 'CONCLUIDA');
  `)
  return { loja, produto, venda1, venda2 }
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
    console.error('\n##[error] WATCHDOG: test-estoque-decremento-concurrency.mjs excedeu 45s — abortando para não travar o job de CI.')
    process.exit(1)
  }, 45_000)
  watchdog.unref?.()

  console.log(`Concorrência decremento de estoque — conexão: ${PSQL.label}\n`)
  const fx = setupFixture()
  console.log(`fixture: loja=${fx.loja} produto=${fx.produto}`)

  // ==========================================================================
  // CENÁRIO — duas vendas concorrentes tentam decrementar a ÚLTIMA unidade
  // do mesmo produto. `decrementar_estoque_seguro` toma `SELECT ... FOR
  // UPDATE` antes de checar quantidade — a segunda sessão deve BLOQUEAR até
  // a primeira commitar, e então ver quantidade_atual=0 e falhar com
  // ESTOQUE_INSUFICIENTE. No fim: exatamente 1 sucesso, quantidade_atual=0
  // (nunca negativo), exatamente 1 linha em estoque_baixas.
  // ==========================================================================
  await scenario('vender a última unidade em paralelo (2 vendas, mesmo produto)', async ({ open, log }) => {
    const T1 = open('T1venda1')
    const T2 = open('T2venda2')
    // Conecta como o role padrão da sessão psql (postgres) — sem
    // request.jwt.claim.sub setado, auth.uid() fica NULL, então a checagem
    // de autorização por operador dentro da RPC (auth.uid() IS NOT NULL)
    // não se aplica; a RPC usa vendas.operador_id (via COALESCE) para
    // gravar usuario_id no kardex, então isso não afeta o que este teste
    // prova (lock/serialização, não autorização — já coberto noutro teste).
    for (const s of [T1, T2]) {
      await Session.execTimed(s, `SET statement_timeout = '6s'; SET lock_timeout = '5s';`, `${s.name}: SET timeouts`)
    }

    await Session.execTimed(T1, `BEGIN;`, 'T1: BEGIN')
    await Session.execTimed(T2, `BEGIN;`, 'T2: BEGIN')

    // T1 pega o lock FOR UPDATE primeiro (não commitou ainda).
    const r1 = await Session.execTimed(
      T1,
      `SELECT sucesso, mensagem, estoque_atual FROM public.decrementar_estoque_seguro('${fx.produto}'::uuid, 1, '${fx.venda1}'::uuid);`,
      'T1: decrementar (1a venda)',
    )
    assert.ok(!hasError(r1), `T1 não deveria dar erro de SQL: ${r1}`)
    log('T1 resultado:', r1.trim())
    assert.match(r1, /^t\|/, `T1 deveria ter sucesso=true (linha ainda não commitada): ${r1}`)

    // T2 tenta pegar o MESMO lock — deve BLOQUEAR (pending) enquanto T1 não commita.
    const p2 = T2.exec(
      `SELECT sucesso, mensagem, estoque_atual FROM public.decrementar_estoque_seguro('${fx.produto}'::uuid, 1, '${fx.venda2}'::uuid);`,
    )
    const wait2 = await Session.pending(p2, 1500)
    assert.ok(wait2.pending, 'T2 deveria estar bloqueada esperando o lock FOR UPDATE de T1 — não pode ter respondido ainda')
    log('T2 confirmado bloqueado (pending) enquanto T1 segura o lock — OK')

    // T1 commita — libera o lock. T2 deve prosseguir e ver quantidade_atual=0.
    await Session.execTimed(T1, `COMMIT;`, 'T1: COMMIT')

    const r2 = await Session.raceTimeout(p2, 6000, 'T2: decrementar (2a venda) após T1 commitar')
    assert.ok(!hasError(r2), `T2 não deveria dar erro de SQL: ${r2}`)
    log('T2 resultado:', r2.trim())
    assert.match(r2, /^f\|ESTOQUE_INSUFICIENTE\|0/, `T2 deveria falhar com ESTOQUE_INSUFICIENTE e estoque_atual=0 (invariante quebrada se não): ${r2}`)

    await Session.execTimed(T2, `COMMIT;`, 'T2: COMMIT (sem efeito — RPC já retornou falha, mas fecha a transação)')

    // Verificação final fora das sessões de teste: saldo nunca ficou negativo,
    // exatamente 1 baixa foi registrada.
    const final = runOnce(`
      SELECT quantidade_atual FROM public.estoque WHERE produto_id = '${fx.produto}';
      SELECT count(*) FROM public.estoque_baixas WHERE produto_id = '${fx.produto}';
    `)
    const [qtd, baixas] = final.trim().split('\n').map((l) => l.trim())
    assert.equal(qtd, '0.000', `quantidade_atual final deveria ser 0 (nunca negativo): obtido ${qtd}`)
    assert.equal(baixas, '1', `deveria haver exatamente 1 baixa registrada (idempotência + lock corretos): obtido ${baixas}`)
    log(`Verificação final OK: quantidade_atual=${qtd}, baixas=${baixas}`)
  })

  clearTimeout(watchdog)

  console.log('')
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  — ${r.detail}` : ''}`)
  }
  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    console.error(`\nConcorrência decremento de estoque FALHOU: ${failed.length}/${results.length} cenário(s).`)
    process.exit(1)
  }
  console.log(`\nConcorrência decremento de estoque OK: ${results.length}/${results.length} cenário(s).`)
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
