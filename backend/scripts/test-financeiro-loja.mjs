import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// PostgreSQL real em memória; apenas o catálogo preexistente é uma fixture.
// As RPCs de baixa/estorno são carregadas das migrations originais, sem mocks.
let db;
const loja=randomUUID(), outra=randomUUID(), usuario=randomUUID(), outroUsuario=randomUUID(), operador=randomUUID(), categoria=randomUUID(), cliente=randomUUID(), caixa=randomUUID();
const sql = async (query,params=[]) => (await db.query(query,params)).rows;
const cmd = async (tipo,dados,key=randomUUID()) => (await sql('select public.financeiro_comando($1,$2,$3) as result',[tipo,JSON.stringify(dados),key]))[0].result;
const painel = async () => (await sql("select public.financeiro_painel('2026-10-01','2026-10-31',1) as data"))[0].data;
let banco, reserva;
before(async () => {
 db=await PGlite.create();
 await db.exec(`
 create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 create function public.round_abnt(numeric,integer) returns numeric language sql immutable as 'select round($1,$2)';
 create table lojas(id uuid primary key);
 create table usuarios(id uuid primary key,loja_id uuid,perfil text,ativo boolean,nome text);
 create table clientes(id uuid primary key,loja_id uuid,nome text);
 create table fornecedores(id uuid primary key,loja_id uuid,nome text);
 create type categoria_financeira_tipo as enum('RECEITA','DESPESA','AMBOS');
 create table categorias_financeiras(id uuid primary key,nome text,tipo categoria_financeira_tipo,ativo boolean);
 create table caixas(id uuid primary key,loja_id uuid,saldo_atual numeric,status text,data_fechamento timestamptz,valor_fechamento numeric,fechamento_diferenca numeric);
 create table vendas(id uuid primary key,caixa_id uuid,status text,total_liquido numeric,forma_pagamento text,data timestamptz);
 create table vendas_pagamentos(id uuid primary key,venda_id uuid,valor numeric,forma_pagamento text);
 create table devolucoes(id uuid primary key,venda_id uuid,valor numeric,forma_pagamento text,operacao_id uuid,caixa_desembolso_id uuid);
 create table venda_pos_venda_operacoes(id uuid primary key,forma_estorno text);
 create table venda_pos_venda_itens(item_venda_id uuid,quantidade numeric);
 create table itens_venda(id uuid primary key,venda_id uuid,quantidade numeric,custo_unitario_snap numeric);
 create table contas_pagar(id uuid primary key default gen_random_uuid(),loja_id uuid,fornecedor_id uuid not null,nfe_importacao_id uuid,descricao text,vencimento date,valor_total numeric,valor_pago numeric default 0,status text default 'PENDENTE',criado_em timestamptz default now());
 create table contas_receber(id uuid primary key default gen_random_uuid(),cliente_id uuid,loja_id uuid,descricao text,valor_total numeric,valor_aberto numeric,vencimento date,status text default 'ABERTO');
 create table contas_pagar_pagamentos(id uuid primary key default gen_random_uuid(),conta_id uuid,valor numeric,forma_pagamento text,data_pagamento timestamptz,observacao text,usuario_id uuid,created_at timestamptz default now(),idempotency_key text,origem text,loja_id uuid,caixa_id uuid,operacao_tipo text default 'PAGAMENTO',operacao_origem_id uuid,movimentacao_caixa_id uuid,unique(conta_id,idempotency_key));
 create table liquidacoes_receber(id uuid primary key default gen_random_uuid(),titulo_id uuid,valor numeric,forma_pagamento text,observacao text,created_by uuid,idempotency_key text,origem text,loja_id uuid,caixa_id uuid,operacao_tipo text default 'RECEBIMENTO',operacao_origem_id uuid,created_at timestamptz default now(),unique(titulo_id,idempotency_key));
 create table movimentacoes_caixa(id uuid primary key,caixa_id uuid,tipo text,valor numeric,status text,deleted_at timestamptz,forma_pagamento text,created_at timestamptz,movimentacao_origem_id uuid);
 create table formas_pagamento(id uuid primary key default gen_random_uuid(),loja_id uuid not null,codigo text not null,nome text not null,taxa_percentual numeric default 0,prazo_compensacao_dias integer default 0,ativo boolean default true,created_at timestamptz default now(),updated_at timestamptz default now(),unique(loja_id,codigo));
 grant usage on schema public,auth to authenticated;
 grant select on usuarios,clientes to authenticated;
 grant all on contas_pagar_pagamentos,liquidacoes_receber to authenticated,anon;
 `);
 const existing = [
  ['20260909120000_tokens_autorizacao_operacao_sangria_ap.sql','registrar_pagamento_contas_pagar'],
  ['20260814013447_enforce_store_scoped_receivables.sql','registrar_liquidacao_receber'],
  ['20260814095445_auditable_ar_ap_reversals.sql','estornar_liquidacao_receber'],
  ['20260814095445_auditable_ar_ap_reversals.sql','estornar_pagamento_contas_pagar'],
 ];
 for (const [file,name] of existing) {
  const source=readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8');
  const start=source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start>=0,`RPC original ${name}`);
  const block=source.slice(start),delimiter=block.match(/AS\s+(\$\w*\$)/i)[1];
  const body=block.indexOf(delimiter)+delimiter.length,end=block.indexOf(delimiter,body)+delimiter.length;
  await db.exec(block.slice(0,end)+';');
 }
 await db.exec(readFileSync(new URL('../supabase/migrations/20261005004647_financeiro_loja_contas_ledger.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../supabase/migrations/20261005091218_financeiro_hardening_final.sql',import.meta.url),'utf8'));
 // Fixture histórica: SQL em quarantine (FORBIDDEN_APPLY) — NÃO está em migrations/.
 // Carregamento explícito só para PGlite; CLI db reset/push não aplica este arquivo.
 await db.exec(readFileSync(new URL('../supabase/migrations-forbidden/20261006120000_financeiro_contas_formas_e_painel.sql',import.meta.url),'utf8'));
 await sql('insert into lojas values($1),($2)',[loja,outra]);
 await sql("insert into usuarios values($1,$2,'DONO',true),($3,$4,'ADMIN',true),($5,$2,'OPERADOR',true)",[usuario,loja,outroUsuario,outra,operador]);
 await sql("insert into categorias_financeiras values($1,'Geral','AMBOS',true)",[categoria]);
 await sql("insert into clientes values($1,$2,'Cliente teste')",[cliente,loja]);
 await sql("insert into caixas(id,loja_id,saldo_atual,status) values($1,$2,100,'ABERTO')",[caixa,loja]);
 await sql("insert into formas_pagamento(loja_id,codigo,nome) values($1,'DINHEIRO','Dinheiro'),($1,'PIX','Pix'),($1,'CARTAO_CREDITO','Cartão')",[loja]);
 await sql("select set_config('request.jwt.claim.sub',$1,false)",[usuario]);
 banco=(await cmd('CRIAR_CONTA',{nome:'Banco',tipo:'BANCO',data:'2026-10-01',valor:1000})).id;
 reserva=(await cmd('CRIAR_CONTA',{nome:'Reserva',tipo:'RESERVA',data:'2026-10-01'})).id;
});
after(async () => db?.close());

