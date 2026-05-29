#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const migration120 = readFileSync(
  resolve(root, "supabase/migrations/120_finalizar_venda_lock_idempotencia_pagamentos.sql"),
  "utf8",
);
const migration118 = readFileSync(
  resolve(root, "supabase/migrations/118_fix_vendas_pagamentos_concurrency.sql"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function indexOfOrFail(source, needle) {
  const index = source.indexOf(needle);
  assert(index >= 0, `Trecho nao encontrado: ${needle}`);
  return index;
}

function functionBody(source, functionName) {
  const start = indexOfOrFail(source, `CREATE OR REPLACE FUNCTION public.${functionName}`);
  const end = indexOfOrFail(source.slice(start), "\n$$;");
  return source.slice(start, start + end);
}

const v2 = functionBody(migration120, "finalizar_venda_transacional_canonica_v2");
const v3 = functionBody(migration120, "finalizar_venda_transacional_canonica_v3");

assert(
  v2.includes("pg_advisory_xact_lock(hashtextextended(p_venda_id::text, 0))"),
  "v2 deve serializar finalizacao por p_venda_id.",
);
assert(
  v3.includes("pg_advisory_xact_lock(hashtextextended(p_venda_id::text, 0))"),
  "v3 deve serializar antes do check idempotente.",
);

const v2Lock = indexOfOrFail(v2, "pg_advisory_xact_lock");
const v2Idempotency = indexOfOrFail(v2, "WHERE v.id = p_venda_id\n      AND v.status = 'CONCLUIDA'");
assert(v2Lock < v2Idempotency, "v2 deve travar antes do EXISTS idempotente.");

const v3Lock = indexOfOrFail(v3, "pg_advisory_xact_lock");
const v3Idempotency = indexOfOrFail(v3, "WHERE v.id = p_venda_id\n      AND v.status = 'CONCLUIDA'");
assert(v3Lock < v3Idempotency, "v3 deve travar antes do EXISTS idempotente.");

const insertVenda = indexOfOrFail(v2, "INSERT INTO public.vendas");
const insertItem = indexOfOrFail(v2, "INSERT INTO public.itens_venda");
const baixaEstoque = indexOfOrFail(v2, "decrementar_estoque_seguro");
assert(insertVenda < insertItem, "v2 deve inserir vendas antes de itens_venda.");
assert(insertVenda < baixaEstoque, "v2 deve inserir vendas antes da baixa de estoque.");

assert(
  v2.includes("GROUP BY pagamentos.forma_pagamento"),
  "v2 deve agregar parcelas repetidas por forma antes do ON CONFLICT.",
);
assert(
  migration118.includes("SUM(valor) OVER (PARTITION BY venda_id, forma_pagamento) AS valor_total"),
  "migration 118 deve preservar soma ao normalizar pagamentos duplicados.",
);
assert(
  !migration118.includes("WHERE id NOT IN (SELECT id FROM keep)"),
  "migration 118 nao pode apagar duplicatas sem somar valores.",
);

console.log("finalizar_venda RPC migration regression checks passed.");
