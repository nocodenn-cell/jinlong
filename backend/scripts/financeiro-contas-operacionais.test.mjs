/**
 * Contrato: defaults por forma + helper de conta. Não grava no remoto.
 */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

let db
const loja = randomUUID(), usuario = randomUUID(), categoria = randomUUID(), cliente = randomUUID(), caixa = randomUUID()
const sql = async (query, params = []) => (await db.query(query, params)).rows
const cmd = async (tipo, dados, key = randomUUID()) => (await sql('select public.financeiro_comando($1,$2,$3) as result', [tipo, JSON.stringify(dados), key]))[0].result
const cmdOp = async (tipo, dados, key = randomUUID()) => (await sql('select public.financeiro_comando_operacional($1,$2,$3) as result', [tipo, JSON.stringify(dados), key]))[0].result
let banco, reserva

before(async () => {
  db = await PGlite.create()
  await db.exec(`
 create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 create function public.round_abnt(numeric,integer) returns numeric language sql immutable as 'select round($1,$2)';
 create table lojas(id uuid primary key);
 create table usuarios(id uuid primary key,loja_id uuid,perfil text,ativo boolean,nome text default 'U');
 create table clientes(id uuid primary key,loja_id uuid,nome text);
 create table fornecedores(id uuid primary key,loja_id uuid,nome text);
 create type categoria_financeira_tipo as enum('RECEITA','DESPESA','AMBOS');
 create table categorias_financeiras(id uuid primary key,nome text,tipo categoria_financeira_tipo,ativo boolean);
 create table caixas(id uuid primary key,loja_id uuid,saldo_atual numeric,status text,data_fechamento timestamptz,valor_fechamento numeric,fechamento_diferenca numeric);
 create table vendas(id uuid primary key,caixa_id uuid,status text,total_liquido numeric,forma_pagamento text,data timestamptz);
 create table vendas_pagamentos(id uuid primary key default gen_random_uuid(),venda_id uuid,valor numeric,forma_pagamento text);
 create table devolucoes(id uuid primary key,venda_id uuid,valor numeric,forma_pagamento text,operacao_id uuid,caixa_desembolso_id uuid);
 create table venda_pos_venda_operacoes(id uuid primary key,forma_estorno text);
 create table venda_pos_venda_itens(item_venda_id uuid,quantidade numeric);
 create table itens_venda(id uuid primary key,venda_id uuid,quantidade numeric,custo_unitario_snap numeric);
 create table contas_pagar(id uuid primary key default gen_random_uuid(),loja_id uuid,fornecedor_id uuid,nfe_importacao_id uuid,descricao text,vencimento date,valor_total numeric,valor_pago numeric default 0,status text default 'PENDENTE',criado_em timestamptz default now());
 create table contas_receber(id uuid primary key default gen_random_uuid(),cliente_id uuid,loja_id uuid,descricao text,valor_total numeric,valor_aberto numeric,vencimento date,status text default 'ABERTO');
 create table contas_pagar_pagamentos(id uuid primary key default gen_random_uuid(),conta_id uuid,valor numeric,forma_pagamento text,data_pagamento timestamptz,observacao text,usuario_id uuid,created_at timestamptz default now(),idempotency_key text,origem text,loja_id uuid,caixa_id uuid,operacao_tipo text default 'PAGAMENTO',operacao_origem_id uuid,movimentacao_caixa_id uuid,unique(conta_id,idempotency_key));
 create table liquidacoes_receber(id uuid primary key default gen_random_uuid(),titulo_id uuid,valor numeric,forma_pagamento text,observacao text,created_by uuid,idempotency_key text,origem text,loja_id uuid,caixa_id uuid,operacao_tipo text default 'RECEBIMENTO',operacao_origem_id uuid,created_at timestamptz default now(),unique(titulo_id,idempotency_key));
 create table movimentacoes_caixa(id uuid primary key,caixa_id uuid,tipo text,valor numeric,status text,deleted_at timestamptz,forma_pagamento text,created_at timestamptz,movimentacao_origem_id uuid);
 grant usage on schema public,auth to authenticated;
 grant select on usuarios,clientes to authenticated;
 grant all on contas_pagar_pagamentos,liquidacoes_receber to authenticated,anon;
 `)
  for (const [file, name] of [
    ['20260909120000_tokens_autorizacao_operacao_sangria_ap.sql', 'registrar_pagamento_contas_pagar'],
    ['20260814013447_enforce_store_scoped_receivables.sql', 'registrar_liquidacao_receber'],
    ['20260814095445_auditable_ar_ap_reversals.sql', 'estornar_liquidacao_receber'],
    ['20260814095445_auditable_ar_ap_reversals.sql', 'estornar_pagamento_contas_pagar'],
  ]) {
    const source = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8')
    const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
    assert.ok(start >= 0, name)
    const block = source.slice(start), delimiter = block.match(/AS\s+(\$\w*\$)/i)[1]
    const body = block.indexOf(delimiter) + delimiter.length, end = block.indexOf(delimiter, body) + delimiter.length
    await db.exec(block.slice(0, end) + ';')
  }
  await db.exec(readFileSync(new URL('../supabase/migrations/20261005004647_financeiro_loja_contas_ledger.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../supabase/migrations/20261005091218_financeiro_hardening_final.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../supabase/migrations/20261006180000_financeiro_contas_operacionais.sql', import.meta.url), 'utf8'))
  await sql('insert into lojas values($1)', [loja])
  await sql("insert into usuarios(id,loja_id,perfil,ativo,nome) values($1,$2,'DONO',true,'Dono')", [usuario, loja])
  await sql("insert into categorias_financeiras values($1,'Geral','AMBOS',true)", [categoria])
  await sql("insert into clientes values($1,$2,'Cliente')", [cliente, loja])
  await sql("insert into caixas(id,loja_id,saldo_atual,status) values($1,$2,0,'ABERTO')", [caixa, loja])
  await sql("select set_config('request.jwt.claim.sub',$1,false)", [usuario])
  banco = (await cmd('CRIAR_CONTA', { nome: 'Banco', tipo: 'BANCO', data: '2026-10-01', valor: 100 })).id
  reserva = (await cmd('CRIAR_CONTA', { nome: 'Reserva', tipo: 'RESERVA', data: '2026-10-01' })).id
})

