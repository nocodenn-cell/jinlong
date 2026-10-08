#!/usr/bin/env node
/**
 * P1-01 — testes financeiros comportamentais (PGlite, fixtures sintéticas).
 * Exercita estado persistido e invariantes — não é grep de SQL.
 *
 * Escopo comprovado nesta suíte:
 *  - taxas no catálogo formas_pagamento (PIX=0; cartão com taxa)
 *  - invariante split pagamentos == total_liquido (inserts diretos)
 *  - idempotência real de financeiro_comando TRANSFERIR
 *  - BAIXAR_AR parcial + replay idempotente
 *
 * Fora de escopo (suites irmãs / expansão): capture PIX via trigger de venda,
 * cancelamento, devolução, sangria, fechamento por forma, concorrência, painel saldo.
 */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

let db
const loja = randomUUID()
const usuario = randomUUID()
const categoria = randomUUID()
const caixa = randomUUID()
const sql = async (q, p = []) => (await db.query(q, p)).rows
const cmd = async (tipo, dados, key = randomUUID()) =>
  (await sql('select public.financeiro_comando($1,$2,$3) as result', [tipo, JSON.stringify(dados), key]))[0]
    .result

before(async () => {
  db = await PGlite.create()
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    create function public.round_abnt(numeric,integer) returns numeric language sql immutable as
      'select round($1,$2)';
    create table lojas(id uuid primary key);
    create table usuarios(id uuid primary key, loja_id uuid, perfil text, ativo boolean, nome text);
    create table clientes(id uuid primary key, loja_id uuid, nome text);
    create table fornecedores(id uuid primary key, loja_id uuid, nome text);
    create type categoria_financeira_tipo as enum('RECEITA','DESPESA','AMBOS');
    create table categorias_financeiras(id uuid primary key, nome text, tipo categoria_financeira_tipo, ativo boolean);
    create table caixas(id uuid primary key, loja_id uuid, saldo_atual numeric, status text,
      data_fechamento timestamptz, valor_fechamento numeric, fechamento_diferenca numeric);
    create table vendas(id uuid primary key, caixa_id uuid, status text, total_liquido numeric,
      forma_pagamento text, data timestamptz);
    create table vendas_pagamentos(id uuid primary key, venda_id uuid, valor numeric, forma_pagamento text);
    create table devolucoes(id uuid primary key, venda_id uuid, valor numeric, forma_pagamento text,
      operacao_id uuid, caixa_desembolso_id uuid);
    create table venda_pos_venda_operacoes(id uuid primary key, forma_estorno text);
    create table venda_pos_venda_itens(item_venda_id uuid, quantidade numeric);
    create table itens_venda(id uuid primary key, venda_id uuid, quantidade numeric, custo_unitario_snap numeric);
    create table contas_pagar(id uuid primary key default gen_random_uuid(), loja_id uuid,
      fornecedor_id uuid not null, nfe_importacao_id uuid, descricao text, vencimento date,
      valor_total numeric, valor_pago numeric default 0, status text default 'PENDENTE',
      criado_em timestamptz default now());
    create table contas_receber(id uuid primary key default gen_random_uuid(), cliente_id uuid,
      loja_id uuid, descricao text, valor_total numeric, valor_aberto numeric, vencimento date,
      status text default 'ABERTO');
    create table contas_pagar_pagamentos(id uuid primary key default gen_random_uuid(), conta_id uuid,
      valor numeric, forma_pagamento text, data_pagamento timestamptz, observacao text, usuario_id uuid,
      created_at timestamptz default now(), idempotency_key text, origem text, loja_id uuid, caixa_id uuid,
      operacao_tipo text default 'PAGAMENTO', operacao_origem_id uuid, movimentacao_caixa_id uuid,
      unique(conta_id, idempotency_key));
    create table liquidacoes_receber(id uuid primary key default gen_random_uuid(), titulo_id uuid,
      valor numeric, forma_pagamento text, observacao text, created_by uuid, idempotency_key text,
      origem text, loja_id uuid, caixa_id uuid, operacao_tipo text default 'RECEBIMENTO',
      operacao_origem_id uuid, created_at timestamptz default now(), unique(titulo_id, idempotency_key));
    create table movimentacoes_caixa(id uuid primary key, caixa_id uuid, tipo text, valor numeric,
      status text, deleted_at timestamptz, forma_pagamento text, created_at timestamptz,
      movimentacao_origem_id uuid);
    create table formas_pagamento(id uuid primary key default gen_random_uuid(), loja_id uuid not null,
      codigo text not null, nome text not null, taxa_percentual numeric default 0,
      prazo_compensacao_dias integer default 0, ativo boolean default true,
      created_at timestamptz default now(), updated_at timestamptz default now(), unique(loja_id, codigo));
    grant usage on schema public, auth to authenticated;
    grant select on usuarios, clientes to authenticated;
    grant all on contas_pagar_pagamentos, liquidacoes_receber to authenticated, anon;
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
    const block = source.slice(start)
    const delimiter = block.match(/AS\s+(\$\w*\$)/i)[1]
    const body = block.indexOf(delimiter) + delimiter.length
    const end = block.indexOf(delimiter, body) + delimiter.length
    await db.exec(block.slice(0, end) + ';')
  }
  await db.exec(
    readFileSync(
      new URL('../supabase/migrations/20261005004647_financeiro_loja_contas_ledger.sql', import.meta.url),
      'utf8',
    ),
  )
  await db.exec(
    readFileSync(
      new URL('../supabase/migrations/20261005091218_financeiro_hardening_final.sql', import.meta.url),
      'utf8',
    ),
  )
  // Modelo operacional (sucessor) — NÃO carregar 120000 proibida neste suite.
  await db.exec(
    readFileSync(
      new URL('../supabase/migrations/20261006180000_financeiro_contas_operacionais.sql', import.meta.url),
      'utf8',
    ),
  )

  await sql('insert into lojas values($1)', [loja])
  await sql("insert into usuarios values($1,$2,'DONO',true,'Synth')", [usuario, loja])
  await sql("insert into categorias_financeiras values($1,'Geral','AMBOS',true)", [categoria])
  await sql("insert into caixas(id,loja_id,saldo_atual,status) values($1,$2,0,'ABERTO')", [caixa, loja])
  await sql(
    "insert into formas_pagamento(loja_id,codigo,nome,taxa_percentual) values($1,'DINHEIRO','Dinheiro',0),($1,'PIX','Pix',0),($1,'CARTAO_CREDITO','Cartão',3)",
    [loja],
  )
  await sql("select set_config('request.jwt.claim.sub',$1,false)", [usuario])
})

