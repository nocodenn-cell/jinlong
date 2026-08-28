#!/usr/bin/env node
/**
 * PR1 (FLX-05 UI) — concorrência real de confirmar_importacao_nfe /
 * registrar_conferencia_nfe, com duas sessões PostgreSQL independentes (não
 * duas chamadas sequenciais dentro da mesma transação/conexão).
 *
 * Gate exigido antes do merge da PR #341: a prova estática de que o corpo
 * das RPCs contém `FOR UPDATE` (nfe-conferencia-flx05-ui.test.sql, passo 8)
 * não basta — é preciso provar que duas chamadas concorrentes de verdade não
 * produzem dupla confirmação, crédito duplicado de estoque, custo
 * duplicado/incorreto, contas a pagar duplicadas ou transição de status
 * inválida.
 *
 * Harness idêntico ao de test-commission-concurrency.mjs (mesmo arquivo,
 * mesma técnica): duas sessões `psql` interativas persistentes,
 * sincronizadas por marcador. Cada `Session.exec(sql)` devolve uma Promise
 * ligada ao próximo marcador — permite enviar um comando que vai bloquear
 * numa sessão, seguir com a outra, e só depois `await` o resultado pendente.
 *
 * Uso:
 *   node scripts/test-nfe-conferencia-concurrency.mjs
 *   npm run test:financial-concurrency:nfe -w fastproduct-backend
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
    if (process.env.DEBUG_NFE_CONCURRENCY === '1') {
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
    if (process.env.DEBUG_NFE_CONCURRENCY === '1') {
      process.stderr.write(`[${this.name}] sent ${id}\n`)
    }
    this._drain()
    return p
  }

  /**
   * Achado da SEGUNDA execução deste harness em CI: um `RAISE EXCEPTION` do
   * lado do servidor aborta a transação inteira, e o `SELECT` do marcador
   * (enviado no MESMO lote por exec()) também falha nesse estado — nunca
   * imprime o texto esperado, e a Promise nunca resolve (hang silencioso,
   * sem erro nenhum no log). `ROLLBACK TO SAVEPOINT` é uma das poucas
   * instruções que o Postgres aceita mesmo com a transação já abortada —
   * recupera o estado antes do marcador, então ele sempre chega. Só usar
   * para chamadas cujo efeito NÃO precisa sobreviver além desta própria
   * chamada (o savepoint desfaz qualquer efeito, inclusive de um sucesso
   * inesperado — o que é o comportamento certo aqui: se a chamada deveria
   * falhar e não falhou, o teste tem que acusar isso, não persistir o dado).
   */
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

  /**
   * Achado da PRIMEIRA execução deste harness em CI: sem isto, um exec()
   * aguardado diretamente (fora de Session.pending, ou seja, um comando que
   * NÃO deveria bloquear) que por qualquer motivo nunca produz o marcador
   * trava a Promise para sempre — e como spawnSync (runOnce/run-financial-
   * tests.mjs) não tem timeout próprio, isso trava o job inteiro de CI até o
   * timeout de 40min do workflow, sem nenhum diagnóstico. Todo await direto
   * de exec() neste arquivo passa por aqui: falha rápido e nomeado.
   */
  static async execTimed(session, sql, label, ms = 8000) {
    return Session.raceTimeout(session.exec(sql), ms, `[${session.name}] ${label} — SQL: ${sql.slice(0, 200)}`)
  }

  /** Envolve uma Promise (já em voo) com um prazo — usa quando o exec() já foi disparado antes. */
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
  // timeout: sem isto, spawnSync não tem limite algum — uma query que trava
  // no servidor (ou um psql que nunca fecha por algum motivo) trava o
  // processo Node inteiro (e o job de CI) sem diagnóstico até o timeout de
  // 40min do workflow. Achado na primeira execução deste harness em CI.
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

// ---------------------------------------------------------------------------
// Fixture: loja + gerente + categoria + fornecedor, criados uma vez.
// ---------------------------------------------------------------------------

