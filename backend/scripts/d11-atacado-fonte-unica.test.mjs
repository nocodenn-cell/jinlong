// D-11: fonte única de atacado (cadastro do produto). Teste PGlite com esquema mínimo.
//
// Prova, contra a migration 20261107120000 real:
//  - invariantes do cadastro (gatilho >= 1; atacado < varejo) e que linhas legadas
//    inválidas não quebram edições não relacionadas;
//  - resolução de preço transitória (faixa ativa vence) e pelo cadastro (fonte 'produto');
//  - auditoria de preço/gatilho com motivo;
//  - plano de migração (somente leitura) e execução com motivo, sem apagar faixas;
//  - seleção manual só para GERENTE/DONO, com motivo e mesma loja;
//  - permissões de execução (anon/authenticated sem EXECUTE na execução do plano);
//  - paridade SQL do fixture compartilhado com shared-core (mesmo fixture usado pelo spec TS).
//
// Rodar: PGLITE_MODULE=<caminho do index.js do @electric-sql/pglite> node backend/scripts/d11-atacado-fonte-unica.test.mjs
// (sem PGLITE_MODULE, resolve '@electric-sql/pglite' a partir de backend/)

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const moduleName = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(moduleName)
const db = new PGlite()

const migration = await readFile(new URL('../supabase/migrations/20261107120000_d11_atacado_fonte_unica_produto.sql', import.meta.url), 'utf8')
const fixture = JSON.parse(await readFile(new URL('../../shared-core/src/pricing/fixtures/d11-paridade.json', import.meta.url), 'utf8'))

const LOJA1 = '00000000-0000-4000-8000-0000000000a1'
const LOJA2 = '00000000-0000-4000-8000-0000000000a2'
const LOJAS = { L1: LOJA1, L2: LOJA2 }
const DONO = '00000000-0000-4000-8000-0000000000d1'
const GERENTE = '00000000-0000-4000-8000-0000000000e1'
const OPERADOR = '00000000-0000-4000-8000-0000000000f1'
const GERENTE_L2 = '00000000-0000-4000-8000-0000000000e2'

// Esquema mínimo. auth.uid() lê o GUC request.jwt.sub, como o Supabase faz via JWT.
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('request.jwt.sub', true), '')::uuid $$;
  CREATE TABLE usuarios(id uuid PRIMARY KEY, perfil text, loja_id uuid, ativo boolean);
  CREATE TABLE produtos(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    loja_id uuid, nome text,
    preco_varejo numeric(10,2), preco_atacado numeric(10,2),
    quantidade_gatilho_atacado integer DEFAULT 0,
    ativo boolean DEFAULT true
  );
  CREATE TABLE precos_atacado(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    produto_id uuid NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
    loja_id uuid,
    quantidade_minima integer NOT NULL,
    preco_unitario numeric NOT NULL,
    ativo boolean NOT NULL DEFAULT true
  );
  INSERT INTO usuarios VALUES
    ('${DONO}', 'DONO', NULL, true),
    ('${GERENTE}', 'GERENTE', '${LOJA1}', true),
    ('${GERENTE_L2}', 'GERENTE', '${LOJA2}', true),
    ('${OPERADOR}', 'OPERADOR', '${LOJA1}', true);
  INSERT INTO auth.users SELECT id FROM usuarios;
`)

// ── Estado legado ANTES da migration (espelha homologação: gatilho = 0 com atacado) ──
const seed = await db.query(`
  INSERT INTO produtos (loja_id, nome, preco_varejo, preco_atacado, quantidade_gatilho_atacado)
  VALUES
    ('${LOJA1}', 'legado_invalido', 20, 15, 0),
    ('${LOJA1}', 'p1_so_faixa', 100, NULL, 0),
    ('${LOJA1}', 'p2_multiplas_faixas', 100, NULL, 0),
    ('${LOJA1}', 'p3_conflito', 100, 85, 8),
    ('${LOJA1}', 'p4_faixa_de_loja', 100, NULL, 0)
  RETURNING id, nome