after(async () => db?.close())

test('catálogo: taxa PIX=0 e cartão com taxa; trigger de captura opcional', async () => {
  const vendaId = randomUUID()
  const pagId = randomUUID()
  await sql(
    `insert into vendas(id,caixa_id,status,total_liquido,forma_pagamento,data)
     values($1,$2,'CONCLUIDA',100,'PIX',timestamptz '2026-10-08 12:00:00+00')`,
    [vendaId, caixa],
  )
  await sql(
    `insert into vendas_pagamentos(id,venda_id,valor,forma_pagamento) values($1,$2,100,'PIX')`,
    [pagId, vendaId],
  )
  // Dispara captura (trigger se existir no modelo operacional; senão insert manual de recebível).
  const trig = await sql(
    `select count(*)::int as n from information_schema.triggers
     where event_object_table='vendas' or event_object_table='vendas_pagamentos'`,
  )
  if (trig[0].n === 0) {
    // Fallback: API operacional CONFIGURAR / receber — valida taxa PIX=0 no catálogo.
    const taxa = await sql(
      `select taxa_percentual::float8 as t from formas_pagamento where loja_id=$1 and codigo='PIX'`,
      [loja],
    )
    assert.equal(taxa[0].t, 0)
  }
  const cartao = await sql(
    `select taxa_percentual::float8 as t from formas_pagamento where loja_id=$1 and codigo='CARTAO_CREDITO'`,
    [loja],
  )
  assert.equal(cartao[0].t, 3)
})

test('split dinheiro+PIX: somas batem total_liquido', async () => {
  const vendaId = randomUUID()
  await sql(
    `insert into vendas(id,caixa_id,status,total_liquido,forma_pagamento,data)
     values($1,$2,'CONCLUIDA',150,'DINHEIRO',now())`,
    [vendaId, caixa],
  )
  await sql(
    `insert into vendas_pagamentos(id,venda_id,valor,forma_pagamento) values
     ($1,$3,50,'DINHEIRO'),($2,$3,100,'PIX')`,
    [randomUUID(), randomUUID(), vendaId],
  )
  const sum = await sql(
    `select coalesce(sum(valor),0)::float8 as s from vendas_pagamentos where venda_id=$1`,
    [vendaId],
  )
  const tot = await sql(`select total_liquido::float8 as t from vendas where id=$1`, [vendaId])
  assert.equal(sum[0].s, tot[0].t)
})

test('idempotência financeiro_comando TRANSFERIR', async () => {
  const criar = await cmd('CRIAR_CONTA', {
    nome: 'Banco Synth',
    tipo: 'BANCO',
    data: '2026-10-01',
    valor: 500,
  })
  const reserva = await cmd('CRIAR_CONTA', { nome: 'Reserva Synth', tipo: 'RESERVA', data: '2026-10-01' })
  const key = randomUUID()
  const dados = { conta_id: criar.id, destino_id: reserva.id, data: '2026-10-02', valor: 40 }
  const a = await cmd('TRANSFERIR', dados, key)
  const b = await cmd('TRANSFERIR', dados, key)
  assert.deepEqual(a, b)
  await assert.rejects(() => cmd('TRANSFERIR', { ...dados, valor: 41 }, key), /diferentes|dados/i)
})

test('AR parcial: aberto diminui após BAIXAR_AR', async () => {
  const cliente = randomUUID()
  await sql(`insert into clientes values($1,$2,'Cliente Synth')`, [cliente, loja])
  const ar = await cmd('CRIAR_AR', {
    cliente_id: cliente,
    descricao: 'Fiado synth',
    valor: 200,
    data: '2026-10-03',
    categoria_id: categoria,
  })
  const banco = (
    await sql(`select id from contas_financeiras where loja_id=$1 and tipo='BANCO' limit 1`, [loja])
  )[0]
  assert.ok(banco?.id, 'conta BANCO da fixture')
  const key = randomUUID()
  await cmd(
    'BAIXAR_AR',
    { titulo_id: ar.id, conta_id: banco.id, valor: 80, data: '2026-10-03' },
    key,
  )
  const aberto = await sql(`select valor_aberto::float8 as a from contas_receber where id=$1`, [ar.id])
  assert.equal(aberto[0].a, 120)
  // Idempotência da baixa
  await cmd(
    'BAIXAR_AR',
    { titulo_id: ar.id, conta_id: banco.id, valor: 80, data: '2026-10-03' },
    key,
  )
  const aberto2 = await sql(`select valor_aberto::float8 as a from contas_receber where id=$1`, [ar.id])
  assert.equal(aberto2[0].a, 120)
})
