import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const moduleName = process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite'
const { PGlite } = await import(moduleName)
const db = new PGlite()
const actor = '00000000-0000-4000-8000-000000000001'
const store = '00000000-0000-4000-8000-000000000002'
const product = '00000000-0000-4000-8000-000000000003'
await db.exec(`CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${actor}'::uuid$$;
CREATE TYPE motivo_desconto_enum_tipo AS ENUM ('NAO_ESPECIFICADO');
CREATE FUNCTION round_abnt(numeric,integer) RETURNS numeric LANGUAGE sql AS $$SELECT round($1,$2)$$;
CREATE TABLE pdv_config(id integer,max_desconto_gerente_percentual numeric,gerente_id text,max_desconto_total_percentual numeric);
INSERT INTO pdv_config VALUES(1,20,NULL,60);
CREATE TABLE formas_pagamento(loja_id uuid,codigo text,ativo boolean);
INSERT INTO formas_pagamento SELECT '${store}',codigo,true FROM unnest(ARRAY['DINHEIRO','PIX','CARTAO_CREDITO','CARTAO_DEBITO']) codigo;
CREATE TABLE vendas(id uuid PRIMARY KEY,caixa_id uuid,operador_id uuid,total_bruto numeric,total_desconto numeric,total_liquido numeric,forma_pagamento text,status text,cliente_id uuid);
CREATE TABLE produtos(id uuid,preco_custo numeric);
INSERT INTO produtos VALUES('${product}',2);
CREATE TABLE itens_venda(id uuid PRIMARY KEY,venda_id uuid,produto_id uuid,quantidade numeric,preco_unitario_original numeric,preco_unitario numeric,desconto_unitario numeric,tipo_preco text,custo_unitario_snap numeric,tipo_preco_fonte text,regra_aplicada_id uuid,promocao_regra_id uuid,promocao_desconto_percentual numeric,promocao_nome_snapshot text);
CREATE TABLE vendas_pagamentos(venda_id uuid,forma_pagamento text,valor numeric,UNIQUE(venda_id,forma_pagamento));
CREATE TABLE documentos_fiscais_pendentes(id uuid,venda_id uuid,status text,tipo_doc text,deleted_at timestamptz,created_at timestamptz);
CREATE TABLE estoque_fixture(produto_id uuid PRIMARY KEY,quantidade numeric);
INSERT INTO estoque_fixture VALUES('${product}',100);
CREATE FUNCTION decrementar_estoque_seguro(uuid,numeric,uuid) RETURNS TABLE(sucesso boolean,mensagem text) LANGUAGE plpgsql AS $$BEGIN
 UPDATE estoque_fixture SET quantidade=quantidade-$2 WHERE produto_id=$1 AND quantidade >= $2;
 RETURN QUERY SELECT FOUND, 'Saldo insuficiente'::text;
END$$;
CREATE FUNCTION ensure_venda_evento_registrado(uuid,text) RETURNS uuid LANGUAGE sql AS $$SELECT $1$$;`)
const source = await readFile(new URL('../supabase/migrations/20260902140300_fiscal_payload_snapshot_icms_origem.sql',import.meta.url),'utf8')
const start = source.indexOf('CREATE OR REPLACE FUNCTION')
const end = source.indexOf('$function$;',source.indexOf('AS $function$',start)) + '$function$;'.length
await db.exec(source.slice(start,end))
const items = [{produto_id:product,quantidade:2,preco_original:10,preco_unitario:9.5,tipo_preco:'MANUAL'}]
async function sale(id,forma,pagamentos=[{forma_pagamento:forma,valor:19}]) {
 return db.query(`SELECT * FROM finalizar_venda_transacional_canonica_v4_unscoped(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,20,1,19,$6::jsonb,$7::jsonb)`,[id,store,actor,store,forma,JSON.stringify(pagamentos),JSON.stringify(items)])
}
for (const [index,forma] of ['DINHEIRO','PIX','CARTAO_CREDITO','CARTAO_DEBITO'].entries()) {
 const id = `00000000-0000-4000-8000-${String(index+10).padStart(12,'0')}`
 const result = await sale(id,forma)
 assert.equal(result.rows[0].status,'CONCLUIDA')
 await sale(id,forma)
 const persisted = (await db.query('SELECT total_bruto,total_desconto,total_liquido,forma_pagamento FROM vendas WHERE id=$1',[id])).rows[0]
 assert.equal(Number(persisted.total_bruto),20); assert.equal(Number(persisted.total_desconto),1); assert.equal(Number(persisted.total_liquido),19); assert.equal(persisted.forma_pagamento,forma)
 const payment = (await db.query('SELECT valor FROM vendas_pagamentos WHERE venda_id=$1',[id])).rows[0]
 assert.equal(Number(payment.valor),19)
}
const splitId='00000000-0000-4000-8000-000000000020'
await sale(splitId,'DINHEIRO',[{forma_pagamento:'DINHEIRO',valor:9},{forma_pagamento:'PIX',valor:10}])
assert.equal((await db.query('SELECT count(*)::integer AS n FROM vendas')).rows[0].n,5)
assert.equal((await db.query('SELECT quantidade FROM estoque_fixture')).rows[0].quantidade,'90')
const invalidId='00000000-0000-4000-8000-000000000030'
await assert.rejects(sale(invalidId,'PIX',[{forma_pagamento:'PIX',valor:20}]),/PAGAMENTOS_EXCEDEM_TOTAL/)
await assert.rejects(sale(invalidId,'INVALIDO'),/FORMA_PAGAMENTO_INVALIDA/)
await db.exec('UPDATE estoque_fixture SET quantidade=0')
await assert.rejects(sale(invalidId,'PIX'),/ESTOQUE/)
assert.equal((await db.query('SELECT count(*)::integer AS n FROM vendas')).rows[0].n,5)
assert.equal((await db.query('SELECT count(*)::integer AS n FROM itens_venda')).rows[0].n,5)
await db.close()
console.log('OK: quatro métodos, desconto persistido para o administrativo, divisão, repetição sem duplicata e rollback de falhas. Fixtures isolam estoque, arredondamento e eventos.')
