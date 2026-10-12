import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const lojaA = randomUUID()
const lojaB = randomUUID()
const vendedorA = randomUUID()
const caixaA = randomUUID()
const caixaB = randomUUID()
const gerenteA = randomUUID()
const gerenteB = randomUUID()
const inativo = randomUUID()
const produtoA = randomUUID()
const produtoB = randomUUID()
const clienteA = randomUUID()
const clienteB = randomUUID()

let db
const sql = async (query, params = []) => (await db.query(query, params)).rows

function migration(name) {
  return readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
}

async function como(uid) {
  await sql(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ''])
  await sql(`select set_config('request.jwt.claim.role', 'authenticated', false)`)
  await db.exec('set role authenticated')
}

async function privilegiado() {
  await sql(`select set_config('request.jwt.claim.sub', '', false)`)
  await sql(`select set_config('request.jwt.claim.role', '', false)`)
  await db.exec('reset role')
}

test('PALM V1 em Postgres isolado (PGlite)', async () => {
  db = await PGlite.create()
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '') $$;
    create table lojas(id uuid primary key);
    create table usuarios(id uuid primary key, loja_id uuid, perfil text, ativo boolean, nome text);
    create table clientes(id uuid primary key, loja_id uuid, nome text);
    create table caixas(id uuid primary key, loja_id uuid);
    create table produtos(
      id uuid primary key, loja_id uuid not null, nome text, preco_varejo numeric(10,2),
      ativo boolean, codigo_barras text, codigo_interno text, observacao text,
      imagem_url text, localizacao_prateleira text
    );
    create table precos_atacado(
      id uuid primary key default gen_random_uuid(), produto_id uuid, loja_id uuid,
      preco_unitario numeric(10,2), quantidade_minima integer, ativo boolean
    );
    create table estoque(
      produto_id uuid, loja_id uuid, quantidade_atual numeric, estoque_minimo numeric,
      primary key (produto_id, loja_id)
    );
    create table estoque_writes(n int);
    insert into estoque_writes values (0);
    create or replace function public.contar_write_estoque() returns trigger language plpgsql as $$
    begin
      update estoque_writes set n = n + 1;
      return new;
    end $$;
    create trigger trg_estoque_write after update or insert or delete on estoque
      for each row execute function public.contar_write_estoque();
    create table vendas_em_espera (
      id uuid primary key default gen_random_uuid(),
      loja_id uuid not null,
      operador_id uuid not null,
      caixa_id uuid,
      numero_local integer not null,
      rotulo text,
      itens jsonb not null default '[]'::jsonb,
      totais jsonb not null default '{}'::jsonb,
      cliente_id uuid,
      desconto_gerente_percentual numeric(5,2),
      desconto_gerente_token text,
      status text not null default 'EM_ESPERA'
        check (status in ('EM_ESPERA', 'RETOMADA', 'CONVERTIDA', 'DESCARTADA')),
      criada_em timestamptz not null default now(),
      atualizada_em timestamptz not null default now(),
      descartada_motivo text
    );
    create or replace function public.proximo_numero_venda_em_espera(p_operador_id uuid)
    returns integer language sql stable as $$
      select coalesce(max(numero_local), 0) + 1
      from public.vendas_em_espera
      where operador_id = p_operador_id and status = 'EM_ESPERA'
    $$;
    grant usage on schema public, auth to authenticated, anon;
    grant select on usuarios, clientes, produtos, estoque, precos_atacado, caixas to authenticated;
  `)
  await db.exec(migration('20261012150000_palm_v1_isolamento_preco_sessao.sql'))
  await db.exec(migration('20261012150100_palm_v1_pedidos_assistidos.sql'))

  await sql(
    `insert into lojas values ($1), ($2)`,
    [lojaA, lojaB],
  )
  await sql(
    `insert into usuarios values
      ($1,$2,'OPERADOR',true,'Vendedora A'),
      ($3,$2,'OPERADOR',true,'Caixa A'),
      ($4,$5,'GERENTE',true,'Gerente B'),
      ($6,$2,'GERENTE',true,'Gerente A'),
      ($7,$2,'OPERADOR',false,'Inativo')`,
    [vendedorA, lojaA, caixaA, gerenteB, lojaB, gerenteA, inativo],
  )
  await sql(`insert into clientes values ($1,$2,'Cliente A'), ($3,$4,'Cliente B')`, [clienteA, lojaA, clienteB, lojaB])
  await sql(`insert into caixas values ($1,$2)`, [randomUUID(), lojaA])
  await sql(
    `insert into produtos values
      ($1,$2,'Caneca', 10.00, true, '789', 'C-1', 'Caneca azul', null, 'A1'),
      ($3,$4,'Outra loja', 8.00, true, '111', 'O-1', 'Nao ver', null, 'Z9')`,
    [produtoA, lojaA, produtoB, lojaB],
  )
  await sql(
    `insert into precos_atacado (produto_id, loja_id, preco_unitario, quantidade_minima, ativo)
     values ($1,$2,7.00,10,true)`,
    [produtoA, lojaA],
  )
  await sql(
    `insert into estoque values ($1,$2,20,5), ($3,$4,4,1)`,
    [produtoA, lojaA, produtoB, lojaB],
  )
  await privilegiado()
  await sql(`update estoque_writes set n = 0`)

  await db.exec('set role anon')
  await assert.rejects(
    sql(`select public.calcular_preco_produto($1, 1, $2)`, [produtoA, lojaA]),
    /permission denied/i,
  )
  console.log('PASS anon nao executa calcular_preco_produto')
  await privilegiado()

  const def = (await sql(
    `select pg_get_functiondef('internal.palm_sessao_privilegiada()'::regprocedure) as d`,
  ))[0].d
  await db.exec(`create or replace function internal.palm_sessao_privilegiada() returns boolean language sql as $$ select false $$`)
  const semSessao = (await sql(
    `select public.calcular_preco_produto($1, 1, $2) as j`,
    [produtoA, lojaA],
  ))[0].j
  assert.equal(semSessao.erro, 'nao_autorizado')
  await db.exec(def)
  console.log('PASS sem JWT a RPC de preco recusa')

  await como(vendedorA)
  const lojaErrada = (await sql(
    `select public.calcular_preco_produto($1, 1, $2) as j`,
    [produtoB, lojaB],
  ))[0].j
  assert.equal(lojaErrada.erro, 'loja_nao_autorizada')
  const produtoAlheio = (await sql(
    `select public.calcular_preco_produto($1, 1, $2) as j`,
    [produtoB, lojaA],
  ))[0].j
  assert.equal(produtoAlheio.erro, 'produto_nao_encontrado')
  const varejo = (await sql(
    `select public.calcular_preco_produto($1, 1, $2) as j`,
    [produtoA, lojaA],
  ))[0].j
  assert.equal(Number(varejo.preco), 10)
  assert.equal(varejo.tipo, 'VAREJO')
  const atacado = (await sql(
    `select public.calcular_preco_produto($1, 10, $2) as j`,
    [produtoA, lojaA],
  ))[0].j
  assert.equal(Number(atacado.preco), 7)
  assert.equal(atacado.tipo, 'ATACADO')
  assert.equal(Number(atacado.quantidade_minima), 10)
  console.log('PASS preco da sessao: varejo, atacado e loja alheia')

  await como(inativo)
  const inativoPreco = (await sql(
    `select public.calcular_preco_produto($1, 1, $2) as j`,
    [produtoA, lojaA],
  ))[0].j
  assert.equal(inativoPreco.erro, 'nao_autorizado')
  await assert.rejects(
    sql(`select public.enviar_pedido_palm($1, $2::jsonb, null)`, [
      randomUUID(),
      JSON.stringify([{ produto_id: produtoA, quantidade: 1 }]),
    ]),
    /nao_autorizado/,
  )
  console.log('PASS usuario inativo nao precifica nem envia')

  await privilegiado()
  await sql(
    `insert into vendas_em_espera (loja_id, operador_id, numero_local, itens, origem)
     values ($1, $2, 1, '[{"produto_id":"x"}]'::jsonb, 'CAIXA')`,
    [lojaB, gerenteB],
  )
  await como(gerenteA)
  const vazou = await sql(`select id from vendas_em_espera where loja_id = $1`, [lojaB])
  assert.equal(vazou.length, 0)
  await assert.rejects(
    sql(
      `insert into vendas_em_espera (loja_id, operador_id, numero_local, itens)
       values ($1, $2, 9, '[]'::jsonb)`,
      [lojaB, gerenteA],
    ),
    /permission denied/i,
  )
  console.log('PASS RLS: gerente da loja A nao le nem grava a loja B')

  await como(vendedorA)
  const req = randomUUID()
  const payloadBarato = JSON.stringify([
    { produto_id: produtoA, quantidade: 10, preco_unitario: 0.01 },
  ])
  const enviado = (await sql(
    `select public.enviar_pedido_palm($1, $2::jsonb, $3) as j`,
    [req, payloadBarato, clienteA],
  ))[0].j
  const repetido = (await sql(
    `select public.enviar_pedido_palm($1, $2::jsonb, $3) as j`,
    [req, payloadBarato, clienteA],
  ))[0].j
  assert.equal(repetido.id, enviado.id)
  assert.equal(repetido.idempotente, true)
  await privilegiado()
  const gravados = await sql(
    `select itens, status, origem from vendas_em_espera where id = $1`,
    [enviado.id],
  )
  assert.equal(gravados.length, 1)
  assert.equal(Number(gravados[0].itens[0].preco_unitario), 7)
  assert.equal(gravados[0].origem, 'PALM')
  const writesDepoisEnvio = (await sql(`select n from estoque_writes`))[0].n
  assert.equal(Number(writesDepoisEnvio), 0)
  console.log('PASS idempotencia e preco do servidor (cliente pediu 0.01, gravou 7)')

  await como(vendedorA)
  await assert.rejects(
    sql(`select public.enviar_pedido_palm($1, $2::jsonb, null)`, [
      req,
      JSON.stringify([{ produto_id: produtoA, quantidade: 1 }]),
    ]),
    /pedido_idempotencia_payload_divergente/,
  )
  await assert.rejects(
    sql(`select public.enviar_pedido_palm($1, $2::jsonb, $3)`, [
      randomUUID(),
      JSON.stringify([{ produto_id: produtoA, quantidade: 1 }]),
      clienteB,
    ]),
    /cliente_invalido/,
  )
  await assert.rejects(
    sql(`select public.enviar_pedido_palm($1, $2::jsonb, null)`, [
      randomUUID(),
      JSON.stringify([{ produto_id: produtoA, quantidade: 21 }]),
    ]),
    /estoque_insuficiente/,
  )
  await privilegiado()
  const estoqueAinda = (await sql(
    `select quantidade_atual from estoque where produto_id = $1`,
    [produtoA],
  ))[0].quantidade_atual
  assert.equal(Number(estoqueAinda), 20)
  const pedidosPalm = (await sql(
    `select count(*)::int as n from vendas_em_espera where origem = 'PALM'`,
  ))[0].n
  assert.equal(pedidosPalm, 1)
  console.log('PASS estoque insuficiente nao grava e nao baixa saldo')

  await como(vendedorA)
  const meus = (await sql(`select public.listar_meus_pedidos_palm() as j`))[0].j
  assert.equal(meus.length, 1)
  assert.equal(meus[0].id, enviado.id)
  console.log('PASS vendedor lista o proprio pedido PALM')
  const listaCaixa = (await sql(`select public.listar_vendas_em_espera() as j`))[0].j
  assert.equal(listaCaixa.length, 0)
  await assert.rejects(
    sql(`select public.retomar_venda_em_espera($1)`, [enviado.id]),
    /pedido_palm_use_assumir/,
  )
  const espera = (await sql(
    `select public.colocar_venda_em_espera($1::jsonb, '{}'::jsonb) as j`,
    [JSON.stringify([{ produto_id: produtoA, nome: 'Caneca' }])],
  ))[0].j
  const listaDepois = (await sql(`select public.listar_vendas_em_espera() as j`))[0].j
  assert.equal(listaDepois.length, 1)
  assert.equal(listaDepois[0].id, espera.id)
  const retomada = (await sql(`select public.retomar_venda_em_espera($1) as j`, [espera.id]))[0].j
  assert.equal(retomada.id, espera.id)
  await assert.rejects(
    sql(`select public.retomar_venda_em_espera($1)`, [espera.id]),
    /venda_em_espera_em_uso/,
  )
  await sql(`select public.devolver_venda_em_espera($1)`, [espera.id])
  console.log('PASS espera tradicional segue exclusiva e nao lista PALM')

  await como(gerenteB)
  const alheios = (await sql(`select public.listar_pedidos_palm_disponiveis() as j`))[0].j
  assert.equal(alheios.length, 0)
  await assert.rejects(
    sql(`select public.assumir_pedido_palm($1)`, [enviado.id]),
    /venda_em_espera_nao_encontrada/,
  )
  console.log('PASS caixa de outra loja nao ve nem assume')

  await como(caixaA)
  const disponiveis = (await sql(`select public.listar_pedidos_palm_disponiveis() as j`))[0].j
  assert.equal(disponiveis.length, 1)
  assert.equal(disponiveis[0].vendedor_nome, 'Vendedora A')
  const assumido = (await sql(`select public.assumir_pedido_palm($1) as j`, [enviado.id]))[0].j
  assert.equal(assumido.bloqueado, false)
  assert.equal(assumido.status, 'RETOMADA')
  assert.equal(assumido.preco_alterado, false)
  await como(gerenteA)
  await assert.rejects(
    sql(`select public.assumir_pedido_palm($1)`, [enviado.id]),
    /pedido_ja_assumido/,
  )
  console.log('PASS so um operador assume; o segundo recebe pedido_ja_assumido')

  await como(caixaA)
  await sql(`select public.devolver_venda_em_espera($1)`, [enviado.id])
  await como(gerenteA)
  const reassumido = (await sql(`select public.assumir_pedido_palm($1) as j`, [enviado.id]))[0].j
  assert.equal(reassumido.status, 'RETOMADA')
  await como(caixaA)
  await assert.rejects(
    sql(`select public.converter_venda_em_espera($1)`, [enviado.id]),
    /permissao_negada/,
  )
  await como(gerenteA)
  const convertido = (await sql(`select public.converter_venda_em_espera($1) as j`, [enviado.id]))[0].j
  assert.equal(convertido.status, 'CONVERTIDA')
  const deNovo = (await sql(`select public.converter_venda_em_espera($1) as j`, [enviado.id]))[0].j
  assert.equal(deNovo.status, 'CONVERTIDA')
  console.log('PASS devolver libera; converter so quem assumiu; segunda vez e idempotente')

  await privilegiado()
  await sql(`update produtos set preco_varejo = 12 where id = $1`, [produtoA])
  await sql(`update estoque set quantidade_atual = 3 where produto_id = $1`, [produtoA])
  await sql(`update estoque_writes set n = 0`)
  const req2 = randomUUID()
  await como(vendedorA)
  const segundo = (await sql(
    `select public.enviar_pedido_palm($1, $2::jsonb, null) as j`,
    [req2, JSON.stringify([{ produto_id: produtoA, quantidade: 2 }])],
  ))[0].j
  await privilegiado()
  await sql(`update produtos set preco_varejo = 15 where id = $1`, [produtoA])
  await como(caixaA)
  const mudou = (await sql(`select public.assumir_pedido_palm($1) as j`, [segundo.id]))[0].j
  assert.equal(mudou.preco_alterado, true)
  assert.equal(Number(mudou.itens[0].preco_unitario), 15)
  assert.equal(mudou.bloqueado, false)
  await privilegiado()
  await sql(`update estoque set quantidade_atual = 1 where produto_id = $1`, [produtoA])
  await como(caixaA)
  const bloqueado = (await sql(`select public.assumir_pedido_palm($1) as j`, [segundo.id]))[0].j
  assert.equal(bloqueado.bloqueado, true)
  assert.equal(bloqueado.motivo, 'estoque_insuficiente')
  assert.equal(bloqueado.status, 'RETOMADA')
  const cancelado = (await sql(
    `select public.cancelar_pedido_palm($1, 'sem saldo na loja') as j`,
    [segundo.id],
  ))[0].j
  assert.equal(cancelado.status, 'DESCARTADA')
  await privilegiado()
  const saldoFinal = (await sql(
    `select quantidade_atual from estoque where produto_id = $1`,
    [produtoA],
  ))[0].quantidade_atual
  assert.equal(Number(saldoFinal), 1)
  const writes = (await sql(`select n from estoque_writes`))[0].n
  assert.equal(Number(writes), 1)
  const eventos = await sql(
    `select tipo from vendas_em_espera_eventos where venda_em_espera_id = $1 order by criado_em`,
    [segundo.id],
  )
  const tipos = eventos.map((e) => e.tipo)
  assert.ok(tipos.includes('ENVIADO'))
  assert.ok(tipos.includes('PRECO_ALTERADO'))
  assert.ok(tipos.includes('ESTOQUE_BLOQUEADO'))
  assert.ok(tipos.includes('CANCELADO'))
  console.log('PASS revalidacao de preco, bloqueio de estoque e trilha de auditoria')
  console.log('NOTA concorrencia simultanea de duas conexoes: nao executada (PGlite usa uma sessao). O segundo claim apos o commit foi rejeitado.')

  await db.close()
})