test('saldo inicial não vira receita, transferência não altera saldo consolidado, repetição é segura',async () => {
 const key=randomUUID(),dados={conta_id:banco,destino_id:reserva,data:'2026-10-02',valor:50};
 const first=await cmd('TRANSFERIR',dados,key);assert.deepEqual(await cmd('TRANSFERIR',dados,key),first);
 await assert.rejects(cmd('TRANSFERIR',{...dados,valor:51},key),/dados diferentes/);
 const p=await painel();assert.equal(p.saldo,1000);assert.equal(p.saldo_pdv,100);assert.equal(p.resultado_caixa.length,0);
 assert.equal(p.contas.find(c=>c.id===reserva).saldo,50);
 await assert.rejects(cmd('TRANSFERIR',{...dados,valor:9999}),/Saldo insuficiente/);
});
test('parcelas preservam centavos e recorrência respeita fim do mês e competência',async () => {
 const key=randomUUID();await cmd('CRIAR_AP',{descricao:'Compra',favorecido:'Fornecedor',categoria_id:categoria,valor:100,data:'2026-10-31',parcelas:3},key);
 const rows=await sql('select valor_total,vencimento::text from contas_pagar where lote_id=$1 order by parcela',[key]);
 assert.deepEqual(rows.map(r=>Number(r.valor_total)),[33.33,33.33,33.34]);assert.deepEqual(rows.map(r=>r.vencimento),['2026-10-31','2026-11-30','2026-12-31']);
 const recurrence=randomUUID();await cmd('CRIAR_AP',{descricao:'Aluguel',favorecido:'Locador',categoria_id:categoria,valor:2000,data:'2026-10-31',competencia:'2026-10-01',parcelas:3,recorrente:true},recurrence);
 const months=await sql('select competencia::text,valor_total from contas_pagar where lote_id=$1 order by parcela',[recurrence]);
 assert.equal(months.length,3);assert.deepEqual(months.map(r=>r.competencia),['2026-10-01','2026-11-01','2026-12-01']);assert.ok(months.every(r=>Number(r.valor_total)===2000));
});
test('AP e AR usam RPCs reais, com baixa parcial, data brasileira e estorno compensatório',async () => {
 const ap=(await cmd('CRIAR_AP',{descricao:'Energia',favorecido:'Energia',categoria_id:categoria,valor:2000,data:'2026-10-02'})).id;
 const key=randomUUID(),dados={titulo_id:ap,conta_id:banco,valor:500,data:'2026-10-02'};
 const before=(await painel()).saldo;
 const pay=(await cmd('BAIXAR_AP',dados,key)).id;
 assert.equal((await cmd('BAIXAR_AP',dados,key)).id,pay);
 assert.equal(Number((await sql('select valor_total-valor_pago as aberto from contas_pagar where id=$1',[ap]))[0].aberto),1500);
 assert.equal(Number((await sql('select count(*) as n from contas_pagar_pagamentos where conta_id=$1',[ap]))[0].n),1);
 assert.equal((await painel()).saldo,before-500);
 assert.equal((await sql('select data::text from movimentos_financeiros where origem_id=$1',[pay]))[0].data,'2026-10-02');
 await sql('select * from estornar_pagamento_contas_pagar($1,$2,$3)',[pay,'Correção',randomUUID()]);
 assert.equal((await sql('select valor_pago from contas_pagar where id=$1',[ap]))[0].valor_pago,'0.00');
 assert.equal((await painel()).saldo,before);
 assert.equal(Number((await sql('select valor from contas_pagar_pagamentos where id=$1',[pay]))[0].valor),500);
 assert.equal(Number((await sql('select count(*) as n from movimentos_financeiros where estorno_de=(select id from movimentos_financeiros where origem_id=$1)',[pay]))[0].n),1);
 const ar=(await cmd('CRIAR_AR',{cliente_id:cliente,valor:80,data:'2026-10-02',categoria_id:categoria,descricao:'Serviço'})).id;
 const receive=(await cmd('BAIXAR_AR',{titulo_id:ar,conta_id:banco,valor:30,data:'2026-10-02'})).id;
 assert.equal(Number((await sql('select valor_aberto from contas_receber where id=$1',[ar]))[0].valor_aberto),50);
 await sql('select * from estornar_liquidacao_receber($1,$2,$3)',[receive,'Correção',randomUUID()]);
 assert.equal(Number((await sql('select valor_aberto from contas_receber where id=$1',[ar]))[0].valor_aberto),80);
 await assert.rejects(sql('update liquidacoes_receber set valor=31 where id=$1',[receive]),/imutável/);
 assert.equal((await painel()).saldo_pdv,100);
});
test('extrato não altera saldo; conciliação exige sinal, conta e valor e permite desfazer com histórico',async () => {
 const mov=(await cmd('MOVIMENTO',{conta_id:banco,data:'2026-10-02',valor:10,direcao:'ENTRADA',descricao:'Depósito',categoria_id:categoria})).id;
 const before=(await painel()).saldo;
 const dados={conta_id:banco,linhas:[{referencia:'REF1',data:'2026-10-02',descricao:'Depósito',valor:10}]};
 await cmd('IMPORTAR_EXTRATO',dados);await cmd('IMPORTAR_EXTRATO',dados);
 assert.equal(Number((await sql("select count(*) as n from extratos_financeiros where referencia='REF1'"))[0].n),1);
 await assert.rejects(cmd('IMPORTAR_EXTRATO',{...dados,linhas:[{...dados.linhas[0],valor:11}]}),/dados diferentes/);
 assert.equal((await painel()).saldo,before);
 const e=(await sql('select id from extratos_financeiros where referencia=$1',['REF1']))[0].id;
 const candidates=(await sql('select financeiro_candidatos_conciliacao($1) as data',[e]))[0].data;assert.ok(candidates.some(m=>m.id===mov));
 const conf=(await cmd('CONCILIAR',{extrato_id:e,movimento_id:mov,descricao:'Conferido'})).id;
 await assert.rejects(cmd('CONCILIAR',{extrato_id:e,movimento_id:mov,descricao:'Conferido'}),/unique/);
 await cmd('DESCONCILIAR',{conciliacao_id:conf,descricao:'Refazer conferência'});
 assert.ok((await sql('select desfeito_em from conciliacoes_financeiras where id=$1',[conf]))[0].desfeito_em);
 const opposite=(await cmd('MOVIMENTO',{conta_id:banco,data:'2026-10-02',valor:10,direcao:'SAIDA',descricao:'Tarifa',categoria_id:categoria})).id;
 await assert.rejects(cmd('CONCILIAR',{extrato_id:e,movimento_id:opposite,descricao:'Conferido'}),/devem coincidir/);
 const foreign=(await cmd('MOVIMENTO',{conta_id:reserva,data:'2026-10-02',valor:10,direcao:'ENTRADA',descricao:'Outra conta',categoria_id:categoria})).id;
 await assert.rejects(cmd('CONCILIAR',{extrato_id:e,movimento_id:foreign,descricao:'Conferido'}),/devem coincidir/);
 const wrongValue=(await cmd('MOVIMENTO',{conta_id:banco,data:'2026-10-02',valor:11,direcao:'ENTRADA',descricao:'Valor diferente',categoria_id:categoria})).id;
 await assert.rejects(cmd('CONCILIAR',{extrato_id:e,movimento_id:wrongValue,descricao:'Conferido'}),/devem coincidir/);
});
test('venda mista captura somente eletrônico; cartão parcelado preserva bruto e taxa',async () => {
 const sale=randomUUID();
 await db.exec(`begin;insert into vendas values('${sale}','${caixa}','CONCLUIDA',150,'MISTO','2026-10-02 15:00:00+00');insert into vendas_pagamentos values('${randomUUID()}','${sale}',50,'DINHEIRO'),('${randomUUID()}','${sale}',100,'CARTAO_CREDITO');commit;`);
 let rs=await sql('select * from financeiro_recebiveis_venda where venda_id=$1',[sale]);assert.equal(rs.length,1);assert.equal(Number(rs[0].bruto),100);
 await cmd('CONFIGURAR_RECEBIVEL',{recebivel_id:rs[0].id,conta_id:banco,taxa:3,data:'2026-10-31',parcelas:3,operadora:'Adquirente'});
 rs=await sql('select *,previsao::text as previsao from financeiro_recebiveis_venda where venda_id=$1 order by parcela',[sale]);
 assert.equal(rs.length,3);assert.equal(rs.reduce((n,r)=>n+Math.round(Number(r.bruto)*100),0),10000);assert.equal(rs.reduce((n,r)=>n+Math.round(Number(r.taxa)*100),0),300);
 assert.equal(rs.reduce((n,r)=>n+Math.round((Number(r.bruto)-Number(r.taxa))*100),0),9700);
 assert.deepEqual(rs.map(r=>String(r.previsao).slice(0,10)),['2026-10-31','2026-11-30','2026-12-31']);
 assert.equal(String(rs[1].previsao).slice(0,10),'2026-11-30');
 await assert.rejects(cmd('CONFIGURAR_RECEBIVEL',{recebivel_id:rs[0].id,conta_id:banco,taxa:1,data:'2026-10-31',parcelas:2}),/Parcelamento/);
 const before=(await painel()).saldo;
 await cmd('RECEBER_VENDA',{recebivel_id:rs[0].id,data:'2026-10-02'});
 const received=(await painel()).saldo;assert.equal(Math.round((received-before)*100),3233);
 // Devolução em dinheiro já saiu da gaveta: não pode sair também do banco.
 await sql("insert into devolucoes(id,venda_id,valor,forma_pagamento,caixa_desembolso_id) values($1,$2,10,'DINHEIRO',$3)",[randomUUID(),sale,caixa]);
 assert.equal((await painel()).saldo,received);
 await sql("insert into devolucoes(id,venda_id,valor,forma_pagamento) values($1,$2,50,'CARTAO_CREDITO')",[randomUUID(),sale]);
 assert.equal(Math.round((received-(await painel()).saldo)*100),1667);
 assert.equal(Number((await sql('select sum(internal.financeiro_reembolso_parcela(id)) as total from financeiro_recebiveis_venda where venda_id=$1',[sale]))[0].total),50);
 // Uma nova alteração do cabeçalho não repete a compensação.
 const afterRefund=(await painel()).saldo;await sql('update vendas set total_liquido=total_liquido where id=$1',[sale]);assert.equal((await painel()).saldo,afterRefund);
});
test('sangria vinculada e seu estorno acompanham apenas a contrapartida bancária',async () => {
 const movement=randomUUID();await sql("insert into movimentacoes_caixa(id,caixa_id,tipo,valor,status,forma_pagamento) values($1,$2,'sangria',20,'aprovado','dinheiro')",[movement,caixa]);
 const before=(await painel()).saldo,resultadoAntes=(await painel()).resultado_caixa;
 const gavetaAntes=(await sql('select saldo_atual from caixas where id=$1',[caixa]))[0].saldo_atual;
 await cmd('VINCULAR_CAIXA',{movimento_id:movement,conta_id:banco,data:'2026-10-02'});assert.equal(Math.round(((await painel()).saldo-before)*100),2000);
 await assert.rejects(cmd('VINCULAR_CAIXA',{movimento_id:movement,conta_id:banco,data:'2026-10-02'}),/utilizado/);
 await sql("insert into movimentacoes_caixa(id,caixa_id,tipo,valor,status,forma_pagamento,movimentacao_origem_id) values($1,$2,'estorno',20,'aprovado','dinheiro',$3)",[randomUUID(),caixa,movement]);
 assert.equal((await painel()).saldo,before);
 assert.deepEqual((await painel()).resultado_caixa,resultadoAntes);
 assert.equal((await sql('select saldo_atual from caixas where id=$1',[caixa]))[0].saldo_atual,gavetaAntes);
});
test('corrigir depósito mantém histórico e permite receber novamente; cancelamento compensa uma vez',async () => {
 const sale=randomUUID();await sql("insert into vendas values($1,$2,'CONCLUIDA',50,'PIX','2026-10-02 15:00:00+00')",[sale,caixa]);
 const r=(await sql('select id from financeiro_recebiveis_venda where venda_id=$1',[sale]))[0].id;
 await cmd('CONFIGURAR_RECEBIVEL',{recebivel_id:r,conta_id:banco,taxa:0,data:'2026-10-02'});
 const before=(await painel()).saldo;
 await cmd('RECEBER_VENDA',{recebivel_id:r,data:'2026-10-02'});assert.equal(Math.round(((await painel()).saldo-before)*100),5000);
 await cmd('ESTORNAR_RECEBIVEL',{recebivel_id:r,data:'2026-10-02',descricao:'Depósito informado errado'});assert.equal((await painel()).saldo,before);
 await cmd('RECEBER_VENDA',{recebivel_id:r,data:'2026-10-02'});assert.equal(Math.round(((await painel()).saldo-before)*100),5000);
 await db.exec(`begin;insert into devolucoes(id,venda_id,valor,forma_pagamento) values('${randomUUID()}','${sale}',50,'PIX');update vendas set status='CANCELADA' where id='${sale}';commit;`);
 assert.equal((await painel()).saldo,before);
 assert.equal((await sql('select status from financeiro_recebiveis_venda where id=$1',[r]))[0].status,'CANCELADO');
 assert.equal(Number((await sql("select count(*) as total from movimentos_financeiros where origem='AJUSTE_VENDA' and descricao like (select recebimento_atual_id::text||' %' from financeiro_recebiveis_venda where id=$1)",[r]))[0].total),1);
});
test('isolamento de lojas, perfil gerencial, RLS e permissões de escrita',async () => {
 await sql("select set_config('request.jwt.claim.sub',$1,false)",[outroUsuario]);
 assert.equal((await painel()).contas.length,0);
 await assert.rejects(cmd('MOVIMENTO',{conta_id:banco,data:'2026-10-02',valor:10,direcao:'ENTRADA',categoria_id:categoria,descricao:'Outra loja'}),/esta loja/);
 await db.exec('set role authenticated');
 try { assert.equal((await sql('select * from contas_financeiras')).length,0);await assert.rejects(sql("insert into movimentos_financeiros default values"),/permission denied/);await assert.rejects(sql('update liquidacoes_receber set valor=1'),/permission denied/); } finally { await db.exec('reset role'); }
 await sql("select set_config('request.jwt.claim.sub',$1,false)",[operador]);await assert.rejects(painel(),/gerencial/);
 await sql("select set_config('request.jwt.claim.sub',$1,false)",[usuario]);
 assert.equal((await sql("select has_function_privilege('anon','public.financeiro_comando(text,jsonb,uuid)','EXECUTE') as allowed"))[0].allowed,false);
});
test('histórico não aceita reescrita; previsão não joga títulos sem vencimento em hoje',async () => {
 await assert.rejects(sql('update movimentos_financeiros set valor=1'),/imutável/);
 await sql("insert into contas_receber(cliente_id,loja_id,valor_total,valor_aberto) values($1,$2,999999,999999)",[cliente,loja]);
 const p=await painel();assert.equal(p.alertas.ar_sem_vencimento,1);assert.ok(p.fluxo[0].entradas<999999);assert.equal(p.fluxo.length,91);
 await assert.rejects(cmd('MOVIMENTO',{conta_id:banco,data:'2026-10-02',valor:'NaN',direcao:'ENTRADA',categoria_id:categoria,descricao:'Inválido'}),/positivo/);
});

