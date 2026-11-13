#!/usr/bin/env node
/**
 * DB-05F — concorrência real de comissões, com duas sessões PostgreSQL
 * independentes (não duas chamadas sequenciais dentro da mesma transação).
 *
 * Harness mínimo: abre N sessões `psql` interativas (via `docker exec -i` ou
 * `psql <url>`, mesma resolução de conexão de `run-financial-tests.mjs`) e
 * sincroniza cada passo por um marcador. O marcador é uma instrução SQL
 * comum (`SELECT '__MARK_n__'`), não um metacomando `\echo` -- em alguns
 * hosts Windows, o `\` inicial de um `\echo` enviado por stdin através de
 * `docker exec -i` chega mutilado ao psql (a barra some e "echo ..." vira um
 * erro de sintaxe SQL). O SELECT literal não depende do parser de metacomandos.
 *
 * Cada `Session.exec(sql)` devolve uma Promise ligada ao próximo marcador —
 * o chamador decide QUANDO aguardar. Isso permite forçar interleavings
 * reais: enviar um comando que vai bloquear numa outra sessão, continuar
 * mandando comandos na primeira, e só depois `await` o resultado que ficou
 * pendente.
 *
 * Uso:
 *   node scripts/test-commission-concurrency.mjs
 *   npm run test:financial-concurrency -w fastproduct-backend
 */

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'

function hasPsql() {
  const r = spawnSync('psql', ['--version'], { encoding: 'utf8' })
  return r.status === 0
}

/** Devolve {bin, args} prontos para `spawn(bin, args)` -- sem shell. */
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

/** Uma sessão psql interativa persistente, com stdout+stderr mesclados num único buffer ordenado. */
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
    if (process.env.DEBUG_COMMISSION_CONCURRENCY === '1') {
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

  /**
   * Envia SQL e devolve uma Promise para o texto produzido até o próximo
   * marcador. NÃO force await aqui se o comando puder bloquear -- capture a
   * Promise, siga com outra sessão, e só aguarde quando fizer sentido no
   * cenário.
   */
  exec(sql) {
    if (this.exited) throw new Error(`sessao ${this.name} ja encerrada (exit ${this.exitCode})`)
    const id = `__MARK_${this.name}_${this.seq++}__`
    const marker = `${id}\n`
    const p = new Promise((resolve) => {
      this.waiters.push({ marker, resolve })
    })
    this.proc.stdin.write(sql.trimEnd() + `\nSELECT '${id}';\n`)
    if (process.env.DEBUG_COMMISSION_CONCURRENCY === '1') {
      process.stderr.write(`[${this.name}] sent ${id}\n`)
    }
    this._drain()
    return p
  }

  /** Corrida contra um timeout: diz se o exec() mais recente ainda está pendente. */
  static async pending(promise, ms) {
    const TIMEOUT = Symbol('timeout')
    const t = new Promise((resolve) => setTimeout(() => resolve(TIMEOUT), ms))
    const result = await Promise.race([promise, t])
    return result === TIMEOUT ? { pending: true } : { pending: false, result }
  }

  close() {
    if (!this.exited) {
      this.proc.stdin.end('\\q\n')
    }
  }
}

function hasError(text) {
  return /ERROR:/.test(text)
}

function errorsOf(text) {
  return [...text.matchAll(/ERROR:\s*(.+)/g)].map((m) => m[1].trim())
}

function firstRow(text) {
  // saída "-A": colunas separadas por '|', uma linha por registro. Ignora
  // linhas de erro/contexto e linhas de contagem "(N rows)".
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('ERROR:') && !l.startsWith('CONTEXT:') && !l.startsWith('LINE ') && !l.startsWith('HINT:') && !/^\(\d+ rows?\)$/.test(l) && !/^\^\s*$/.test(l)
      // continuação do CONTEXT (envelope multiempresa: "SQL function ... statement N" / PL/pgSQL)
      && !/^(SQL function|PL\/pgSQL function|SQL statement)\b/.test(l))
  return line ?? ''
}

// ---------------------------------------------------------------------------
// Fixture compartilhada: uma única loja/produto/caixa/usuários, criados uma
// vez via chamadas psql curtas e não-interativas (spawnSync), reaproveitados
// por todos os cenários via UUIDs literais interpolados no SQL de cada sessão.
// ---------------------------------------------------------------------------

