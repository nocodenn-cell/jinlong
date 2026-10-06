import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const name = process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite'
const { PGlite } = await import(name)
const db = new PGlite()
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const actor = id(1), store = id(2), product = id(3), delivery = id(4), invoice = id(5)
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''test.uid'',true),'''')::uuid';
  CREATE TABLE lojas(id uuid PRIMARY KEY);
  CREATE TABLE usuarios(id uuid PRIMARY KEY, perfil text, loja_id uuid, ativo boolean);
  CREATE TABLE remessas(id uuid PRIMARY KEY, loja_id uuid, status text);
  CREATE TABLE remessa_itens(remessa_id uuid, produto_id uuid, quantidade_conferida numeric);
  CREATE TABLE importacoes_nfe(id uuid PRIMARY KEY, loja_id uuid, fornecedor_id uuid, numero_nf text, status text, ordem_compra_id uuid);
  CREATE TABLE importacoes_nfe_itens(importacao_nfe_id uuid, produto_id uuid, quantidade_nfe numeric,
    quantidade_conferida numeric, custo_unitario numeric, atualizar_custo boolean, status_conferencia text);
  CREATE TABLE importacoes_nfe_duplicatas(importacao_nfe_id uuid, numero_duplicata text, data_vencimento date, valor numeric);
  CREATE TABLE estoque(loja_id uuid, produto_id uuid, quantidade_atual numeric, estoque_minimo numeric, version int, updated_at timestamptz, UNIQUE(loja_id,produto_id));
  CREATE TABLE produtos(id uuid, preco_custo numeric, preco_varejo numeric, preco_atacado numeric, permitir_abaixo_custo boolean, updated_at timestamptz);
  CREATE TABLE movimentos_estoque_log(id uuid DEFAULT gen_random_uuid(), loja_id uuid, produto_id uuid, tipo_codigo text, quantidade_delta numeric, usuario_id uuid, observacao text);
  CREATE TABLE contas_pagar(nfe_importacao_id uuid, fornecedor_id uuid, loja_id uuid, nfe_numero text, vencimento date, valor_total numeric, status text);
  CREATE TABLE ordens_compra(id uuid, loja_id uuid, status text);
  CREATE FUNCTION _oc_atualizar_estado(uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'pedido não deve ser abatido novamente'; END $$;
  INSERT INTO lojas VALUES('${store}'),('${id(99)}');
  INSERT INTO usuarios VALUES('${actor}','GERENTE','${store}',true),('${id(98)}','GERENTE','${id(99)}',true);
  INSERT INTO remessas VALUES('${delivery}','${store}','CONCLUIDA');
  INSERT INTO remessa_itens VALUES('${delivery}','${product}',7);
  INSERT INTO estoque VALUES('${store}','${product}',7,0,1,now());
  INSERT INTO produtos VALUES('${product}',1,100,NULL,false,now());
  INSERT INTO importacoes_nfe VALUES('${invoice}','${store}','${id(10)}','INV-123','EM_CONFERENCIA','${id(12)}');
  INSERT INTO importacoes_nfe_itens VALUES('${invoice}','${product}',7,7,3,true,'CONFERIDO');
  INSERT INTO importacoes_nfe_duplicatas VALUES('${invoice}','001','2026-11-05',21);
`)
await db.exec(await readFile(new URL('../supabase/migrations/20261005225856_entrada_documento_posterior.sql', import.meta.url), 'utf8'))
const associate = (imp = invoice) => db.query('SELECT associar_documento_entrada($1,$2)', [imp, delivery])
const confirm = (imp = invoice) => db.query('SELECT confirmar_importacao_nfe($1)', [imp])
const quantity = async () => (await db.query('SELECT quantidade_atual::float8 AS n FROM estoque')).rows[0].n
const count = async (table) => (await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n
try {
  await db.query("SELECT set_config('test.uid',$1,false)", [id(98)])
  await assert.rejects(associate(), /ENTRADA_IMPORTACAO_INVALIDA/)
  await db.query("SELECT set_config('test.uid',$1,false)", [actor])
  await db.exec('UPDATE importacoes_nfe_itens SET quantidade_conferida=8')
  await assert.rejects(associate(), /ENTRADA_ITENS_DIVERGENTES/)
  await db.exec('UPDATE importacoes_nfe_itens SET quantidade_conferida=7')
  await associate()
  await associate()
  assert.equal(await count('entrada_documentos'), 1)
  assert.equal(await quantity(), 7)
  assert.equal(await count('contas_pagar'), 0)
  await db.exec('UPDATE importacoes_nfe_itens SET quantidade_conferida=8')
  await assert.rejects(confirm(), /ENTRADA_ITENS_DIVERGENTES/)
  assert.equal(await quantity(), 7)
  assert.equal(await count('contas_pagar'), 0)
  await db.exec('UPDATE importacoes_nfe_itens SET quantidade_conferida=7')
  await confirm()
  assert.equal(await quantity(), 7)
  assert.equal(await count('movimentos_estoque_log'), 0)
  assert.equal(await count('contas_pagar'), 1)
  const payable = (await db.query('SELECT nfe_numero,valor_total::float8 AS valor FROM contas_pagar')).rows[0]
  assert.deepEqual(payable, { nfe_numero: 'INV-123', valor: 21 })
  await assert.rejects(confirm(), /IMPORT_NFE_STATUS_INVALIDO/)
  assert.equal(await count('contas_pagar'), 1)
  await db.exec(`INSERT INTO importacoes_nfe VALUES('${id(6)}','${store}','${id(10)}','INV-124','EM_CONFERENCIA',NULL);
    INSERT INTO importacoes_nfe_itens VALUES('${id(6)}','${product}',7,7,3,true,'CONFERIDO');`)
  await assert.rejects(associate(id(6)), /unique/)
  await db.exec(`INSERT INTO importacoes_nfe VALUES('${id(7)}','${store}','${id(10)}','INV-125','EM_CONFERENCIA',NULL);
    INSERT INTO importacoes_nfe_itens VALUES('${id(7)}','${product}',4,4,3,true,'CONFERIDO');`)
  await confirm(id(7))
  assert.equal(await quantity(), 11)
  assert.equal(await count('movimentos_estoque_log'), 1)
  const grant = (await db.query("SELECT has_table_privilege('authenticated','entrada_documentos','INSERT') AS allowed")).rows[0]
  assert.equal(grant.allowed, false)
  console.log('OK: documento posterior sem segundo crédito/abatimento, conferência revalidada, financeiro identificado, repetição e permissões protegidas; entrada nova preservada.')
} finally { await db.close() }