test('cartão de 100 com taxa de 3 deposita exatamente 97, uma única vez',async () => {
 const sale=randomUUID();await sql("insert into vendas values($1,$2,'CONCLUIDA',100,'CARTAO_CREDITO','2026-10-02 15:00:00+00')",[sale,caixa]);
 const r=(await sql('select id from financeiro_recebiveis_venda where venda_id=$1',[sale]))[0].id;
 await cmd('CONFIGURAR_RECEBIVEL',{recebivel_id:r,conta_id:banco,taxa:3,data:'2026-10-02'});
 const before=(await painel()).saldo,key=randomUUID(),dados={recebivel_id:r,data:'2026-10-02'};
 const first=await cmd('RECEBER_VENDA',dados,key);assert.deepEqual(await cmd('RECEBER_VENDA',dados,key),first);
 assert.equal(Math.round(((await painel()).saldo-before)*100),9700);
 await assert.rejects(cmd('RECEBER_VENDA',dados),/Configure taxa, conta e previsão/);
});

test('títulos e históricos são isolados inclusive para DONO e ADMIN; legado sem loja usa seu título',async () => {
 const title=randomUUID(),legacy=randomUUID();
 await sql("insert into contas_receber(id,cliente_id,loja_id,valor_total,valor_aberto) values($1,$2,$3,20,20)",[title,cliente,loja]);
 await sql("insert into liquidacoes_receber(id,titulo_id,valor,forma_pagamento,loja_id) values($1,$2,1,'PIX',null)",[legacy,title]);
 for(const perfil of ['GERENTE','DONO','ADMIN']) {
  await sql('update usuarios set perfil=$1 where id=$2',[perfil,outroUsuario]);
  await sql("select set_config('request.jwt.claim.sub',$1,false)",[outroUsuario]);
  await db.exec('set role authenticated');
  try { for(const table of ['contas_pagar','contas_receber','contas_pagar_pagamentos','liquidacoes_receber','contas_financeiras','movimentos_financeiros','financeiro_comandos','financeiro_recebiveis_venda','extratos_financeiros','conciliacoes_financeiras']) {
   assert.equal((await sql(`select * from ${table}`)).length,0,`${perfil}: ${table}`);
  } } finally {await db.exec('reset role');}
 }
 await sql("select set_config('request.jwt.claim.sub',$1,false)",[usuario]);
 await db.exec('set role authenticated');
 try {assert.equal((await sql('select id from liquidacoes_receber where id=$1',[legacy])).length,1);} finally {await db.exec('reset role');}
});