function runOnce(sql) {
  const r = spawnSync(PSQL.bin, [...PSQL.args, '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], {
    input: sql,
    encoding: 'utf8',
  })
  if (r.status !== 0) {
    throw new Error(`setup falhou: ${r.stderr || r.stdout}`)
  }
  return r.stdout
}

function setupFixture() {
  const loja = runOnce(`
    SELECT p.loja_id FROM public.produtos p
    WHERE p.preco_varejo > 0
      AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.loja_id = p.loja_id AND u.ativo AND u.perfil = 'GERENTE')
      AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.loja_id = p.loja_id AND u.ativo AND u.perfil = 'OPERADOR')
      AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.loja_id = p.loja_id AND u.ativo AND u.perfil = 'DONO')
    ORDER BY p.loja_id, p.id LIMIT 1;
  `).trim()
  if (!loja) throw new Error('fixture: nenhuma loja elegível encontrada (rode o seed local antes)')

  const operador = runOnce(`SELECT id FROM public.usuarios WHERE perfil='OPERADOR' AND ativo AND loja_id='${loja}' LIMIT 1;`).trim()
  const gerente = runOnce(`SELECT id FROM public.usuarios WHERE perfil='GERENTE' AND ativo AND loja_id='${loja}' LIMIT 1;`).trim()
  const dono = runOnce(`SELECT id FROM public.usuarios WHERE perfil='DONO' AND ativo AND loja_id='${loja}' LIMIT 1;`).trim()
  const produto = runOnce(`SELECT id FROM public.produtos WHERE loja_id='${loja}' AND preco_varejo > 0 ORDER BY id LIMIT 1;`).trim()
  const preco = runOnce(`SELECT preco_varejo FROM public.produtos WHERE id='${produto}';`).trim()

  runOnce(`UPDATE public.caixas SET status='FECHADO', data_fechamento=now(), valor_fechamento=COALESCE(saldo_atual,0), fechamento_diferenca=0 WHERE loja_id='${loja}' AND status='ABERTO';`)
  const caixa = runOnce(`SELECT gen_random_uuid();`).trim()
  runOnce(`INSERT INTO public.caixas(id, operador_id, loja_id, status, valor_inicial) VALUES ('${caixa}', NULL, '${loja}', 'ABERTO', 1000);`)
  runOnce(`DELETE FROM public.precos_atacado WHERE produto_id='${produto}';`)
  runOnce(`
    INSERT INTO public.estoque(produto_id, loja_id, quantidade_atual) VALUES ('${produto}','${loja}',100000)
    ON CONFLICT (produto_id, loja_id) DO UPDATE SET quantidade_atual = 100000;
  `)
  // D5 (20261107110000): PIX exige conta financeira vinculada à forma na loja.
  runOnce(`
    WITH c AS (
      INSERT INTO public.contas_financeiras (id, loja_id, nome, tipo, ativo, data_inicial, criado_por)
      SELECT gen_random_uuid(), '${loja}', 'Fixture conta D5 (concorrencia)', 'BANCO', true, current_date, '${gerente}'
      WHERE NOT EXISTS (SELECT 1 FROM public.financeiro_contas_forma WHERE loja_id='${loja}' AND forma_pagamento='PIX')
      RETURNING id
    )
    INSERT INTO public.financeiro_contas_forma (loja_id, forma_pagamento, conta_financeira_id)
    SELECT '${loja}', f.forma, c.id FROM c CROSS JOIN unnest(ARRAY['PIX','CARTAO_DEBITO','CARTAO_CREDITO']) AS f(forma)
    ON CONFLICT (loja_id, forma_pagamento) DO NOTHING;
  `)
  runOnce(`
    INSERT INTO public.empresas (id, nome) VALUES ('fa5e0000-0000-4000-8000-0000000000f1', 'Fixture empresa (concorrencia)') ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.configuracoes_gerais(empresa_id, chave, valor, tipo_dado) VALUES ('fa5e0000-0000-4000-8000-0000000000f1', 'comissao_padrao_percentual','5','percent')
    ON CONFLICT (empresa_id, chave) DO UPDATE SET valor='5';
  `)

  return { loja, operador, gerente, dono, produto, preco, caixa }
}

function uuid() {
  return runOnce(`SELECT gen_random_uuid();`).trim()
}

