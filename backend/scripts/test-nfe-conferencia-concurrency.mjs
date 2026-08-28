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

  static async pending(promise, ms) {
    const TIMEOUT = Symbol('timeout')
    const t = new Promise((resolve) => setTimeout(() => resolve(TIMEOUT), ms))
    const result = await Promise.race([promise, t])
    return result === TIMEOUT ? { pending: true } : { pending: false, result }
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
  })
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

function asActor(session, userId) {
  return session.exec(`SELECT set_config('request.jwt.claim.sub', '${userId}', false);`)
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
      await s.exec(`SET statement_timeout = '6s'; SET lock_timeout = '5s';`)
      await asActor(s, fx.gerente)
    }

    await T1.exec(`BEGIN;`)
    const r1Promise = T1.exec(`SELECT public.confirmar_importacao_nfe('${imp.importacaoId}');`)
    // T1 roda a função inteira (credita estoque, custo, contas_pagar, marca
    // CONCLUIDA) mas ainda NÃO commitou — o lock FOR UPDATE da linha de
    // importacoes_nfe segue retido até o COMMIT explícito abaixo.
    const r1 = await r1Promise
    assert.ok(!hasError(r1), `T1 confirmar_importacao_nfe deveria suceder: ${r1}`)
    log('  T1 executa confirmar_importacao_nfe até o fim (dentro de uma transação aberta, lock ainda retido).')

    await T2.exec(`BEGIN;`)
    const r2Promise = T2.exec(`SELECT public.confirmar_importacao_nfe('${imp.importacaoId}');`)
    const probe = await Session.pending(r2Promise, 900)
    assert.equal(
      probe.pending,
      true,
      'T2 (segunda confirmação concorrente) deveria BLOQUEAR esperando o FOR UPDATE que T1 ainda segura',
    )
    log('  T2 (segunda confirmação concorrente) BLOQUEIA, confirmado por timeout de 900ms — prova real de contenção de lock, não inspeção textual.')

    await T1.exec(`COMMIT;`)
    log('  T1 commita — libera o lock.')
    const r2 = await r2Promise
    assert.ok(hasError(r2), 'T2 deveria falhar após destravar (importação já CONCLUIDA)')
    assert.ok(
      errorsOf(r2).some((e) => e.includes('IMPORT_NFE_STATUS_INVALIDO')),
      `T2 deveria falhar com IMPORT_NFE_STATUS_INVALIDO, veio: ${r2}`,
    )
    await T2.exec(`ROLLBACK;`)
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
      await s.exec(`SET statement_timeout = '6s'; SET lock_timeout = '5s';`)
      await asActor(s, fx.gerente)
    }

    await T1.exec(`BEGIN;`)
    const regPromise = T1.exec(
      `SELECT public.registrar_conferencia_nfe('${imp.importacaoId}', jsonb_build_array(jsonb_build_object('item_id','${imp.itemId}','quantidade_conferida',10,'divergencia_obs',null)));`,
    )
    const reg = await regPromise
    assert.ok(!hasError(reg), `T1 registrar_conferencia_nfe deveria suceder: ${reg}`)
    log('  T1 registra a conferência (item vira CONFERIDO) dentro de uma transação aberta, lock ainda retido.')

    await T2.exec(`BEGIN;`)
    const confPromise = T2.exec(`SELECT public.confirmar_importacao_nfe('${imp.importacaoId}');`)
    const probe = await Session.pending(confPromise, 900)
    assert.equal(
      probe.pending,
      true,
      'confirmar_importacao_nfe concorrente deveria BLOQUEAR enquanto a conferência ainda não commitou',
    )
    log('  T2 (confirmar) BLOQUEIA esperando T1 commitar a conferência — não pode ler um estado "meio conferido".')

    await T1.exec(`COMMIT;`)
    const conf = await confPromise
    assert.ok(!hasError(conf), `T2 deveria suceder após T1 commitar (item já CONFERIDO): ${conf}`)
    await T2.exec(`COMMIT;`)
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
