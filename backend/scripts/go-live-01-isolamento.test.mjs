import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const name = process.env.PGLITE_MODULE
  ? new URL(process.env.PGLITE_MODULE, import.meta.url).href
  : "@electric-sql/pglite";
const { PGlite } = await import(name);

const LOJA_PILOTO = "a0000001-0000-4000-8000-000000000001";
const LOJA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAIXA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PRODUTO = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function mustBefore(source, earlier, later, label) {
  const a = source.indexOf(earlier);
  const b = source.indexOf(later);
  assert.ok(a >= 0 && b >= 0 && a < b, label);
}

async function assertGuardOrder() {
  const cancel = await readFile(
    new URL("../supabase/migrations/20261007171000_ssot_002_cancel_guard_antes_devolucao.sql", import.meta.url),
    "utf8",
  );
  const devolver = await readFile(
    new URL("../supabase/migrations/20261001100400_c3_devolver_retry_autorizacao.sql", import.meta.url),
    "utf8",
  );
  const baixa = await readFile(
    new URL("../supabase/migrations/20260805185445_291_estoque_baixas_integridade.sql", import.meta.url),
    "utf8",
  );
  mustBefore(cancel, "CANCELAR_VENDA_JA_CANCELADA", "UPDATE public.estoque", "retry de cancelamento antes da reposição");
  mustBefore(cancel, "v_ja_reposto_qtd", "UPDATE public.estoque", "desconta devolução já feita");
  assert.match(cancel, /v_caixa\.status = 'ABERTO'/);
  mustBefore(
    devolver,
    "DEVOLVER_VENDA_CAIXA_INVALIDO",
    "UPDATE public.estoque",
    "dinheiro com caixa fechado não repõe estoque",
  );
  assert.match(baixa, /c\.loja_id/);
  assert.match(baixa, /e\.loja_id = v_loja_id/);
}

async function assertTwoStores() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE caixas (
      id uuid PRIMARY KEY,
      loja_id uuid NOT NULL DEFAULT '${LOJA_PILOTO}',
      status text NOT NULL
    );
    CREATE TABLE estoque (
      produto_id uuid NOT NULL,
      loja_id uuid NOT NULL,
      quantidade_atual integer NOT NULL,
      PRIMARY KEY (produto_id, loja_id)
    );
    INSERT INTO caixas (id, status) VALUES ('${CAIXA}', 'ABERTO');
    INSERT INTO estoque VALUES ('${PRODUTO}', '${LOJA_PILOTO}', 10), ('${PRODUTO}', '${LOJA_B}', 10);
  `);
  const inherited = await db.query("SELECT loja_id::text AS loja FROM caixas WHERE id = $1", [CAIXA]);
  assert.equal(inherited.rows[0].loja, LOJA_PILOTO);

  await db.exec("ALTER TABLE caixas ALTER COLUMN loja_id DROP DEFAULT");
  await assert.rejects(
    () => db.exec(`INSERT INTO caixas (id, status) VALUES ('${PRODUTO}', 'ABERTO')`),
    /null value in column "loja_id"/,
  );

  const caixaB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await db.query("INSERT INTO caixas (id, loja_id, status) VALUES ($1, $2, 'ABERTO')", [caixaB, LOJA_B]);
  await db.query(
    `UPDATE estoque e
        SET quantidade_atual = e.quantidade_atual - 1
      WHERE e.produto_id = $1
        AND e.loja_id = (SELECT c.loja_id FROM caixas c WHERE c.id = $2)`,
    [PRODUTO, caixaB],
  );
  const stock = await db.query(
    "SELECT loja_id::text AS loja, quantidade_atual FROM estoque ORDER BY loja_id::text",
  );
  assert.deepEqual(
    stock.rows.map((row) => [row.loja, row.quantidade_atual]),
    [[LOJA_PILOTO, 10], [LOJA_B, 9]],
  );
  await db.close();
}

await assertGuardOrder();
await assertTwoStores();
console.log("OK: isolamento de loja e guarda de estoque");