function setupFixture() {
  const loja = uuid()
  const gerente = uuid()
  const categoria = uuid()

  runOnce(`INSERT INTO auth.users (id) VALUES ('${gerente}') ON CONFLICT (id) DO NOTHING;`)
  runOnce(
    `INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES ('${loja}', 'NFE-CONC Loja', 'NFECONC-A', true) ON CONFLICT (id) DO UPDATE SET ativo = true;`,
  )
  runOnce(
    `INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES ('${gerente}', 'NFE-CONC Gerente', 'GERENTE', true, '${loja}') ON CONFLICT (id) DO UPDATE SET perfil='GERENTE', ativo=true, loja_id='${loja}';`,
  )
  runOnce(
    `INSERT INTO public.categorias (id, nome) VALUES ('${categoria}', 'NFE-CONC Categoria') ON CONFLICT (id) DO UPDATE SET nome=EXCLUDED.nome;`,
  )

  return { loja, gerente, categoria }
}

/** Importa 1 item novo via importar_nfe_transacao; devolve {importacaoId, itemId, produtoId}. */
function criarImportacaoComUmItem(fx, refSuffix, custo) {
  const chave = ('35260800000000000000550010000000' + Math.floor(Math.random() * 1e9)).padEnd(44, '0').slice(0, 44)
  const cnpj = String(10000000000000 + Math.floor(Math.random() * 89999999999999)).slice(0, 14)
  // set_config(..., false) é escopo de sessão — precisa estar na MESMA
  // invocação de psql que chama a RPC (cada runOnce() abre uma conexão nova).
  runOnce(`
    SELECT set_config('request.jwt.claim.sub', '${fx.gerente}', false);
    SELECT public.importar_nfe_transacao(
      '${chave}', 'NFECONC-${refSuffix}', '${cnpj}', 'NFE-CONC Fornecedor', '${fx.loja}',
      jsonb_build_array(jsonb_build_object(
        'nome_produto', 'NFE-CONC Produto ${refSuffix}', 'gtin', null,
        'ref_fornecedor', 'REF-CONC-${refSuffix}', 'ncm', null, 'u_com', 'UN',
        'q_com', 10, 'v_un_com', ${custo}, 'fator', 1,
        'atualizar_custo', true, 'acao', 'CRIAR', 'produto_id_destino', null
      )),
      true, null
    );
  `)
  const importacaoId = firstRow(
    runOnce(
      `SELECT id::text FROM public.importacoes_nfe WHERE chave_acesso='${chave}';`,
    ),
  ).trim()
  const itemId = firstRow(
    runOnce(
      `SELECT id::text FROM public.importacoes_nfe_itens WHERE importacao_nfe_id='${importacaoId}';`,
    ),
  ).trim()
  const produtoId = firstRow(
    runOnce(`SELECT produto_id::text FROM public.importacoes_nfe_itens WHERE id='${itemId}';`),
  ).trim()
  return { importacaoId, itemId, produtoId }
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
  // Watchdog global: nenhum bug neste harness (dos dois cenários, cada um
  // com prazo próprio de 8s por chamada) deveria levar mais que uma dúzia de
  // segundos de verdade. Achado na primeira execução deste script em CI: sem
  // um limite absoluto, um hang não-previsto trava o job inteiro até o
  // timeout de 40min do workflow, sem log nenhum de progresso. force-exit
  // aqui é aceitável — este processo só faz I/O de teste, nada para persistir.
  const watchdog = setTimeout(() => {
    console.error('\n##[error] WATCHDOG: test-nfe-conferencia-concurrency.mjs excedeu 45s — abortando para não travar o job de CI.')
    process.exit(1)
  }, 45_000)
  watchdog.unref?.() // não impede o processo de terminar naturalmente antes disso

  console.log(`Concorrência NF-e (PR1/FLX-05) — conexão: ${PSQL.label}\n`)
  const fx = setupFixture()
  console.log(`fixture: loja=${fx.loja} gerente=${fx.gerente}`)

  // ==========================================================================
  // CENÁRIO 1 — Duas chamadas concorrentes de confirmar_importacao_nfe na
  // MESMA importação já totalmente conferida. É o cenário exato descrito
  // pela revisão: "dois gerentes, duas abas".
  // ==========================================================================
  await scenario('1: confirmar_importacao_nfe concorrente na mesma importacao', async ({ open, log }) => {
    const imp = criarImportacaoComUmItem(fx, 'C1', 50.0)
    // Confere o item fora de qualquer transação aberta, para ficar pronto para confirmar.
    runOnce(
      `SELECT set_config('request.jwt.claim.sub', '${fx.gerente}', false); SELECT public.registrar_conferencia_nfe('${imp.importacaoId}', jsonb_build_array(jsonb_build_object('item_id','${imp.itemId}','quantidade_conferida',10,'divergencia_obs',null)));`,
    )

    const saldoAntes = Number(firstRow(runOnce(`SELECT COALESCE(quantidade_atual,0) FROM public.estoque WHERE produto_id='${imp.produtoId}' AND loja_id='${fx.loja}';`)) || 0)
    assert.equal(saldoAntes, 0, 'saldo deveria ser 0 antes de qualquer confirmação')

    const T1 = open('T1conf')
    const T2 = open('T2conf')
    for (const s of [T1, T2]) {
      await Session.execTimed(s, `SET statement_timeout = '6s'; SET lock_timeout = '5s';`, `${s.name}: SET timeouts`)
      await Session.execTimed(s, `SELECT set_config('request.jwt.claim.sub', '${fx.gerente}', false);`, `${s.name}: asActor`)
    }

    await Session.execTimed(T1, `BEGIN;`, 'T1: BEGIN')
    // T1 roda a função inteira (credita estoque, custo, contas_pagar, marca
    // CONCLUIDA) mas ainda NÃO commitou — o lock FOR UPDATE da linha de
    // importacoes_nfe segue retido até o COMMIT explícito abaixo. Prazo de
    // 8s: se o lock nunca resolver do lado do servidor por algum motivo,
    // falha nomeando exatamente esta chamada, em vez de travar o job.
    const r1Promise = T1.exec(`SELECT public.confirmar_importacao_nfe('${imp.importacaoId}');`)
    const r1 = await Session.raceTimeout(r1Promise, 8000, 'T1: confirmar_importacao_nfe (1ª chamada)')
    assert.ok(!hasError(r1), `T1 confirmar_importacao_nfe deveria suceder: ${r1}`)
    log('  T1 executa confirmar_importacao_nfe até o fim (dentro de uma transação aberta, lock ainda retido).')

    await Session.execTimed(T2, `BEGIN;`, 'T2: BEGIN')
    // execAllowError: esta chamada, quando destravar, DEVE falhar
    // (IMPORT_NFE_STATUS_INVALIDO) — sem o savepoint, o RAISE EXCEPTION
    // aborta a transação e o marcador do próprio exec() nunca chega
    // (achado da 2ª execução deste harness em CI, ver comentário no método).
    const r2Promise = T2.execAllowError(`SELECT public.confirmar_importacao_nfe('${imp.importacaoId}');`)
    const probe = await Session.pending(r2Promise, 900)
    assert.equal(
      probe.pending,
      true,
      'T2 (segunda confirmação concorrente) deveria BLOQUEAR esperando o FOR UPDATE que T1 ainda segura',
    )
    log('  T2 (segunda confirmação concorrente) BLOQUEIA, confirmado por timeout de 900ms — prova real de contenção de lock, não inspeção textual.')

    await Session.execTimed(T1, `COMMIT;`, 'T1: COMMIT')
    log('  T1 commita — libera o lock.')
    const r2 = await Session.raceTimeout(r2Promise, 8000, 'T2 destravar após T1 commitar')
    assert.ok(hasError(r2), 'T2 deveria falhar após destravar (importação já CONCLUIDA)')
    assert.ok(
      errorsOf(r2).some((e) => e.includes('IMPORT_NFE_STATUS_INVALIDO')),
      `T2 deveria falhar com IMPORT_NFE_STATUS_INVALIDO, veio: ${r2}`,
    )
    await Session.execTimed(T2, `ROLLBACK;`, 'T2: ROLLBACK')
    log('  T2 destrava, relê status já CONCLUIDA, recusa com IMPORT_NFE_STATUS_INVALIDO — sem dupla confirmação.')

    // Estado final: prova de ausência de duplicação em CADA superfície citada
    // pela revisão — estoque, kardex, custo, contas_pagar, status.
    const saldoDepois = Number(firstRow(runOnce(`SELECT quantidade_atual FROM public.estoque WHERE produto_id='${imp.produtoId}' AND loja_id='${fx.loja}';`)))
    assert.equal(saldoDepois, 10, `saldo deveria ser creditado exatamente 1x (10), veio ${saldoDepois} — crédito duplicado de estoque`)

    const movimentos = Number(firstRow(runOnce(`SELECT count(*) FROM public.movimentos_estoque_log WHERE produto_id='${imp.produtoId}' AND tipo_codigo='ENTRADA_NFE';`)))
    assert.equal(movimentos, 1, `deveria existir exatamente 1 linha de kardex ENTRADA_NFE, vieram ${movimentos}`)

    const custo = Number(firstRow(runOnce(`SELECT preco_custo FROM public.produtos WHERE id='${imp.produtoId}';`)))
    assert.equal(custo, 50.0, `custo deveria ser 50.00 (aplicado 1x, não duplicado/incorreto), veio ${custo}`)

    const statusFinal = firstRow(runOnce(`SELECT status FROM public.importacoes_nfe WHERE id='${imp.importacaoId}';`)).trim()
    assert.equal(statusFinal, 'CONCLUIDA', `status final deveria ser CONCLUIDA (transição única e válida), veio ${statusFinal}`)

    log(`  Estado final verificado: saldo=${saldoDepois} (1x), kardex=${movimentos} linha, custo=${custo}, status=${statusFinal}. Nenhuma duplicação em nenhuma das 4 superfícies.`)
  })

  // ==========================================================================
  // CENÁRIO 2 — registrar_conferencia_nfe concorrente com
  // confirmar_importacao_nfe na mesma importação: confirmar não pode
  // "passar por baixo" de uma conferência em andamento.
  // ==========================================================================
  await scenario('2: registrar_conferencia_nfe concorrente com confirmar_importacao_nfe', async ({ open, log }) => {
    const imp = criarImportacaoComUmItem(fx, 'C2', 30.0)

    const T1 = open('T1reg')
    const T2 = open('T2conf2')
    for (const s of [T1, T2]) {
      await Session.execTimed(s, `SET statement_timeout = '6s'; SET lock_timeout = '5s';`, `${s.name}: SET timeouts`)
      await Session.execTimed(s, `SELECT set_config('request.jwt.claim.sub', '${fx.gerente}', false);`, `${s.name}: asActor`)
    }

    await Session.execTimed(T1, `BEGIN;`, 'T1: BEGIN')
    const regPromise = T1.exec(
      `SELECT public.registrar_conferencia_nfe('${imp.importacaoId}', jsonb_build_array(jsonb_build_object('item_id','${imp.itemId}','quantidade_conferida',10,'divergencia_obs',null)));`,
    )
    const reg = await Session.raceTimeout(regPromise, 8000, 'T1: registrar_conferencia_nfe')
    assert.ok(!hasError(reg), `T1 registrar_conferencia_nfe deveria suceder: ${reg}`)
    log('  T1 registra a conferência (item vira CONFERIDO) dentro de uma transação aberta, lock ainda retido.')

    await Session.execTimed(T2, `BEGIN;`, 'T2: BEGIN')
    const confPromise = T2.exec(`SELECT public.confirmar_importacao_nfe('${imp.importacaoId}');`)
    const probe = await Session.pending(confPromise, 900)
    assert.equal(
      probe.pending,
      true,
      'confirmar_importacao_nfe concorrente deveria BLOQUEAR enquanto a conferência ainda não commitou',
    )
    log('  T2 (confirmar) BLOQUEIA esperando T1 commitar a conferência — não pode ler um estado "meio conferido".')

    await Session.execTimed(T1, `COMMIT;`, 'T1: COMMIT')
    const conf = await Session.raceTimeout(confPromise, 8000, 'T2 destravar após T1 commitar a conferência')
    assert.ok(!hasError(conf), `T2 deveria suceder após T1 commitar (item já CONFERIDO): ${conf}`)
    await Session.execTimed(T2, `COMMIT;`, 'T2: COMMIT')
    log('  T1 commita; T2 destrava, relê o item já CONFERIDO, confirma normalmente — nenhuma leitura de estado intermediário.')

    const saldo = Number(firstRow(runOnce(`SELECT quantidade_atual FROM public.estoque WHERE produto_id='${imp.produtoId}' AND loja_id='${fx.loja}';`)))
    assert.equal(saldo, 10, `saldo deveria ser 10 (creditado 1x, após a conferência real), veio ${saldo}`)
    const statusFinal = firstRow(runOnce(`SELECT status FROM public.importacoes_nfe WHERE id='${imp.importacaoId}';`)).trim()
    assert.equal(statusFinal, 'CONCLUIDA')
    log(`  Estado final: saldo=${saldo}, status=${statusFinal}.`)
  })

  const summary = results.every((r) => r.ok)
  console.log('\n--- resumo ---')
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  — ${r.detail}` : ''}`)
  process.exit(summary ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