test('todos os verbos diretos são protegidos; criar AR válido permanece disponível',async () => {
 const tables=['contas_pagar','contas_receber','contas_pagar_pagamentos','liquidacoes_receber','contas_financeiras','movimentos_financeiros','financeiro_comandos','financeiro_recebiveis_venda','extratos_financeiros','conciliacoes_financeiras'];
 for(const role of ['anon','authenticated']) {
  for(const table of tables) for(const verb of ['SELECT','INSERT','UPDATE','DELETE']) {
   const allowed=role==='authenticated' && (verb==='SELECT' || table==='contas_receber' && verb==='INSERT');
   assert.equal((await sql('select has_table_privilege($1,$2,$3) as allowed',[role,`public.${table}`,verb]))[0].allowed,allowed,`${role}.${table}.${verb}`);
  }
  await db.exec(`set role ${role}`);
  try { for(const table of tables) {
   if(role==='anon') await assert.rejects(sql(`select * from ${table}`),/permission denied/);
   await assert.rejects(sql(`update ${table} set id=id`),/permission denied/);
   await assert.rejects(sql(`delete from ${table}`),/permission denied/);
   if(role==='anon' || table!=='contas_receber') await assert.rejects(sql(`insert into ${table} default values`),/permission denied/);
  } } finally {await db.exec('reset role');}
 }
 const otherClient=randomUUID();await sql("insert into clientes values($1,$2,'Outra loja')",[otherClient,outra]);
 await db.exec('set role authenticated');
 try {
  const insert=(client,store,total,open)=>sql("insert into contas_receber(cliente_id,loja_id,valor_total,valor_aberto,status) values($1,$2,$3,$4,'ABERTO') returning id",[client,store,total,open]);
  assert.equal((await insert(cliente,loja,10,10)).length,1);
  for(const args of [[otherClient,loja,10,10],[cliente,outra,10,10],[cliente,loja,10,0],[cliente,loja,'NaN','NaN'],[cliente,loja,10.001,10.001]]) await assert.rejects(insert(...args),/row-level security/);
 } finally {await db.exec('reset role');}
});

