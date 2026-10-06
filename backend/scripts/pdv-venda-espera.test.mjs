import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const moduleName = process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite'
const { PGlite } = await import(moduleName)
const db = new PGlite()
const actor = '00000000-0000-4000-8000-000000000001'
const id = '00000000-0000-4000-8000-000000000002'
await db.exec(`CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
 CREATE TABLE vendas_em_espera(id uuid PRIMARY KEY, operador_id uuid, status text, atualizada_em timestamptz,
 numero_local integer, rotulo text, itens jsonb, totais jsonb, cliente_id uuid, desconto_gerente_percentual numeric,
 desconto_gerente_token text, descartada_motivo text);
 INSERT INTO vendas_em_espera(id,operador_id,status,numero_local,itens,totais)
 VALUES('${id}','${actor}','EM_ESPERA',1,'[{"nome":"Teste","resultado":{"tipoPreco":"MANUAL","precoUnitario":9.5}}]','{"totalLiquido":9.5}');
 SET test.uid='${actor}';`)
await db.exec(await readFile(new URL('../supabase/migrations/20260809120659_fix_venda_em_espera_claim_anti_duplicata.sql',import.meta.url),'utf8'))
async function call(name) { return (await db.query(`SELECT ${name}($1::uuid) AS value`,[id])).rows[0].value }
const resumed = await call('retomar_venda_em_espera')
assert.equal(resumed.itens[0].resultado.precoUnitario,9.5)
await assert.rejects(call('retomar_venda_em_espera'),/venda_em_espera_em_uso/)
await call('devolver_venda_em_espera')
await call('retomar_venda_em_espera')
await call('converter_venda_em_espera')
await call('converter_venda_em_espera')
await assert.rejects(call('retomar_venda_em_espera'),/venda_em_espera_nao_encontrada/)
await db.exec(`UPDATE vendas_em_espera SET status='EM_ESPERA'; SET test.uid='00000000-0000-4000-8000-000000000003';`)
await assert.rejects(call('retomar_venda_em_espera'),/permissao_negada/)
await db.exec(`SET test.uid='${actor}'`)
await call('descartar_venda_em_espera')
await assert.rejects(call('converter_venda_em_espera'),/venda_em_espera_nao_encontrada/)
await db.close()
console.log('OK: retomada exclusiva, desconto preservado, devolução, conversão idempotente, descarte e autorização.')