after(async () => db?.close())

test('CONFIGURAR_CONTA_FORMA é idempotente e aparece no painel', async () => {
  const key = randomUUID()
  const dados = { forma_pagamento: 'PIX', conta_id: banco }
  const first = await cmdOp('CONFIGURAR_CONTA_FORMA', dados, key)
  assert.deepEqual(await cmdOp('CONFIGURAR_CONTA_FORMA', dados, key), first)
  const painel = (await sql("select public.financeiro_painel('2026-10-01','2026-10-31',1) as data"))[0].data
  assert.ok(Array.isArray(painel.contas_forma))
  assert.ok(painel.contas_forma.some((f) => f.forma_pagamento === 'PIX' && f.conta_financeira_id === banco))
})

test('PIX e cartão mapeiam banco; dinheiro só reserva', async () => {
  await cmdOp('CONFIGURAR_CONTA_FORMA', { forma_pagamento: 'CARTAO_DEBITO', conta_id: banco })
  assert.equal((await sql('select internal.financeiro_conta_forma($1,$2) as id', [loja, 'CARTAO_DEBITO']))[0].id, banco)
  await assert.rejects(cmdOp('CONFIGURAR_CONTA_FORMA', { forma_pagamento: 'DINHEIRO', conta_id: banco }), /reserva|numerário|Dinheiro/i)
  await cmdOp('CONFIGURAR_CONTA_FORMA', { forma_pagamento: 'DINHEIRO', conta_id: reserva })
  assert.equal((await sql('select internal.financeiro_conta_forma($1,$2) as id', [loja, 'DINHEIRO']))[0].id, reserva)
})

test('nova venda PIX com default liquida no banco automaticamente', async () => {
  await cmdOp('CONFIGURAR_CONTA_FORMA', { forma_pagamento: 'PIX', conta_id: banco })
  const venda = randomUUID()
  await db.exec('begin')
  await sql("insert into vendas values($1,$2,'CONCLUIDA',40,'PIX',timestamptz '2026-10-06 15:00:00-03')", [venda, caixa])
  await sql("insert into vendas_pagamentos(venda_id,valor,forma_pagamento) values($1,40,'PIX')", [venda])
  await db.exec('commit')
  const rec = (await sql('select status,conta_financeira_id,taxa::float,recebimento_atual_id from financeiro_recebiveis_venda where venda_id=$1', [venda]))[0]
  assert.ok(rec, 'recebível PIX criado')
  assert.equal(rec.conta_financeira_id, banco)
  assert.equal(rec.status, 'RECEBIDO')
  assert.equal(rec.taxa, 0)
  assert.ok(rec.recebimento_atual_id)
  const saldo = Number((await sql('select coalesce(sum(valor),0)::float as s from movimentos_financeiros where conta_financeira_id=$1', [banco]))[0].s)
  assert.equal(saldo, 140)
})

test('ALTERAR_CONTA inativa sem apagar histórico', async () => {
  await cmdOp('ALTERAR_CONTA', { conta_id: reserva, ativo: false })
  const row = (await sql('select ativo from contas_financeiras where id=$1', [reserva]))[0]
  assert.equal(row.ativo, false)
})