`)
const pid = Object.fromEntries(seed.rows.map(r => [r.nome, r.id]))
await db.exec(`
  INSERT INTO precos_atacado (produto_id, loja_id, quantidade_minima, preco_unitario, ativo) VALUES
    ('${pid.p1_so_faixa}', NULL, 10, 80, true),
    ('${pid.p2_multiplas_faixas}', NULL, 5, 90, true),
    ('${pid.p2_multiplas_faixas}', NULL, 20, 70, true),
    ('${pid.p3_conflito}', NULL, 10, 80, true),
    ('${pid.p4_faixa_de_loja}', '${LOJA1}', 3, 95, true);
`)
const tiersAntes = (await db.query('SELECT count(*)::int AS n FROM precos_atacado')).rows[0].n

await db.exec(migration)

async function asUser(uid) {
  await db.exec(`SELECT set_config('request.jwt.sub', '${uid ?? ''}', false)`)
}
async function motivo(texto) {
  await db.exec(`SELECT set_config('app.d11_motivo', '${texto}', false)`)
}
async function expectError(fn, fragment) {
  let err = null
  try { await fn() } catch (e) { err = e }
  assert.ok(err, `esperava erro contendo ${fragment}`)
  assert.match(String(err.message), new RegExp(fragment))
  return err
}
async function calc(produto, q, loja = LOJA1) {
  const { rows } = await db.query('SELECT public.calcular_preco_produto($1,$2,$3)::text AS j', [produto, q, loja])
  return JSON.parse(rows[0].j)
}

const results = []
async function caso(nome, fn) {
  try {
    await fn()
    results.push(['PASSOU', nome])
  } catch (e) {
    results.push(['FALHOU', nome, e.message])
    throw e
  }
}

try {
  await caso('legado inválido não bloqueia edição de nome (trigger só dispara nas colunas de preço)', async () => {
    await db.exec(`UPDATE produtos SET nome = 'legado_invalido_renomeado' WHERE id = '${pid.legado_invalido ?? ''}' OR nome = 'legado_invalido'`)
    const r = await db.query("SELECT nome FROM produtos WHERE id = $1", [seed.rows[0].id])
    assert.equal(r.rows[0].nome, 'legado_invalido_renomeado')
    await db.exec(`UPDATE produtos SET nome = 'legado_invalido' WHERE id = '${seed.rows[0].id}'`)
  })

  await caso('trigger rejeita atacado >= varejo', async () => {
    await expectError(
      () => db.exec(`INSERT INTO produtos (loja_id, nome, preco_varejo, preco_atacado, quantidade_gatilho_atacado) VALUES ('${LOJA1}','x',50,50,1)`),
      'ATACADO_NAO_MENOR_QUE_VAREJO',
    )
  })

  await caso('trigger rejeita atacado com quantidade mínima < 1', async () => {
    await expectError(
      () => db.exec(`INSERT INTO produtos (loja_id, nome, preco_varejo, preco_atacado, quantidade_gatilho_atacado) VALUES ('${LOJA1}','x',50,40,0)`),
      'ATACADO_QUANTIDADE_MINIMA_INVALIDA',
    )
    await expectError(
      () => db.exec(`INSERT INTO produtos (loja_id, nome, preco_varejo, preco_atacado, quantidade_gatilho_atacado) VALUES ('${LOJA1}','x',50,40,NULL)`),
      'ATACADO_QUANTIDADE_MINIMA_INVALIDA',
    )
  })

  await caso('trigger aceita produto sem atacado (gatilho 0 é válido sem preço)', async () => {
    await db.exec(`INSERT INTO produtos (loja_id, nome, preco_varejo, preco_atacado, quantidade_gatilho_atacado) VALUES ('${LOJA1}','sem_atacado',50,NULL,0)`)
  })

  await caso('trigger bloqueia mexer em preço de produto legado inválido (gatilho 0) até corrigir o cadastro', async () => {
    await expectError(
      () => db.exec(`UPDATE produtos SET preco_varejo = 10 WHERE id = '${seed.rows[0].id}'`),
      'ATACADO_QUANTIDADE_MINIMA_INVALIDA',
    )
  })

  // Produto de teste do cadastro novo (fonte 'produto')
  const { rows: [novo] } = await db.query(`
    INSERT INTO produtos (loja_id, nome, preco_varejo, preco_atacado, quantidade_gatilho_atacado)
    VALUES ('${LOJA1}', 'cadastro_novo', 100, 85, 8) RETURNING id`)
  const cadastroNovo = novo.id

  await caso('resolução: abaixo do gatilho vai para varejo; no gatilho vai para cadastro (fonte produto)', async () => {
    assert.deepEqual(await calc(cadastroNovo, 7), { preco: 100, tipo: 'VAREJO', fonte: 'varejo', regra_id: null, quantidade_minima: null })
    const r = await calc(cadastroNovo, 8)
    assert.equal(r.preco, 85)
    assert.equal(r.tipo, 'ATACADO')
    assert.equal(r.fonte, 'produto')
    assert.equal(r.quantidade_minima, 8)
  })

  await caso('resolução transitória: faixa ativa vence cadastro; tier de outra loja não casa', async () => {
    assert.equal((await calc(pid.p1_so_faixa, 10)).fonte, 'tier')
    assert.equal((await calc(pid.p1_so_faixa, 9)).fonte, 'varejo')
    assert.equal((await calc(pid.p4_faixa_de_loja, 3, LOJA2)).fonte, 'varejo')
    assert.equal((await calc(pid.p4_faixa_de_loja, 3, LOJA1)).fonte, 'tier')
  })

  await caso('quantidade inválida e produto inexistente mantêm erros da RPC', async () => {
    assert.equal((await calc(cadastroNovo, 0)).erro, 'quantidade_invalida')
    assert.equal((await calc('00000000-0000-4000-8000-00000000ffff', 5)).erro, 'produto_nao_encontrado')
  })

  await caso('auditoria: alteração de preço/gatilho grava anterior, novo e motivo', async () => {
    await asUser(DONO)
    await motivo('ajuste de teste da auditoria D-11')
    await db.exec(`UPDATE produtos SET preco_atacado = 84 WHERE id = '${cadastroNovo}'`)
    const { rows } = await db.query(`
      SELECT preco_atacado_anterior::float8 AS ant, preco_atacado_novo::float8 AS novo, motivo, origem, alterado_por
      FROM historico_atacado_produto WHERE produto_id = $1 ORDER BY alterado_em DESC LIMIT 1`, [cadastroNovo])
    assert.equal(rows[0].ant, 85)
    assert.equal(rows[0].novo, 84)
    assert.equal(rows[0].motivo, 'ajuste de teste da auditoria D-11')
    assert.equal(rows[0].origem, 'CADASTRO')
    assert.equal(rows[0].alterado_por, DONO)
    await motivo('')
  })

  await caso('plano de migração classifica faixas sem alterar dados', async () => {
    const { rows } = await db.query(`
      SELECT produto_id, decisao FROM d11_plano_migracao_faixas_atacado() ORDER BY decisao`)
    const porProduto = {}
    for (const r of rows) (porProduto[r.produto_id] ??= []).push(r.decisao)
    assert.deepEqual(porProduto[pid.p1_so_faixa], ['MIGRAR'])
    assert.deepEqual(porProduto[pid.p2_multiplas_faixas], ['NAO_MIGRADA_MULTIPLAS_FAIXAS', 'NAO_MIGRADA_MULTIPLAS_FAIXAS'])
    assert.deepEqual(porProduto[pid.p3_conflito], ['NAO_MIGRADA_CONFLITO'])
    assert.deepEqual(porProduto[pid.p4_faixa_de_loja], ['NAO_MIGRADA_FAIXA_DE_LOJA'])
    assert.equal((await db.query('SELECT count(*)::int AS n FROM precos_atacado WHERE ativo')).rows[0].n, tiersAntes)
  })

  await caso('execução exige motivo com pelo menos 10 caracteres', async () => {
    await expectError(() => db.query("SELECT public.d11_executar_migracao_faixas_atacado('curto')"), 'D11_MOTIVO_OBRIGATORIO')
  })

  await caso('execução: migra faixa única, desativa todas e preserva as linhas', async () => {
    const { rows: [res] } = await db.query("SELECT public.d11_executar_migracao_faixas_atacado('Migração D-11 homologação de teste') AS r")
    assert.deepEqual(res.r, { migradas: 1, nao_migradas_desativadas: 4 })
    const p1 = (await db.query('SELECT preco_atacado::float8 AS pa, quantidade_gatilho_atacado AS g FROM produtos WHERE id = $1', [pid.p1_so_faixa])).rows[0]
    assert.deepEqual(p1, { pa: 80, g: 10 })
    assert.equal((await db.query('SELECT count(*)::int AS n FROM precos_atacado WHERE ativo')).rows[0].n, 0)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM precos_atacado')).rows[0].n, tiersAntes)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM d11_migracao_faixas_log')).rows[0].n, 5)
    const hist = (await db.query("SELECT count(*)::int AS n FROM historico_atacado_produto WHERE produto_id = $1 AND origem = 'MIGRACAO_FAIXA'", [pid.p1_so_faixa])).rows[0].n
    assert.equal(hist, 1)
  })

  await caso('depois da execução vale o cadastro: produto migrado e faixas antigas não mudam o preço', async () => {
    assert.equal((await calc(pid.p1_so_faixa, 9)).fonte, 'varejo')
    const r = await calc(pid.p1_so_faixa, 10)
    assert.equal(r.fonte, 'produto')
    assert.equal(r.preco, 80)
    assert.equal((await calc(pid.p2_multiplas_faixas, 25)).fonte, 'varejo')
  })

  await caso('execução é idempotente: segunda rodada não migra nem reativa faixas', async () => {
    const { rows: [res] } = await db.query("SELECT public.d11_executar_migracao_faixas_atacado('Segunda rodada de teste D-11') AS r")
    assert.deepEqual(res.r, { migradas: 0, nao_migradas_desativadas: 0 })
  })

  await caso('permissões: execução e plano só para service_role', async () => {
    const q = (fn, role) => db.query('SELECT has_function_privilege($1, $2, $3) AS ok', [role, fn, 'EXECUTE'])
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await q('public.d11_executar_migracao_faixas_atacado(text)', role)).rows[0].ok, false, `${role} executa`)
      assert.equal((await q('public.d11_plano_migracao_faixas_atacado()', role)).rows[0].ok, false, `${role} lê plano`)
    }
    assert.equal((await q('public.d11_executar_migracao_faixas_atacado(text)', 'service_role')).rows[0].ok, true)
    assert.equal((await q('public.registrar_selecao_manual_atacado(uuid,integer,text)', 'anon')).rows[0].ok, false)
    assert.equal((await q('public.registrar_selecao_manual_atacado(uuid,integer,text)', 'authenticated')).rows[0].ok, true)
  })

  await caso('seleção manual: GERENTE da loja aplica atacado com motivo e fica auditada', async () => {
    await asUser(GERENTE)
    const r = (await db.query('SELECT public.registrar_selecao_manual_atacado($1, $2, $3)::text AS j',
      [cadastroNovo, 3, 'Cliente fiel, combinado com a gerência'])).rows[0].j
    const j = JSON.parse(r)
    assert.equal(j.preco_aplicado, 84)
    assert.equal(Number(j.preco_sugerido), 100)
    assert.equal(j.tipo_sugerido, 'VAREJO')
    const { rows } = await db.query('SELECT perfil, usuario_id, motivo FROM selecoes_manuais_atacado WHERE id = $1', [j.id])
    assert.deepEqual(rows[0], { perfil: 'GERENTE', usuario_id: GERENTE, motivo: 'Cliente fiel, combinado com a gerência' })
  })

  await caso('seleção manual nega OPERADOR, motivo curto, outra loja e produto sem atacado', async () => {
    await asUser(OPERADOR)
    await expectError(() => db.query('SELECT public.registrar_selecao_manual_atacado($1,$2,$3)', [cadastroNovo, 3, 'motivo valido aqui']), 'SELECAO_MANUAL_PERMISSAO_NEGADA')
    await asUser(GERENTE)
    await expectError(() => db.query('SELECT public.registrar_selecao_manual_atacado($1,$2,$3)', [cadastroNovo, 3, 'curto']), 'SELECAO_MANUAL_MOTIVO_OBRIGATORIO')
    await asUser(GERENTE_L2)
    await expectError(() => db.query('SELECT public.registrar_selecao_manual_atacado($1,$2,$3)', [cadastroNovo, 3, 'motivo valido aqui']), 'SELECAO_MANUAL_LOJA_DIVERGENTE')
    await asUser(GERENTE)
    await expectError(() => db.query('SELECT public.registrar_selecao_manual_atacado($1,$2,$3)', [pid.p2_multiplas_faixas, 3, 'motivo valido aqui']), 'SELECAO_MANUAL_SEM_PRECO_ATACADO')
  })

  await caso('seleção manual: DONO de qualquer loja pode', async () => {
    await asUser(DONO)
    const { rows } = await db.query('SELECT public.registrar_selecao_manual_atacado($1,$2,$3)::text AS j', [cadastroNovo, 4, 'Ajuste pontual autorizado pelo dono'])
    assert.equal(JSON.parse(rows[0].j).preco_aplicado, 84)
  })

  // Paridade SQL do fixture (mesma matriz do spec TS de shared-core)
  await caso('paridade SQL: fixture D-11 bate com o contrato compartilhado', async () => {
    await db.exec('ALTER TABLE produtos DISABLE TRIGGER trg_d11_validar_cadastro_atacado')
    await asUser(null)
    try {
      for (const c of fixture.casos) {
        const { rows: [prod] } = await db.query(
          `INSERT INTO produtos (loja_id, nome, preco_varejo, preco_atacado, quantidade_gatilho_atacado, ativo)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [LOJA1, `fixture_${c.id}`, c.produto.preco_varejo, c.produto.preco_atacado, c.produto.quantidade_gatilho_atacado, c.produto.ativo])
        for (const t of c.tiers) {
          await db.query(
            'INSERT INTO precos_atacado (produto_id, loja_id, quantidade_minima, preco_unitario, ativo) VALUES ($1,$2,$3,$4,$5)',
            [prod.id, t.loja ? LOJAS[t.loja] : null, t.quantidade_minima, t.preco_unitario, t.ativo])
        }
        const loja = c.loja ? LOJAS[c.loja] : null
        const q = Math.max(0, Math.floor(c.quantidade))
        const got = await calc(prod.id, q, loja)
        const esp = c.esperado
        if (esp.ok) {
          assert.equal(got.erro, undefined, `${c.id}: erro inesperado ${got.erro}`)
          assert.equal(Number(got.preco), esp.preco, `${c.id}: preco`)
          assert.equal(got.tipo, esp.tipo, `${c.id}: tipo`)
          assert.equal(got.fonte, esp.fonte, `${c.id}: fonte`)
        } else {
          assert.equal(got.erro, esp.erro, `${c.id}: erro`)
        }
      }
    } finally {
      await db.exec('ALTER TABLE produtos ENABLE TRIGGER trg_d11_validar_cadastro_atacado')
    }
  })

  for (const [status, nome, detalhe] of results) {
    console.log(`${status} ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
  }
  console.log(`D11 ATACADO FONTE UNICA: OK (${results.length} casos; ${fixture.casos.length} casos de paridade)`)
} catch (error) {
  for (const [status, nome, detalhe] of results) {
    console.log(`${status} ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
  }
  console.error('D11 ATACADO FONTE UNICA: FALHOU')
  console.error(error)
  process.exitCode = 1
} finally {
  await db.close()
}