/** Cria uma venda concluída de `qtd` unidades e devolve {venda, item, comissao, valor}. */
function criarVendaComComissao(fx, qtd, operador) {
  const venda = uuid()
  const item = uuid()
  runOnce(`
    SELECT public.registrar_venda_com_itens('${venda}','${fx.caixa}','${operador}','PIX',
      round(${fx.preco} * ${qtd}, 2), 0, round(${fx.preco} * ${qtd}, 2),
      jsonb_build_array(jsonb_build_object('item_id','${item}','produto_id','${fx.produto}',
        'quantidade',${qtd},'preco_original',${fx.preco},'preco_unitario',${fx.preco})), NULL, NULL, NULL);
  `)
  const comissao = runOnce(`SELECT id FROM public.comissoes_vendedores WHERE venda_id='${venda}';`).trim()
  const valor = runOnce(`SELECT valor_comissao FROM public.comissoes_vendedores WHERE venda_id='${venda}';`).trim()
  return { venda, item, comissao, valor: Number(valor) }
}

/** Injeta a claim de ator (GERENTE/DONO/ADMIN) que `liquidar_comissoes` exige via auth.uid(). */
function asActor(session, userId) {
  return session.exec(`SELECT set_config('request.jwt.claim.sub', '${userId}', false);`)
}

// ---------------------------------------------------------------------------
// Runner de cenários
// ---------------------------------------------------------------------------

const results = []
const report = []

function log(line) {
  console.log(line)
  report.push(line)
}

