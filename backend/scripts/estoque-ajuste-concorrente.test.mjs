import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const moduleName = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(moduleName)
const db = new PGlite()
const migration = await readFile(new URL('../supabase/migrations/20261005224553_estoque_ajuste_concorrente.sql', import.meta.url), 'utf8')
const actor = '00000000-0000-4000-8000-000000000001'
const store = '00000000-0000-4000-8000-000000000002'
const product = '00000000-0000-4000-8000-000000000003'

await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
  CREATE TABLE usuarios(id uuid, perfil text, loja_id uuid, ativo boolean);
  CREATE TABLE estoque(produto_id uuid, loja_id uuid, quantidade_atual numeric,
    estoque_minimo numeric, version integer DEFAULT 0, updated_at timestamptz);
  CREATE TABLE movimentos_estoque_log(loja_id uuid, produto_id uuid, tipo_codigo text,
    quantidade_delta numeric, remessa_id uuid, usuario_id uuid, observacao text);
  CREATE TABLE produtos(id uuid DEFAULT gen_random_uuid(), nome text, codigo_barras text,
    codigo_interno text, referencia_fornecedor text, nome_reduzido_pdv text,
    localizacao_prateleira text, preco_varejo numeric, preco_atacado numeric,
    preco_custo numeric, permitir_abaixo_custo boolean, quantidade_gatilho_atacado integer,
    origem text, tem_nf boolean, unidade_medida text, observacao text,
    categoria_id uuid, marca_id uuid, fornecedor_id uuid, ncm text, cfop_produto text,
    csosn text, cest text, cst_pis text, cst_cofins text, icms_origem text, ativo boolean,
    status_publicacao text, loja_id uuid, criado_por uuid, atualizado_por uuid);
  CREATE TABLE produto_create_requests(request_id uuid UNIQUE, produto_id uuid, loja_id uuid, ator_id uuid);
  INSERT INTO usuarios VALUES ('${actor}', 'GERENTE', '${store}', true);
  INSERT INTO estoque VALUES ('${product}', '${store}', 10, 2, 0, now());
`)
await db.exec(migration)

async function reset(quantity = 10, minimum = 2) {
  await db.exec('TRUNCATE movimentos_estoque_log;')
  await db.query('UPDATE estoque SET quantidade_atual=$1, estoque_minimo=$2, version=0', [quantity, minimum])
}

async function adjust(quantity, minimum, expectedQuantity = 10, expectedMinimum = 2, actorId = actor) {
  return db.query('SELECT ajustar_estoque_manual_seguro($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [product, store, quantity, minimum, 'ACERTO_INVENTARIO', null, actorId, expectedQuantity, expectedMinimum])
}

async function balance() {
  const { rows } = await db.query('SELECT quantidade_atual::float8 AS qty, estoque_minimo::float8 AS min FROM estoque')
  return rows[0]
}

async function movementCount() {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM movimentos_estoque_log')
  return rows[0].n
}

try {
  await adjust(8, 2)
  assert.deepEqual(await balance(), { qty: 8, min: 2 })
  assert.equal(await movementCount(), 1)

  // Uma venda/entrada ocorreu depois de o formulário capturar saldo 10.
  await reset(9)
  await assert.rejects(adjust(8, 2), /AJUSTE_ESTOQUE_SALDO_ALTERADO/)
  assert.deepEqual(await balance(), { qty: 9, min: 2 })
  assert.equal(await movementCount(), 0)

  // Somente o mínimo mudou no formulário; preserve a venda concorrente.
  await adjust(10, 3)
  assert.deepEqual(await balance(), { qty: 9, min: 3 })
  assert.equal(await movementCount(), 0)

  await reset(10, 4)
  await assert.rejects(adjust(8, 2), /AJUSTE_ESTOQUE_SALDO_ALTERADO/)
  assert.deepEqual(await balance(), { qty: 10, min: 4 })

  await reset()
  await adjust(0, 2)
  assert.deepEqual(await balance(), { qty: 0, min: 2 })
  assert.equal(await movementCount(), 1)
  await assert.rejects(adjust(8, 2), /AJUSTE_ESTOQUE_SALDO_ALTERADO/)
  assert.equal(await movementCount(), 1)

  await reset()
  await assert.rejects(adjust(8, 2, null), /AJUSTE_ESTOQUE_SNAPSHOT_OBRIGATORIO/)
  await assert.rejects(adjust(8, 2, 10, 2, null), /AJUSTE_ESTOQUE_AUTH/)
  await db.exec(`UPDATE usuarios SET perfil='OPERADOR'`)
  await assert.rejects(adjust(8, 2), /AJUSTE_ESTOQUE_PERFIL/)
  assert.equal(await movementCount(), 0)

  // Clientes antigos nunca podem contornar a comparação sob bloqueio.
  await assert.rejects(db.query('SELECT ajustar_estoque_manual($1,$2,8,2,$3,NULL,$4)',
    [product, store, 'ACERTO_INVENTARIO', actor]), /AJUSTE_ESTOQUE_SNAPSHOT_OBRIGATORIO/)
  const { rows } = await db.query(`SELECT has_function_privilege('authenticated',
    'ajustar_estoque_manual_seguro(uuid,uuid,numeric,numeric,text,text,uuid,numeric,numeric)', 'EXECUTE') AS allowed`)
  assert.equal(rows[0].allowed, false)
  await db.exec("UPDATE usuarios SET perfil='GERENTE'")
  const payload = { nome: 'Produto sintético', estoque_inicial_quantidade: 7, estoque_inicial_minimo: 1 }
  const request = '00000000-0000-4000-8000-000000000004'
  const created = await db.query('SELECT criar_produto_com_estoque_inicial($1,$2,$3,NULL) AS result',
    [JSON.stringify(payload), actor, request])
  assert.equal(created.rows[0].result.estoque_aplicado, true)
  const createdId = created.rows[0].result.produto_id
  const initial = await db.query('SELECT quantidade_atual::float8 AS qty, estoque_minimo::float8 AS min FROM estoque WHERE produto_id=$1', [createdId])
  assert.deepEqual(initial.rows[0], { qty: 7, min: 1 })
  assert.equal(await movementCount(), 1)
  const replay = await db.query('SELECT criar_produto_com_estoque_inicial($1,$2,$3,NULL) AS result',
    [JSON.stringify(payload), actor, request])
  assert.equal(replay.rows[0].result.replayed, true)
  assert.equal(await movementCount(), 1)
  console.log('OK: ajuste, conflito, mínimo isolado, zero, repetição, snapshot, autorização e cliente antigo.')
} finally {
  await db.close()
}
