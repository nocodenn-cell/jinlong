/**
 * Integridade financeira pós-OPS-02 em Postgres descartável (PGlite).
 * Executa os corpos reais de E(c), por-forma, fechamento e cancelar_venda.
 * Fixtures sintéticas. Sem PII e sem remoto.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const migration = (name) =>
  readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

const loja = randomUUID();
const operador = randomUUID();
const gerente = randomUUID();
let db;

async function rows(sql, params = []) {
  return (await db.query(sql, params)).rows;
}

async function numero(sql, params = []) {
  const value = (await rows(sql, params))[0]?.n;
  return Number(value);
}

before(async () => {
  db = await PGlite.create();
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS internal;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE FUNCTION public.round_abnt(numeric, integer) RETURNS numeric
      LANGUAGE sql IMMUTABLE AS $$ SELECT round($1, $2) $$;
    CREATE TABLE lojas(id uuid PRIMARY KEY, nome text);
    CREATE TABLE usuarios(
      id uuid PRIMARY KEY, loja_id uuid, perfil text, ativo boolean, nome text
    );
    CREATE TABLE caixas(
      id uuid PRIMARY KEY,
      operador_id uuid,
      loja_id uuid,
      status text,
      valor_inicial numeric(10,2),
      saldo_atual numeric(10,2),
      data_abertura timestamptz DEFAULT now(),
      data_fechamento timestamptz,
      valor_fechamento numeric(10,2),
      fechamento_diferenca numeric(10,2),
      fechamento_observacao text
    );
    CREATE TABLE vendas(
      id uuid PRIMARY KEY,
      caixa_id uuid,
      operador_id uuid,
      loja_id uuid,
      status text,
      forma_pagamento text,
      total_bruto numeric,
      total_liquido numeric,
      tipo_venda text
    );
    CREATE TABLE vendas_pagamentos(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      venda_id uuid,
      forma_pagamento text,
      valor numeric
    );
    CREATE TABLE devolucoes(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      venda_id uuid,
      valor numeric,
      forma_pagamento text,
      motivo text,
      operador_id uuid,
      caixa_desembolso_id uuid,
      operacao_id uuid
    );
    CREATE UNIQUE INDEX uq_devolucoes_venda_dinheiro_legacy
      ON devolucoes (venda_id)
      WHERE forma_pagamento = 'DINHEIRO' AND operacao_id IS NULL;
    CREATE TABLE liquidacoes_receber(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      caixa_id uuid, forma_pagamento text, valor numeric, operacao_tipo text
    );
    CREATE TABLE movimentos_caixa(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      caixa_id uuid, tipo text, valor numeric
    );
    CREATE TABLE movimentacoes_caixa(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      caixa_id uuid, tipo text, valor numeric, status text,
      deleted_at timestamptz, forma_pagamento text, movimentacao_origem_id uuid
    );
    CREATE TABLE contas_receber(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      venda_id uuid, valor_aberto numeric, status text
    );
    CREATE TABLE venda_pos_venda_operacoes(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      venda_id uuid, valor_estornado numeric
    );
    CREATE TABLE itens_venda(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      venda_id uuid, produto_id uuid, quantidade numeric
    );
    CREATE TABLE vendas_canceladas_auditoria(
      venda_id uuid PRIMARY KEY,
      caixa_id uuid, operador_id uuid, motivo text,
      forma_pagamento text, valor_estornado numeric
    );
    CREATE FUNCTION public.venda_eventos_items_from_sale(p_sale_id uuid)
      RETURNS jsonb LANGUAGE sql AS $$ SELECT '[]'::jsonb $$;
    CREATE FUNCTION public.registrar_venda_evento(
      p_event_type text, p_sale_id uuid, p_source text, p_caixa_id uuid,
      p_operador_id uuid, p_loja_id uuid, p_items jsonb, p_total numeric,
      p_total_bruto numeric, p_forma_pagamento text, p_cancelled boolean DEFAULT false
    ) RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
    INSERT INTO lojas VALUES ('${loja}', 'Loja sintetica');
    INSERT INTO usuarios VALUES
      ('${operador}', '${loja}', 'OPERADOR', true, 'Op'),
      ('${gerente}', '${loja}', 'GERENTE', true, 'Ger');
  `);
  await db.exec(migration("20261001100100_c3_internal_autoridade_resolvedor_cache.sql"));
  await db.exec(migration("20261007180000_calcular_valor_sistema_por_forma_caixa.sql"));
  await db.exec(migration("20261007190000_caixas_fechamento_formas_snapshot.sql"));
  await db.exec(migration("20261007171000_ssot_002_cancel_guard_antes_devolucao.sql"));
});

after(async () => {
  await db?.close();
});

test("saldo_atual é cache: sync iguala E(c) e caixa fechado não é reescrito", async () => {
  const aberto = randomUUID();
  const fechado = randomUUID();
  await db.exec(`
    INSERT INTO caixas (id, operador_id, loja_id, status, valor_inicial, saldo_atual)
    VALUES ('${aberto}', '${operador}', '${loja}', 'ABERTO', 50, 999),
           ('${fechado}', '${operador}', '${loja}', 'FECHADO', 10, 7);
  `);
  assert.equal(await numero(`SELECT internal.valor_sistema_dinheiro($1) AS n`, [aberto]), 50);
  await db.exec(`SELECT internal.sincronizar_saldo_cache('${aberto}')`);
  await db.exec(`SELECT internal.sincronizar_saldo_cache('${fechado}')`);
  assert.equal(await numero(`SELECT saldo_atual AS n FROM caixas WHERE id = $1`, [aberto]), 50);
  assert.equal(await numero(`SELECT saldo_atual AS n FROM caixas WHERE id = $1`, [fechado]), 7);
});

test("PIX não entra em E(c); por-forma separa autoridade e registrado", async () => {
  const caixa = randomUUID();
  const split = randomUUID();
  const pix = randomUUID();
  const legado = randomUUID();
  const cancelada = randomUUID();
  await db.exec(`
    INSERT INTO caixas (id, operador_id, loja_id, status, valor_inicial, saldo_atual)
    VALUES ('${caixa}', '${operador}', '${loja}', 'ABERTO', 50, 50);
    INSERT INTO vendas (id, caixa_id, operador_id, status, forma_pagamento, total_bruto, total_liquido)
    VALUES
      ('${split}', '${caixa}', '${operador}', 'CONCLUIDA', 'DINHEIRO', 100, 100),
      ('${pix}', '${caixa}', '${operador}', 'CONCLUIDA', 'PIX', 25, 25),
      ('${legado}', '${caixa}', '${operador}', 'CONCLUIDA', 'DINHEIRO', 20, 20),
      ('${cancelada}', '${caixa}', '${operador}', 'CANCELADA', 'PIX', 15, 15);
    INSERT INTO vendas_pagamentos (venda_id, forma_pagamento, valor) VALUES
      ('${split}', 'DINHEIRO', 40),
      ('${split}', 'PIX', 60),
      ('${pix}', 'PIX', 25),
      ('${cancelada}', 'PIX', 15);
    INSERT INTO devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES ('${split}', 10, 'PIX', 'parcial', '${operador}');
    INSERT INTO movimentacoes_caixa (caixa_id, tipo, valor, status, forma_pagamento) VALUES
      ('${caixa}', 'suprimento', 10, 'aprovado', 'dinheiro'),
      ('${caixa}', 'sangria', 5, 'aprovado', 'dinheiro');
  `);
  const ec = await numero(`SELECT internal.valor_sistema_dinheiro($1) AS n`, [caixa]);
  assert.equal(ec, 115);
  const formas = await rows(
    `SELECT forma_pagamento, valor_sistema::float AS valor, metrica
     FROM public.calcular_valor_sistema_por_forma_caixa($1)`,
    [caixa],
  );
  const mapa = Object.fromEntries(formas.map((row) => [row.forma_pagamento, row]));
  assert.equal(Number(mapa.DINHEIRO.valor), ec);
  assert.equal(mapa.DINHEIRO.metrica, "E_C_AUTORIDADE");
  assert.equal(Number(mapa.PIX.valor), 75);
  assert.equal(mapa.PIX.metrica, "REGISTRADO_JINLONG");
  assert.equal(mapa.FIADO, undefined);
});

test("guard de cancelamento: operador negado; saldo insuficiente não grava devolução", async () => {
  const caixa = randomUUID();
  const venda = randomUUID();
  await db.exec(`
    INSERT INTO caixas (id, operador_id, loja_id, status, valor_inicial, saldo_atual)
    VALUES ('${caixa}', '${operador}', '${loja}', 'ABERTO', 0, 0);
    INSERT INTO vendas (id, caixa_id, operador_id, loja_id, status, forma_pagamento, total_bruto, total_liquido)
    VALUES ('${venda}', '${caixa}', '${operador}', '${loja}', 'CONCLUIDA', 'DINHEIRO', 100, 100);
    INSERT INTO movimentacoes_caixa (caixa_id, tipo, valor, status, forma_pagamento)
    VALUES ('${caixa}', 'sangria', 100, 'aprovado', 'dinheiro');
  `);
  await assert.rejects(
    () => db.query(
      `SELECT * FROM public.cancelar_venda_transacional($1, $2, $3)`,
      [venda, "operador nao cancela", operador],
    ),
    /CANCELAR_VENDA_SEM_PERMISSAO/,
  );
  await assert.rejects(
    () => db.query(
      `SELECT * FROM public.cancelar_venda_transacional($1, $2, $3)`,
      [venda, "gaveta vazia", gerente],
    ),
    /CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE/,
  );
  assert.equal(await numero(`SELECT count(*)::int AS n FROM devolucoes WHERE venda_id = $1`, [venda]), 0);
  assert.equal((await rows(`SELECT status FROM vendas WHERE id = $1`, [venda]))[0].status, "CONCLUIDA");
});

test("cancelamento com saldo sincroniza o cache e o snapshot separa PIX", async () => {
  const caixa = randomUUID();
  const venda = randomUUID();
  const pix = randomUUID();
  await db.exec(`
    UPDATE caixas SET status = 'FECHADO'
    WHERE operador_id = '${operador}' AND status = 'ABERTO';
    INSERT INTO caixas (id, operador_id, loja_id, status, valor_inicial, saldo_atual)
    VALUES ('${caixa}', '${operador}', '${loja}', 'ABERTO', 100, 999);
    INSERT INTO vendas (id, caixa_id, operador_id, loja_id, status, forma_pagamento, total_bruto, total_liquido)
    VALUES
      ('${venda}', '${caixa}', '${operador}', '${loja}', 'CONCLUIDA', 'DINHEIRO', 40, 40),
      ('${pix}', '${caixa}', '${operador}', '${loja}', 'CONCLUIDA', 'PIX', 25, 25);
  `);
  await db.query(
    `SELECT * FROM public.cancelar_venda_transacional($1, $2, $3)`,
    [venda, "cancelamento sintetico", gerente],
  );
  assert.equal((await rows(`SELECT status FROM vendas WHERE id = $1`, [venda]))[0].status, "CANCELADA");
  const ec = await numero(`SELECT internal.valor_sistema_dinheiro($1) AS n`, [caixa]);
  const saldo = await numero(`SELECT saldo_atual AS n FROM caixas WHERE id = $1`, [caixa]);
  assert.equal(ec, 100);
  assert.equal(saldo, ec);

  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${operador}', false)`);
  await db.query(`SELECT * FROM public.fechar_caixa_atomico($1, $2, $3)`, [operador, 100, ""]);
  const snap = await rows(
    `SELECT forma_pagamento, valor_sistema_snapshot::float AS valor, valor_informado::float AS informado
     FROM caixas_fechamento_formas WHERE caixa_id = $1`,
    [caixa],
  );
  const mapa = Object.fromEntries(snap.map((row) => [row.forma_pagamento, row]));
  assert.equal(Number(mapa.DINHEIRO.valor), 100);
  assert.equal(Number(mapa.DINHEIRO.informado), 100);
  assert.equal(Number(mapa.PIX.valor), 25);
  assert.equal(mapa.PIX.informado, null);
});