test('sem sessão, operador e usuário inativo não executam RPCs financeiras',async () => {
 const assertDenied=async()=>{
  await assert.rejects(painel(),/gerencial|autenticado/);
  await assert.rejects(cmd('CRIAR_CONTA',{nome:'Proibida',tipo:'BANCO',data:'2026-10-01'}),/gerencial/);
  await assert.rejects(sql('select financeiro_candidatos_conciliacao($1)',[randomUUID()]),/gerencial|autenticado/);
 };
 for(const actor of ['',operador]) {await sql("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await assertDenied();}
 await sql("select set_config('request.jwt.claim.sub',$1,false)",[usuario]);await sql('update usuarios set ativo=false where id=$1',[usuario]);
 try {
  await assertDenied();await db.exec('set role authenticated');
  try {assert.equal((await sql('select * from contas_receber')).length,0);} finally {await db.exec('reset role');}
 } finally {await sql('update usuarios set ativo=true where id=$1',[usuario]);}
 for(const role of ['anon','authenticated']) {
  const fns=await sql("select p.oid::regprocedure::text as name,has_function_privilege($1,p.oid,'EXECUTE') as allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='internal' and p.proname like 'financeiro_%'",[role]);
  assert.ok(fns.length>=9);assert.ok(fns.every(f=>!f.allowed));
 }
 await db.exec('set role anon');
 try {
  await assert.rejects(painel(),/permission denied/);
  await assert.rejects(cmd('CRIAR_CONTA',{nome:'Anônimo',tipo:'BANCO',data:'2026-10-01'}),/permission denied/);
  await assert.rejects(sql('select financeiro_candidatos_conciliacao($1)',[randomUUID()]),/permission denied/);
 } finally {await db.exec('reset role');}
});

test('cancelar PIX ainda pendente não cria depósito nem saída bancária',async () => {
 const sale=randomUUID(),before=(await painel()).saldo;
 await sql("insert into vendas values($1,$2,'CONCLUIDA',50,'PIX','2026-10-02 15:00:00+00')",[sale,caixa]);
 await db.exec(`begin;insert into devolucoes(id,venda_id,valor,forma_pagamento) values('${randomUUID()}','${sale}',50,'PIX');update vendas set status='CANCELADA' where id='${sale}';commit;`);
 assert.equal((await painel()).saldo,before);
 assert.equal((await sql('select status from financeiro_recebiveis_venda where venda_id=$1',[sale]))[0].status,'CANCELADO');
 assert.equal(Number((await sql("select count(*) as n from movimentos_financeiros where origem='VENDA' and origem_id in(select id from financeiro_recebiveis_venda where venda_id=$1)",[sale]))[0].n),0);
});

test('aceite: saldo 5000 + pix 2000 − pagamento 800 = 6200; vínculo forma; inativar',async () => {
 const conta=(await cmd('CRIAR_CONTA',{nome:'Banco Aceite',tipo:'BANCO',data:'2026-10-01',valor:5000})).id;
 await cmd('VINCULAR_FORMA_PAGAMENTO',{codigo:'PIX',conta_id:conta});
 const formas=(await painel()).formas_pagamento;
 assert.equal(formas.find(f=>f.codigo==='PIX')?.conta_financeira_id,conta);
 await assert.rejects(cmd('VINCULAR_FORMA_PAGAMENTO',{codigo:'DINHEIRO',conta_id:conta}),/caixa\/reserva/);
 await cmd('VINCULAR_FORMA_PAGAMENTO',{codigo:'DINHEIRO',conta_id:reserva});
 await cmd('MOVIMENTO',{conta_id:conta,direcao:'ENTRADA',categoria_id:categoria,descricao:'Pix recebido aceite',valor:2000,data:'2026-10-03'});
 await cmd('CRIAR_AP',{descricao:'Despesa aceite',favorecido:'Fornecedor',categoria_id:categoria,valor:800,data:'2026-10-04',parcelas:1});
 const titulo=(await sql("select id from contas_pagar where descricao='Despesa aceite' order by criado_em desc limit 1"))[0].id;
 // Compra a prazo: obrigação sem reduzir saldo
 assert.equal(Number((await sql('select coalesce(sum(valor),0) as s from movimentos_financeiros where conta_financeira_id=$1',[conta]))[0].s),7000);
 await cmd('BAIXAR_AP',{titulo_id:titulo,conta_id:conta,valor:800,data:'2026-10-04',descricao:'Pagamento aceite'});
 assert.equal(Number((await sql('select coalesce(sum(valor),0) as s from movimentos_financeiros where conta_financeira_id=$1',[conta]))[0].s),6200);
 const p=await painel();
 const row=p.contas.find(c=>c.id===conta);
 assert.equal(Number(row.saldo),6200);
 assert.ok(Number(row.entradas_periodo)>=2000);
 const key=randomUUID();
 await cmd('VINCULAR_FORMA_PAGAMENTO',{codigo:'PIX',conta_id:''},key);
 assert.deepEqual(await cmd('VINCULAR_FORMA_PAGAMENTO',{codigo:'PIX',conta_id:''},key),await cmd('VINCULAR_FORMA_PAGAMENTO',{codigo:'PIX',conta_id:''},key));
 await cmd('INATIVAR_CONTA',{conta_id:conta});
 assert.equal((await sql('select ativo from contas_financeiras where id=$1',[conta]))[0].ativo,false);
 assert.equal(Number((await sql('select count(*) as n from movimentos_financeiros where conta_financeira_id=$1',[conta]))[0].n)>0,true);
});

test('transferência 500 reduz origem e aumenta destino sem alterar consolidado',async () => {
 const a=(await cmd('CRIAR_CONTA',{nome:'Origem T',tipo:'BANCO',data:'2026-10-01',valor:1000})).id;
 const b=(await cmd('CRIAR_CONTA',{nome:'Destino T',tipo:'BANCO',data:'2026-10-01',valor:100})).id;
 const antes=Number((await sql('select coalesce(sum(valor),0) as s from movimentos_financeiros where conta_financeira_id in ($1,$2)',[a,b]))[0].s);
 await cmd('TRANSFERIR',{conta_id:a,destino_id:b,valor:500,data:'2026-10-05'});
 assert.equal(Number((await sql('select coalesce(sum(valor),0) as s from movimentos_financeiros where conta_financeira_id=$1',[a]))[0].s),500);
 assert.equal(Number((await sql('select coalesce(sum(valor),0) as s from movimentos_financeiros where conta_financeira_id=$1',[b]))[0].s),600);
 assert.equal(Number((await sql('select coalesce(sum(valor),0) as s from movimentos_financeiros where conta_financeira_id in ($1,$2)',[a,b]))[0].s),antes);
});
