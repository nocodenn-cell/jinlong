import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { inserirTokenGerente } from "./gerente-auth.ts";

// 20261028120000: token legado grava o aprovador (pdv_config.gerente_id) para o banco conferir no consumo.
function fakeDb(colunaExiste: boolean) {
  const inserts: Array<Record<string, unknown>> = [];
  return {
    inserts,
    from: (_t: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (!colunaExiste && "aprovador_id" in row) {
          return { error: { message: 'column "aprovador_id" of relation "tokens_desconto_gerente" does not exist' } };
        }
        inserts.push(row);
        return { error: null };
      },
    }),
  };
}

Deno.test("aprovador_id é gravado quando a coluna existe", async () => {
  const db = fakeDb(true);
  const r = await inserirTokenGerente(db, { token: "t", aprovador_id: "g" }, () => {}, "t");
  assertEquals(r.error, null);
  assertEquals(db.inserts, [{ token: "t", aprovador_id: "g" }]);
});

Deno.test("compatibilidade: banco sem a coluna ⇒ repete sem aprovador_id e avisa", async () => {
  const db = fakeDb(false);
  const logs: Array<Record<string, unknown>> = [];
  const r = await inserirTokenGerente(db, { token: "t", aprovador_id: "g" }, (p) => logs.push(p), "t");
  assertEquals(r.error, null);
  assertEquals(db.inserts, [{ token: "t" }]);
  assertEquals(logs[0]?.error, "TOKEN_APROVADOR_COLUNA_AUSENTE");
});
