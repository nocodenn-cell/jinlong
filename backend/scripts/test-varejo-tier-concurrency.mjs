#!/usr/bin/env node
/**
 * Concorrência real (2 sessões PostgreSQL independentes, não 2 chamadas
 * sequenciais na mesma conexão) para a invariante "todo tier ativo de
 * precos_atacado tem preco_unitario < produtos.preco_varejo".
 *
 * Achado do gate de revisão (comentários Codex no PR #363, confirmados por
 * leitura de código antes deste harness):
 *   - a trigger do lado do tier (`trg_validar_tier_preco_menor_que_varejo`)
 *     só disparava em UPDATE de preco_unitario/produto_id — nunca em
 *     `ativo` — então reativar um tier desativado não era revalidado;
 *   - a trigger do lado do varejo (`trg_validar_varejo_maior_que_tiers_ativos`,
 *     deste mesmo gate) lia `NEW.preco_varejo` congelado no momento do
 *     evento, não o valor final da linha;
 *   - nenhuma das duas tomava um lock compartilhado por produto_id, então
 *     duas transações concorrentes — uma mexendo em produtos.preco_varejo,
 *     outra mexendo/reativando precos_atacado — podiam validar cada uma
 *     contra um snapshot que não via a mudança da outra.
 *
 * Harness idêntico ao de test-nfe-conferencia-concurrency.mjs (mesma
 * técnica): duas sessões `psql` interativas persistentes, sincronizadas por
 * marcador.
 *
 * Uso:
 *   node scripts/test-varejo-tier-concurrency.mjs
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
    if (process.env.DEBUG_TIER_CONCURRENCY === '1') {
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
    if (process.env.DEBUG_TIER_CONCURRENCY === '1') {
      process.stderr.write(`[${this.name}] sent ${id}\n`)
    }
    this._drain()
    return p
  }

  /** Ver comentário equivalente em test-nfe-conferencia-concurrency.mjs. */
  execAllowError(sql) {
    const sp = `__sp_${this.name}_${this.seq}__`
    return this.exec(`SAVEPOINT ${sp};\n${sql.trimEnd()}\nROLLBACK TO SAVEPOINT ${sp};`)
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
function errorsOf(text) {
  return [...text.matchAll(/ERROR:\s*(.+)/g)].map((m) => m[1].trim())
}
function firstRow(text) {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find(
      (l) =>
        l &&
        !l.startsWith('ERROR:') &&
        !l.startsWith('CONTEXT:') &&
        !l.startsWith('LINE ') &&
        !l.startsWith('HINT:') &&
        !/^\(\d+ rows?\)$/.test(l) &&
        !/^\^\s*$/.test(l),
    )
  return line ?? ''
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

function setupFixture() {
  const loja = uuid()
  // codigo tem UNIQUE — precisa variar entre execuções (id já é aleatório,
  // mas ON CONFLICT é por id: uma 2ª execução sem reset geraria um id novo
  // colidindo no codigo fixo). Sufixo do próprio uuid resolve sem precisar
  // de reset entre execuções manuais locais.
  const codigo = `TIERCONC-${loja.slice(0, 8)}`
  runOnce(
    `INSERT INTO public.empresas (id, nome) VALUES ('fa5e0000-0000-4000-8000-0000000000f1', 'Fixture empresa (concorrencia)') ON CONFLICT (id) DO NOTHING; INSERT INTO public.lojas (empresa_id, id, nome, codigo, ativo) VALUES ('fa5e0000-0000-4000-8000-0000000000f1', '${loja}', 'TIERCONC Loja', '${codigo}', true) ON CONFLICT (id) DO UPDATE SET ativo = true;`,
  )
  return { loja }
}

/** Cria um produto de teste com varejo=100 e um tier(qtd>=10)=90 no estado pedido. */
function criarProdutoComTier(fx, suffix, { tierAtivo }) {
  const produto = uuid()
  const tier = uuid()
  runOnce(`
    INSERT INTO public.produtos (id, nome, preco_varejo, preco_custo, origem, tem_nf, ativo, loja_id)
    VALUES ('${produto}', 'TIERCONC Produto ${suffix}', 100, 10, 'brasil_nf', false, true, '${fx.loja}');
    INSERT INTO public.precos_atacado (id, produto_id, quantidade_minima, preco_unitario, ativo)
    VALUES ('${tier}', '${produto}', 10, 90, ${tierAtivo});
  `)
  return { produto, tier }
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
    console.error('\n##[error] WATCHDOG: test-varejo-tier-concurrency.mjs excedeu 45s — abortando para não travar o job de CI.')
    process.exit(1)
  }, 45_000)
  watchdog.unref?.()

  console.log(`Concorrência varejo × tier — conexão: ${PSQL.label}\n`)
  const fx = setupFixture()
  console.log(`fixture: loja=${fx.loja}`)

  const modo = process.argv[2] === '--reproduzir-bug' ? 'reproduzir-bug' : 'provar-fix'

  // ==========================================================================
  // CENÁRIO 1 — reativação de tier concorrente com baixa de varejo.
  //
  // modo=reproduzir-bug: roda contra o código ANTES da correção (trigger do
  //   tier não valida `ativo`). Não afirma que a invariante se mantém — só
  //   documenta o estado final para provar a falha.
  // modo=provar-fix: roda contra o código DEPOIS da correção. Afirma que o
  //   commit final NUNCA deixa tier ativo >= varejo.
  // ==========================================================================
  await scenario('1: reativar tier concorrente com baixar varejo (mesmo produto)', async ({ open, log }) => {
    const { produto } = criarProdutoComTier(fx, 'C1', { tierAtivo: false })

    const T1 = open('T1varejo')
    const T2 = open('T2tier')
    for (const s of [T1, T2]) {
      await Session.execTimed(s, `SET statement_timeout = '6s'; SET lock_timeout = '5s';`, `${s.name}: SET timeouts`)
    }

    await Session.execTimed(T1, `BEGIN;`, 'T1: BEGIN')
    await Session.execTimed(T2, `BEGIN;`, 'T2: BEGIN')

    // T1 baixa o varejo de 100 para 80. Trigger é deferrable — não valida
    // ainda, só enfileira o evento.
    const r1 = await Session.execTimed(T1, `UPDATE public.produtos SET preco_varejo = 80 WHERE id = '${produto}';`, 'T1: UPDATE varejo')
    assert.ok(!hasError(r1), `T1 UPDATE varejo não deveria falhar ainda (trigger deferida): ${r1}`)
    log('  T1 baixa varejo 100→80 (trigger deferida, ainda não valida).')

    // T2 (ainda sem commit) reativa o tier desativado (90). Enquanto T2 não
    // commitar, essa mudança é invisível para qualquer outra transação —
    // inclusive para a checagem deferida de T1 abaixo (MVCC read committed).
    const r2update = await Session.execTimed(T2, `UPDATE public.precos_atacado SET ativo = true WHERE produto_id = '${produto}';`, 'T2: UPDATE ativo=true (sem commit)')
    assert.ok(!hasError(r2update), `T2 UPDATE não deveria falhar de imediato: ${r2update}`)
    log('  T2 reativa o tier (90) — ainda sem commit, invisível para outras sessões.')

    // Força a checagem deferida de T1 a rodar AGORA, com T2 ainda aberto e
    // portanto sem ver a reativação. Isto reproduz deterministicamente (sem
    // depender de timing de wall-clock) o ponto exato da corrida: cada lado
    // valida contra um snapshot que não inclui a mudança do outro.
    const r1check = await Session.execTimed(
      T1,
      `SET CONSTRAINTS trg_validar_varejo_maior_que_tiers_ativos IMMEDIATE;`,
      'T1: SET CONSTRAINTS IMMEDIATE (força a checagem agora, com T2 ainda aberto)',
      8000,
    )
    assert.ok(!hasError(r1check), `T1 deveria passar aqui — T2 ainda não commitou, T1 não pode ver a reativação: ${r1check}`)
    log('  T1 passa na checagem forçada (não vê a reativação de T2, ainda não commitada).')

    await Session.execTimed(T1, `COMMIT;`, 'T1: COMMIT')
    log('  T1 commita — varejo=80 agora visível para outras sessões.')

    const r2commit = await Session.execTimed(T2, `COMMIT;`, 'T2: COMMIT (allow error)', 8000).catch((e) => `TIMEOUT: ${e.message}`)
    if (hasError(r2commit)) {
      log(`  T2 rejeitada no COMMIT: ${errorsOf(r2commit).join('; ')}`)
    } else {
      log('  T2 commita sem nenhuma checagem sobre a reativação (achado: trigger do tier não cobre `ativo`).')
    }

    const varejoFinal = Number(firstRow(runOnce(`SELECT preco_varejo FROM public.produtos WHERE id='${produto}';`)))
    const tierAtivoFinal = firstRow(runOnce(`SELECT ativo FROM public.precos_atacado WHERE produto_id='${produto}';`)).trim()
    const tierPrecoFinal = Number(firstRow(runOnce(`SELECT preco_unitario FROM public.precos_atacado WHERE produto_id='${produto}';`)))
    const invariante_violada = tierAtivoFinal === 't' && tierPrecoFinal >= varejoFinal

    log(`  Estado final persistido: varejo=${varejoFinal}, tier_ativo=${tierAtivoFinal}, tier_preco=${tierPrecoFinal}. Invariante violada = ${invariante_violada}.`)

    if (modo === 'reproduzir-bug') {
      assert.equal(invariante_violada, true, 'esperava reproduzir a falha (tier ativo >= varejo persistido) — se isto falhar, o bug pode já não existir mais neste código')
      log('  BUG REPRODUZIDO: tier ativo com preço >= varejo foi persistido sem rejeição.')
    } else {
      assert.equal(invariante_violada, false, `invariante violada no estado final: varejo=${varejoFinal} tier_ativo=${tierAtivoFinal} tier_preco=${tierPrecoFinal}`)
      log('  Invariante preservada: nenhum tier ativo com preço >= varejo foi persistido.')
    }
  })

  if (modo === 'provar-fix') {
    // ==========================================================================
    // CENÁRIO 2 — lock realmente serializa (não é coincidência de timing):
    // T1 segura o lock do produto (via UPDATE de varejo, não commitado); T2
    // tenta inserir um NOVO tier para o MESMO produto — deve bloquear de
    // verdade, provado por timeout, não por inspeção textual.
    // ==========================================================================
    await scenario('2: lock por produto_id bloqueia INSERT de tier concorrente com UPDATE de varejo', async ({ open, log }) => {
      const { produto } = criarProdutoComTier(fx, 'C2', { tierAtivo: true })

      const T1 = open('T1varejo2')
      const T2 = open('T2tierins')
      for (const s of [T1, T2]) {
        await Session.execTimed(s, `SET statement_timeout = '6s'; SET lock_timeout = '5s';`, `${s.name}: SET timeouts`)
      }

      await Session.execTimed(T1, `BEGIN;`, 'T1: BEGIN')
      const r1 = await Session.execTimed(T1, `UPDATE public.produtos SET preco_varejo = 200 WHERE id = '${produto}';`, 'T1: UPDATE varejo (sobe, sempre válido)')
      assert.ok(!hasError(r1), `T1 não deveria falhar: ${r1}`)
      // O lock advisory só é adquirido quando a trigger deferida dispara de
      // verdade — não no momento do UPDATE. Força o disparo agora (T1 ainda
      // sem commit) para que o lock fique retido pelo resto da transação de
      // T1 (advisory lock de escopo de transação: uma vez adquirido, só
      // libera no commit/rollback, mesmo que a checagem em si já tenha
      // terminado).
      const r1check = await Session.execTimed(T1, `SET CONSTRAINTS trg_validar_varejo_maior_que_tiers_ativos IMMEDIATE;`, 'T1: SET CONSTRAINTS IMMEDIATE (adquire e segura o lock)')
      assert.ok(!hasError(r1check), `T1 não deveria falhar aqui (200 > tier 90): ${r1check}`)
      log('  T1 força a própria checagem agora — passa e SEGURA o lock do produto_id pelo resto da transação.')

      await Session.execTimed(T2, `BEGIN;`, 'T2: BEGIN')
      const r2insert = await Session.execTimed(T2, `INSERT INTO public.precos_atacado (produto_id, quantidade_minima, preco_unitario, ativo) VALUES ('${produto}', 20, 150, true);`, 'T2: INSERT tier (sem commit ainda)')
      assert.ok(!hasError(r2insert), `T2 INSERT não deveria falhar de imediato (checagem é deferida): ${r2insert}`)
      // Força a checagem de T2 agora — é aqui que T2 tenta adquirir o MESMO
      // lock que T1 está segurando, e deve bloquear de verdade.
      const checkPromise = T2.exec(`SET CONSTRAINTS trg_validar_tier_preco_menor_que_varejo IMMEDIATE;`)
      const probe = await Session.pending(checkPromise, 900)
      assert.equal(probe.pending, true, 'T2 (checagem do novo tier) deveria BLOQUEAR no lock compartilhado por produto_id enquanto T1 o segura')
      log('  T2 (checagem do novo tier) BLOQUEIA de verdade — prova real de contenção de lock, não inspeção textual.')

      await Session.execTimed(T1, `COMMIT;`, 'T1: COMMIT')
      const r2check = await Session.raceTimeout(checkPromise, 8000, 'T2 destravar após T1 commitar')
      assert.ok(!hasError(r2check), `T2 deveria suceder após T1 commitar (150 < 200, varejo já visível): ${r2check}`)
      await Session.execTimed(T2, `COMMIT;`, 'T2: COMMIT')
      log('  T1 commita (libera o lock), T2 destrava, relê o varejo já em 200 — tier de 150 é válido, aceito.')
    })

    // ==========================================================================
    // CENÁRIO 3 — trigger deferida usa o estado FINAL da linha, não o NEW
    // congelado do evento: dois UPDATEs de preco_varejo na mesma transação
    // (100→80→120) com tier ativo em 90 devem aceitar o estado final (120),
    // não rejeitar pelo passo intermediário (80).
    // ==========================================================================
    await scenario('3: múltiplos UPDATEs de preco_varejo na mesma transação — valida só o estado final', async ({ open, log }) => {
      const { produto } = criarProdutoComTier(fx, 'C3', { tierAtivo: true })

      const T1 = open('T1multistep')
      await Session.execTimed(T1, `SET statement_timeout = '6s';`, 'T1: SET timeout')
      await Session.execTimed(T1, `BEGIN;`, 'T1: BEGIN')
      await Session.execTimed(T1, `UPDATE public.produtos SET preco_varejo = 80 WHERE id = '${produto}';`, 'T1: varejo 100->80')
      await Session.execTimed(T1, `UPDATE public.produtos SET preco_varejo = 120 WHERE id = '${produto}';`, 'T1: varejo 80->120')
      const r = await Session.execTimed(T1, `COMMIT;`, 'T1: COMMIT (allow error)')
      assert.ok(!hasError(r), `commit não deveria rejeitar o estado final válido (120 > tier 90) por causa do passo intermediário (80): ${r}`)
      log('  COMMIT aceito: dois UPDATEs de preco_varejo (100→80→120) na mesma transação validam só o estado final (120), não o passo intermediário (80).')

      const varejoFinal = Number(firstRow(runOnce(`SELECT preco_varejo FROM public.produtos WHERE id='${produto}';`)))
      assert.equal(varejoFinal, 120, `varejo final deveria ser 120, veio ${varejoFinal}`)
    })
  }

  const summary = results.every((r) => r.ok)
  console.log('\n--- resumo ---')
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  — ${r.detail}` : ''}`)
  process.exit(summary ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