async function scenario(name, fn) {
  console.log(`\n=== ${name} ===`)
  report.push(`\n## ${name}`)
  const sessions = []
  try {
    await fn({
      open: (label) => {
        const s = new Session(label)
        sessions.push(s)
        return s
      },
      log,
    })
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
  console.log(`Concorrência de comissões — conexão: ${PSQL.label}\n`)
  const fx = setupFixture()
  console.log(`fixture: loja=${fx.loja} operador=${fx.operador} gerente=${fx.gerente} dono=${fx.dono} preco=${fx.preco}`)

  // ==========================================================================
  // CENÁRIO 1 — Pagamento × devolução na MESMA comissão, duas ordens de chegada
  // ==========================================================================
  await scenario('1: pagamento x devolucao (mesma comissao, duas ordens de chegada)', async ({ open, log }) => {
    // ---- Ordem 1a: T1 (pagamento) trava a linha primeiro; T2 (devolução) espera ----
    const v = criarVendaComComissao(fx, 10, fx.dono)
    const T1 = open('T1a')
    const T2 = open('T2a')
    for (const s of [T1, T2]) await s.exec(`SET statement_timeout = '6s'; SET lock_timeout = '5s';`)
    await asActor(T1, fx.gerente)

    await T1.exec(`BEGIN;`)
    const lockT1 = await T1.exec(
      `SELECT id FROM public.comissoes_vendedores WHERE id='${v.comissao}' FOR UPDATE;`,
    )
    assert.ok(!hasError(lockT1), `T1 lock falhou: ${lockT1}`)
    log('  [1a] T1 (locks comissoes_vendedores dentro de uma transacao aberta, simulando o inicio de liquidar_comissoes) trava a linha primeiro.')

    const oper = uuid()
    await T2.exec(`BEGIN;`)
    const insOpPromise = T2.exec(`
      INSERT INTO public.venda_pos_venda_operacoes(id, idempotency_key, venda_id, tipo, motivo,
        valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, caixa_id)
      VALUES ('${oper}', 'conc1a-${oper}', '${v.venda}', 'DEVOLUCAO', 'concorrencia 1a',
        round(${fx.preco}*4,2), round(${fx.preco}*4,2), 'DINHEIRO', '${fx.dono}', '${fx.caixa}');
      INSERT INTO public.venda_pos_venda_itens(operacao_id, item_venda_id, produto_id, quantidade, preco_unitario, subtotal)
      VALUES ('${oper}', '${v.item}', '${fx.produto}', 4, ${fx.preco}, round(${fx.preco}*4,2));
      SET CONSTRAINTS ALL IMMEDIATE;
    `)
    const probe = await Session.pending(insOpPromise, 900)
    assert.equal(probe.pending, true, 'T2 (devolucao) deveria bloquear esperando o lock que T1 ja segura na linha de comissoes_vendedores')
    log('  [1a] T2 (devolucao, gatilho deferido dispara processar_ajuste_comissao_venda) BLOQUEIA, confirmado por timeout de 900ms.')

    const duringBlock = runOnce(`SELECT count(*) FROM public.comissoes_ajustes WHERE venda_id='${v.venda}';`).trim()
    assert.equal(duringBlock, '0', 'nenhum ajuste deveria existir enquanto T2 esta bloqueada')

    await T1.exec(`COMMIT;`)
    log('  [1a] T1 commita (libera o lock sem alterar nada -- so segurou pra provar o bloqueio).')
    const insOpResult = await insOpPromise
    assert.ok(!hasError(insOpResult), `T2 deveria ter sucesso apos T1 commitar: ${insOpResult}`)
    await T2.exec(`COMMIT;`)

    const ajusteFinal = firstRow(
      runOnce(`SELECT count(*), COALESCE(SUM(valor),0) FROM public.comissoes_ajustes WHERE venda_id='${v.venda}';`),
    ).split('|')
    assert.equal(ajusteFinal[0], '1', 'devia existir exatamente 1 ajuste apos o desbloqueio')
    assert.equal(Number(ajusteFinal[1]), Number((v.valor * 0.4).toFixed(2)), 'ajuste incorreto')
    log(`  [1a] estado final: 1 ajuste de ${ajusteFinal[1]} (esperado ${(v.valor * 0.4).toFixed(2)}). Nenhum lost update.`)

    // ---- Ordem 1b: T3 (devolução) trava a linha primeiro; T4 (pagamento) espera ----
    const v2 = criarVendaComComissao(fx, 10, fx.dono)
    const T3 = open('T3b')
    const T4 = open('T4b')
    for (const s of [T3, T4]) await s.exec(`SET statement_timeout = '6s'; SET lock_timeout = '5s';`)
    await asActor(T4, fx.gerente)

    const oper2 = uuid()
    await T3.exec(`BEGIN;`)
    const devResult = await T3.exec(`
      INSERT INTO public.venda_pos_venda_operacoes(id, idempotency_key, venda_id, tipo, motivo,
        valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, caixa_id)
      VALUES ('${oper2}', 'conc1b-${oper2}', '${v2.venda}', 'DEVOLUCAO', 'concorrencia 1b',
        round(${fx.preco}*10,2), round(${fx.preco}*10,2), 'DINHEIRO', '${fx.dono}', '${fx.caixa}');
      INSERT INTO public.venda_pos_venda_itens(operacao_id, item_venda_id, produto_id, quantidade, preco_unitario, subtotal)
      VALUES ('${oper2}', '${v2.item}', '${fx.produto}', 10, ${fx.preco}, round(${fx.preco}*10,2));
      SET CONSTRAINTS ALL IMMEDIATE;
    `)
    assert.ok(!hasError(devResult), `T3 devolucao total deveria suceder (linha ainda destravada): ${devResult}`)
    log('  [1b] T3 (devolucao total, 100%) ja rodou o gatilho deferido e AINDA SEGURA o lock de comissoes_vendedores (transacao nao commitada).')

    await T4.exec(`BEGIN;`)
    const payPromise = T4.exec(
      `SELECT * FROM public.liquidar_comissoes('${fx.loja}','${fx.dono}', ARRAY['${v2.comissao}']::uuid[], 'conc1b-pay-${v2.venda}');`,
    )
    const probe2 = await Session.pending(payPromise, 900)
    assert.equal(probe2.pending, true, 'T4 (pagamento) deveria bloquear esperando o lock que T3 ja segura')
    log('  [1b] T4 (liquidar_comissoes) BLOQUEIA, confirmado por timeout de 900ms.')

    await T3.exec(`COMMIT;`)
    log('  [1b] T3 commita a devolucao total.')
    const payResult = await payPromise
    assert.ok(!hasError(payResult), `pagamento deveria suceder apos T3 commitar: ${payResult}`)
    await T4.exec(`COMMIT;`)

    const cols = firstRow(payResult).split('|')
    // pagamento_id|valor_bruto|valor_compensado|valor_liquido|comissoes_pagas|idempotent_replay
    assert.equal(Number(cols[3]), 0, `pagamento apos devolucao TOTAL deveria ser liquido 0, veio ${payResult}`)
    assert.equal(Number(cols[2]), v2.valor, 'valor compensado deveria ser igual a comissao original inteira')
    log(`  [1b] estado final: bruto=${cols[1]} compensado=${cols[2]} liquido=${cols[3]}. Pagamento nunca excedeu o saldo economico valido (devolucao total -> liquido 0).`)
  })

  // ==========================================================================
  // CENÁRIO 2 — Dois pagamentos com chaves diferentes para a mesma comissão
  // ==========================================================================
  await scenario('2: dois pagamentos simultaneos (mesma comissao, chaves diferentes)', async ({ open, log }) => {
    const v = criarVendaComComissao(fx, 10, fx.dono)
    const T1 = open('T1pay')
    const T2 = open('T2pay')
    for (const s of [T1, T2]) {
      await s.exec(`SET statement_timeout='6s'; SET lock_timeout='5s';`)
      await asActor(s, fx.gerente)
    }

    await T1.exec(`BEGIN;`)
    await T1.exec(`SELECT id FROM public.comissoes_vendedores WHERE id='${v.comissao}' FOR UPDATE;`)
    const p2 = T2.exec(`SELECT * FROM public.liquidar_comissoes('${fx.loja}','${fx.dono}',ARRAY['${v.comissao}']::uuid[],'conc2-b-${v.venda}');`)
    assert.equal((await Session.pending(p2, 900)).pending, true, 'segundo pagamento deveria esperar o lock da comissao')
    log('  T1 segura RowShareLock/row lock via FOR UPDATE; T2 espera na mesma linha.')

    const r1 = await T1.exec(`SELECT * FROM public.liquidar_comissoes('${fx.loja}','${fx.dono}',ARRAY['${v.comissao}']::uuid[],'conc2-a-${v.venda}');`)
    assert.ok(!hasError(r1), `primeiro pagamento falhou: ${r1}`)
    await T1.exec(`COMMIT;`)
    const r2 = await p2
    // stderr e stdout são pipes distintos; em Windows o marcador stdout pode
    // ser observado antes da mensagem ERROR em stderr. A prova autoritativa é
    // o estado persistido abaixo, não a ordem de chegada dos dois streams.
    assert.equal(firstRow(r2), '', `segundo pagamento nao deveria retornar lote: ${r2}`)

    if (process.env.DB05F_FALSIFY_DOUBLE_PAYMENT === '1') {
      // Falsificação controlada: simula a antiga condição vulnerável em que
      // uma segunda chave podia materializar outro fato de pagamento sem
      // possuir a comissão. O assert de contagem abaixo TEM de ficar vermelho.
      runOnce(`INSERT INTO public.comissoes_pagamentos(loja_id,operador_id,valor_bruto,valor_compensado,valor_liquido,pago_por,idempotency_key) VALUES('${fx.loja}','${fx.dono}',${v.valor},0,${v.valor},'${fx.gerente}','conc2-b-${v.venda}');`)
    }

    const state = firstRow(runOnce(`SELECT count(*), count(*) FILTER (WHERE status='pago'), count(DISTINCT pagamento_id) FROM public.comissoes_vendedores WHERE id='${v.comissao}';`)).split('|')
    assert.deepEqual(state, ['1', '1', '1'])
    assert.equal(runOnce(`SELECT count(*) FROM public.comissoes_pagamentos WHERE idempotency_key IN ('conc2-a-${v.venda}','conc2-b-${v.venda}');`).trim(), '1')
    log('  Resultado: uma linha paga, um pagamento persistido; a segunda chave nao produz segundo pagamento.')
  })

  // ==========================================================================
  // CENÁRIO 3 — Mesmo ajuste em duas sessões
  // ==========================================================================
  await scenario('3: mesmo ajuste simultaneo (uma origem logica)', async ({ open, log }) => {
    const v = criarVendaComComissao(fx, 10, fx.dono)
    const oper = uuid()
    runOnce(`BEGIN;
      ALTER TABLE public.venda_pos_venda_operacoes DISABLE TRIGGER trg_pos_venda_ajusta_comissao_deferido;
      INSERT INTO public.venda_pos_venda_operacoes(id,idempotency_key,venda_id,tipo,motivo,valor_estornado,valor_caixa_estornado,forma_estorno,operador_id,caixa_id)
      VALUES('${oper}','conc3-${oper}','${v.venda}','DEVOLUCAO','conc3',round(${fx.preco}*4,2),round(${fx.preco}*4,2),'DINHEIRO','${fx.dono}','${fx.caixa}');
      INSERT INTO public.venda_pos_venda_itens(operacao_id,item_venda_id,produto_id,quantidade,preco_unitario,subtotal)
      VALUES('${oper}','${v.item}','${fx.produto}',4,${fx.preco},round(${fx.preco}*4,2));
      ALTER TABLE public.venda_pos_venda_operacoes ENABLE TRIGGER trg_pos_venda_ajusta_comissao_deferido;
      COMMIT;`)

    const T1 = open('T1adj')
    const T2 = open('T2adj')
    for (const s of [T1, T2]) await s.exec(`SET statement_timeout='6s'; SET lock_timeout='5s'; BEGIN;`)
    await T1.exec(`SELECT public.processar_ajuste_comissao_venda('${v.venda}','DEVOLUCAO','${oper}');`)
    const p2 = T2.exec(`SELECT public.processar_ajuste_comissao_venda('${v.venda}','DEVOLUCAO','${oper}');`)
    assert.equal((await Session.pending(p2, 900)).pending, true, 'retry concorrente deveria esperar FOR UPDATE da comissao')
    log('  T1 bloqueia comissoes_vendedores; T2 espera antes de consultar/inserir a mesma idempotency key.')
    await T1.exec(`COMMIT;`)
    assert.ok(!hasError(await p2))
    await T2.exec(`COMMIT;`)
    assert.equal(runOnce(`SELECT count(*) FROM public.comissoes_ajustes WHERE idempotency_key='DEVOLUCAO:${oper}';`).trim(), '1')
    log('  Resultado: 1 evento logico = exatamente 1 ajuste.')
  })

  // ==========================================================================
  // CENÁRIO 4 — Cancelamento e nascimento da comissão em ordens opostas
  // ==========================================================================
  await scenario('4: cancelamento x geracao da comissao (duas ordens)', async ({ open, log }) => {
    const criarSemComissao = () => {
      const venda = uuid(); const item = uuid()
      runOnce(`BEGIN;
        ALTER TABLE public.itens_venda DISABLE TRIGGER trg_itens_venda_comissao;
        INSERT INTO public.vendas(id,caixa_id,operador_id,total_bruto,total_desconto,total_liquido,forma_pagamento,status)
        VALUES('${venda}','${fx.caixa}','${fx.dono}',${fx.preco},0,${fx.preco},'PIX','CONCLUIDA');
        INSERT INTO public.itens_venda(id,venda_id,produto_id,quantidade,preco_unitario_original,preco_unitario,desconto_unitario,tipo_preco)
        VALUES('${item}','${venda}','${fx.produto}',1,${fx.preco},${fx.preco},0,'VAREJO');
        ALTER TABLE public.itens_venda ENABLE TRIGGER trg_itens_venda_comissao;
        COMMIT;`)
      return { venda, item }
    }

    const a = criarSemComissao()
    const T1 = open('T1gen'); const T2 = open('T2cancel')
    for (const s of [T1, T2]) await s.exec(`SET statement_timeout='6s'; SET lock_timeout='5s'; BEGIN;`)
    await T1.exec(`SELECT internal.apurar_comissao_original('${a.venda}');`)
    const cancelA = T2.exec(`SELECT public.cancelar_venda_transacional('${a.venda}','conc4 ordem A','${fx.gerente}');`)
    assert.equal((await Session.pending(cancelA, 900)).pending, true, 'cancelamento deveria esperar a comissao nao commitada')
    await T1.exec(`COMMIT;`)
    assert.ok(!hasError(await cancelA))
    await T2.exec(`COMMIT;`)

    const b = criarSemComissao()
    const T3 = open('T3cancel'); const T4 = open('T4gen')
    for (const s of [T3, T4]) await s.exec(`SET statement_timeout='6s'; SET lock_timeout='5s'; BEGIN;`)
    await T3.exec(`SELECT public.cancelar_venda_transacional('${b.venda}','conc4 ordem B','${fx.gerente}');`)
    const genB = T4.exec(`SELECT internal.apurar_comissao_original('${b.venda}');`)
    assert.equal((await Session.pending(genB, 900)).pending, true, 'geracao atrasada deveria esperar o fato criado pelo cancelamento')
    await T3.exec(`COMMIT;`)
    assert.ok(!hasError(await genB))
    await T4.exec(`COMMIT;`)

    for (const venda of [a.venda, b.venda]) {
      const state = firstRow(runOnce(`SELECT (SELECT count(*) FROM public.comissoes_vendedores WHERE venda_id='${venda}'),(SELECT count(*) FROM public.comissoes_ajustes WHERE venda_id='${venda}'),(SELECT valor_liquido FROM public.comissoes_vendedores_liquidas WHERE venda_id='${venda}');`)).split('|')
      assert.deepEqual(state, ['1', '1', '0.00'])
    }
    log('  As duas ordens convergem para 1 comissao, 1 ajuste e saldo zero.')
  })

  // ==========================================================================
  // CENÁRIO 5 — Duas devoluções legítimas e distintas
  // ==========================================================================
  await scenario('5: duas devolucoes diferentes concorrentes', async ({ open, log }) => {
    const v = criarVendaComComissao(fx, 10, fx.dono)
    const o1 = uuid(); const o2 = uuid()
    const T1 = open('T1dev'); const T2 = open('T2dev')
    for (const s of [T1, T2]) await s.exec(`SET statement_timeout='6s'; SET lock_timeout='5s'; BEGIN; SET CONSTRAINTS ALL DEFERRED;`)
    await T1.exec(`INSERT INTO public.venda_pos_venda_operacoes(id,idempotency_key,venda_id,tipo,motivo,valor_estornado,valor_caixa_estornado,forma_estorno,operador_id,caixa_id) VALUES('${o1}','conc5-${o1}','${v.venda}','DEVOLUCAO','conc5a',round(${fx.preco}*2,2),round(${fx.preco}*2,2),'DINHEIRO','${fx.dono}','${fx.caixa}'); INSERT INTO public.venda_pos_venda_itens(operacao_id,item_venda_id,produto_id,quantidade,preco_unitario,subtotal) VALUES('${o1}','${v.item}','${fx.produto}',2,${fx.preco},round(${fx.preco}*2,2));`)
    await T2.exec(`INSERT INTO public.venda_pos_venda_operacoes(id,idempotency_key,venda_id,tipo,motivo,valor_estornado,valor_caixa_estornado,forma_estorno,operador_id,caixa_id) VALUES('${o2}','conc5-${o2}','${v.venda}','DEVOLUCAO','conc5b',round(${fx.preco}*3,2),round(${fx.preco}*3,2),'DINHEIRO','${fx.dono}','${fx.caixa}'); INSERT INTO public.venda_pos_venda_itens(operacao_id,item_venda_id,produto_id,quantidade,preco_unitario,subtotal) VALUES('${o2}','${v.item}','${fx.produto}',3,${fx.preco},round(${fx.preco}*3,2));`)
    await T1.exec(`SET CONSTRAINTS ALL IMMEDIATE;`)
    const p2 = T2.exec(`SET CONSTRAINTS ALL IMMEDIATE;`)
    assert.equal((await Session.pending(p2, 900)).pending, true, 'segunda devolucao deveria serializar na comissao')
    await T1.exec(`COMMIT;`)
    assert.ok(!hasError(await p2))
    await T2.exec(`COMMIT;`)

    const rows = firstRow(runOnce(`SELECT count(*),count(DISTINCT origem_id),COALESCE(sum(valor),0) FROM public.comissoes_ajustes WHERE venda_id='${v.venda}';`)).split('|')
    assert.equal(rows[0], '2'); assert.equal(rows[1], '2')
    const esperado = Number(runOnce(`SELECT public.round_abnt(GREATEST(0,cv.valor_comissao-c.o_valor),2) FROM public.comissoes_vendedores cv CROSS JOIN LATERAL internal.calcular_comissao_venda(cv.venda_id,true) c WHERE cv.id='${v.comissao}';`).trim())
    assert.equal(Number(rows[2]), esperado)
    log(`  Dois eventos e duas chaves preservados; ajuste acumulado=${rows[2]}.`)
  })

  // ==========================================================================
  // CENÁRIO 6 — Pagamento vence a serialização; ajuste nasce depois
  // ==========================================================================
  await scenario('6: pagamento x nascimento de novo ajuste', async ({ open, log }) => {
    // Usa o OPERADOR seedado, enquanto os cenarios anteriores usam o DONO,
    // para que ajustes deliberadamente pendentes de outros cenarios nao
    // contaminem o saldo economico deste interleaving. Mesmo assim, uma
    // execucao anterior deste MESMO script contra o mesmo banco local (sem
    // reset) pode ter deixado debito nao compensado para esse operador --
    // por isso a asserção é relativa ao saldo pré-existente, não a um valor
    // absoluto. Isso prova a mesma propriedade (o pagamento consome só a
    // dívida que já existia antes do lock, nunca a que nasceu depois)
    // independente do histórico acumulado no banco local.
    const debitoPreExistente = Number(
      firstRow(
        runOnce(
          `SELECT COALESCE(ajuste_nao_compensado,0) FROM public.comissoes_saldo_operador WHERE loja_id='${fx.loja}' AND operador_id='${fx.operador}';`,
        ),
      ) || 0,
    )
    const v = criarVendaComComissao(fx, 10, fx.operador)
    const oper = uuid()
    runOnce(`BEGIN; ALTER TABLE public.venda_pos_venda_operacoes DISABLE TRIGGER trg_pos_venda_ajusta_comissao_deferido; INSERT INTO public.venda_pos_venda_operacoes(id,idempotency_key,venda_id,tipo,motivo,valor_estornado,valor_caixa_estornado,forma_estorno,operador_id,caixa_id) VALUES('${oper}','conc6-${oper}','${v.venda}','DEVOLUCAO','conc6',round(${fx.preco}*4,2),round(${fx.preco}*4,2),'DINHEIRO','${fx.dono}','${fx.caixa}'); INSERT INTO public.venda_pos_venda_itens(operacao_id,item_venda_id,produto_id,quantidade,preco_unitario,subtotal) VALUES('${oper}','${v.item}','${fx.produto}',4,${fx.preco},round(${fx.preco}*4,2)); ALTER TABLE public.venda_pos_venda_operacoes ENABLE TRIGGER trg_pos_venda_ajusta_comissao_deferido; COMMIT;`)
    const T1 = open('T1settle'); const T2 = open('T2newadj')
    for (const s of [T1, T2]) await s.exec(`SET statement_timeout='6s'; SET lock_timeout='5s'; BEGIN;`)
    await asActor(T1, fx.gerente)
    await T1.exec(`SELECT id FROM public.comissoes_vendedores WHERE id='${v.comissao}' FOR UPDATE;`)
    const adj = T2.exec(`SELECT public.processar_ajuste_comissao_venda('${v.venda}','DEVOLUCAO','${oper}');`)
    assert.equal((await Session.pending(adj, 900)).pending, true, 'novo ajuste deveria esperar o pagamento que serializou primeiro')
    const pay = await T1.exec(`SELECT * FROM public.liquidar_comissoes('${fx.loja}','${fx.operador}',ARRAY['${v.comissao}']::uuid[],'conc6-pay-${v.venda}');`)
    const liquidoPago = Number(firstRow(pay).split('|')[3])
    const esperadoLiquido = Number((v.valor - Math.min(debitoPreExistente, v.valor)).toFixed(2))
    assert.equal(liquidoPago, esperadoLiquido,
      `pagamento deveria consumir so o debito PRE-EXISTENTE (${debitoPreExistente}), nunca o ajuste concorrente ainda bloqueado`)
    await T1.exec(`COMMIT;`)
    assert.ok(!hasError(await adj)); await T2.exec(`COMMIT;`)
    const audit = firstRow(runOnce(`SELECT valor,valor_consumido,valor_pendente FROM public.comissoes_ajustes_auditoria WHERE origem_id='${oper}';`)).split('|')
    assert.equal(Number(audit[0]), Number((v.valor * 0.4).toFixed(2)))
    assert.equal(Number(audit[1]), 0); assert.equal(Number(audit[2]), Number(audit[0]))
    log(`  Debito pre-existente=${debitoPreExistente.toFixed(2)}; pagamento serializado antes pagou ${liquidoPago.toFixed(2)} (esperado ${esperadoLiquido.toFixed(2)}); ajuste posterior ${audit[0]} permanece integralmente pendente, sem consumo fantasma.`)
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
