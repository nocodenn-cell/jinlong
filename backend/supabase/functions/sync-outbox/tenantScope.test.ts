import { assertEquals, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  assertEventoNoEscopo,
  legacyKeysEnabled,
  normalizarCodigoAtivacao,
  resolveAuthContext,
  type SyncContext,
} from "./tenantScope.ts";

const LOJA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LOJA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAIXA_A = "ca000000-0000-4000-8000-00000000000a";
const CAIXA_B = "cb000000-0000-4000-8000-00000000000b";
const PROD_A = "da000000-0000-4000-8000-00000000000a";
const PROD_B = "db000000-0000-4000-8000-00000000000b";

const dispA = { id: "d1", loja_id: LOJA_A, empresa_id: "eA", sync_secret: "s".repeat(64) };
const ctxA: SyncContext = { mode: "dispositivo", lojaId: LOJA_A, empresaId: "eA", dispositivoId: "d1" };
const caixas: Record<string, string> = { [CAIXA_A]: LOJA_A, [CAIXA_B]: LOJA_B };
const produtos: Record<string, string> = { [PROD_A]: LOJA_A, [PROD_B]: LOJA_B };
const OP_A = "0a000000-0000-4000-8000-00000000000a";
const OP_B = "0b000000-0000-4000-8000-00000000000b";
const operadores: Record<string, string> = { [OP_A]: LOJA_A, [OP_B]: LOJA_B };
const lookups = {
  caixaLoja: (id: string) => Promise.resolve(caixas[id] ?? null),
  produtosForaDaLoja: (ids: string[], loja: string) => Promise.resolve(ids.filter((i) => produtos[i] !== loja).length),
  operadorPodeLoja: (op: string, loja: string) => Promise.resolve(operadores[op] === loja),
};
const ev = (tipo: string, p: unknown) => ({ tipo, payload_json: JSON.stringify(p) });

Deno.test("dispositivo: loja vem do servidor; header de outra loja é recusado", () => {
  const ok = resolveAuthContext({ dispositivo: dispA, headerLojaId: null, legacyEnabled: true, legacyKey: "x" });
  assertEquals(ok.ok && ok.ctx.lojaId, LOJA_A);
  assertEquals(ok.ok && ok.expectedKey, dispA.sync_secret);
  const bad = resolveAuthContext({ dispositivo: dispA, headerLojaId: LOJA_B, legacyEnabled: true, legacyKey: "x" });
  assertEquals(bad, { ok: false, error: "LOJA_DIVERGENTE_DO_DISPOSITIVO" });
});

Deno.test("legado desligado ⇒ só dispositivos ativados sincronizam", () => {
  assertEquals(legacyKeysEnabled(undefined), true);
  assertEquals(legacyKeysEnabled("false"), false);
  const r = resolveAuthContext({ dispositivo: null, headerLojaId: LOJA_A, legacyEnabled: false, legacyKey: "k" });
  assertEquals(r, { ok: false, error: "DEVICE_NOT_ALLOWED" });
});

Deno.test("legado (cliente 1) mantém comportamento: sem checagem extra", async () => {
  await assertEventoNoEscopo(ev("CAIXA_FECHADO", { id: CAIXA_B }), { mode: "legado", lojaId: null }, lookups);
});

Deno.test("eventos legítimos da loja A passam", async () => {
  await assertEventoNoEscopo(ev("CAIXA_ABERTO", { id: "cn000000-0000-4000-8000-000000000001", loja_id: LOJA_A }), ctxA, lookups);
  await assertEventoNoEscopo(ev("MOVIMENTO_CAIXA", { id: "m", caixa_id: CAIXA_A }), ctxA, lookups);
  await assertEventoNoEscopo(ev("VENDA_REGISTRADA", { caixa_id: CAIXA_A, loja_id: LOJA_A, itens: [{ produto_id: PROD_A }] }), ctxA, lookups);
});

Deno.test("REPLAY offline: dispositivo A não escreve na loja B por nenhum caminho", async () => {
  const casos: Array<[string, unknown, string]> = [
    ["CAIXA_ABERTO", { id: "cn000000-0000-4000-8000-000000000002", loja_id: LOJA_B }, "EVENTO_LOJA_FORA_DO_DISPOSITIVO"],
    ["CAIXA_ABERTO", { id: CAIXA_B, loja_id: LOJA_A }, "EVENTO_CAIXA_DE_OUTRA_LOJA"],
    ["CAIXA_ABERTO", { id: "cn000000-0000-4000-8000-000000000003" }, "EVENTO_LOJA_OBRIGATORIA"],
    ["CAIXA_FECHADO", { id: CAIXA_B }, "EVENTO_CAIXA_DE_OUTRA_LOJA"],
    ["MOVIMENTO_CAIXA", { id: "m", caixa_id: CAIXA_B }, "EVENTO_CAIXA_DE_OUTRA_LOJA"],
    ["MOVIMENTO_CAIXA", { id: "m", caixa_id: "cx000000-0000-4000-8000-000000000009" }, "EVENTO_CAIXA_DESCONHECIDO"],
    ["VENDA_REGISTRADA", { caixa_id: CAIXA_B, loja_id: LOJA_A, itens: [] }, "EVENTO_CAIXA_DE_OUTRA_LOJA"],
    ["VENDA_REGISTRADA", { caixa_id: CAIXA_A, loja_id: LOJA_B, itens: [] }, "EVENTO_LOJA_FORA_DO_DISPOSITIVO"],
    ["VENDA_REGISTRADA", { caixa_id: CAIXA_A, loja_id: LOJA_A, itens: [{ produto_id: PROD_B }] }, "EVENTO_PRODUTO_DE_OUTRA_LOJA"],
    ["VENDA_REGISTRADA", { caixa_id: "cx000000-0000-4000-8000-000000000009", itens: [] }, "EVENTO_CAIXA_DESCONHECIDO"],
    ["VENDA_REGISTRADA", { loja_id: LOJA_A, itens: [] }, "EVENTO_CAIXA_OBRIGATORIO"],
    ["OUTRO", {}, "TIPO_DESCONHECIDO"],
  ];
  for (const [tipo, p, erro] of casos) {
    await assertRejects(() => assertEventoNoEscopo(ev(tipo, p), ctxA, lookups), Error, erro);
  }
});

Deno.test("código de ativação: normalização", () => {
  assertEquals(normalizarCodigoAtivacao(" k7qx-m2pa-9d "), "K7QXM2PA9D");
  assertEquals(normalizarCodigoAtivacao("curto"), null);
  assertEquals(normalizarCodigoAtivacao("drop table;--x"), null);
  assertEquals(normalizarCodigoAtivacao(42), null);
});

Deno.test("operador da venda/caixa precisa de vínculo ativo na loja do dispositivo", async () => {
  await assertEventoNoEscopo(ev("VENDA_REGISTRADA", { caixa_id: CAIXA_A, loja_id: LOJA_A, operador_id: OP_A, itens: [] }), ctxA, lookups);
  for (const tipo of ["VENDA_REGISTRADA", "CAIXA_ABERTO", "MOVIMENTO_CAIXA"]) {
    const p = tipo === "CAIXA_ABERTO"
      ? { id: CAIXA_A, loja_id: LOJA_A, operador_id: OP_B }
      : { id: "m", caixa_id: CAIXA_A, loja_id: LOJA_A, operador_id: OP_B, itens: [] };
    await assertRejects(() => assertEventoNoEscopo(ev(tipo, p), ctxA, lookups), Error, "EVENTO_OPERADOR_SEM_VINCULO");
  }
  // modo legado (cliente 1 sem ativação): sem mudança
  await assertEventoNoEscopo(ev("VENDA_REGISTRADA", { caixa_id: CAIXA_B, operador_id: OP_B }), { mode: "legado", lojaId: null }, lookups);
});

Deno.test("OPERADOR_EVENTO (PIN): loja do dispositivo e usuário com vínculo", async () => {
  await assertEventoNoEscopo(ev("OPERADOR_EVENTO", { id: "e", loja_id: LOJA_A, usuario_id: OP_A, tipo: "ENTROU" }), ctxA, lookups);
  await assertEventoNoEscopo(ev("OPERADOR_EVENTO", { id: "e", loja_id: LOJA_A, usuario_id: null, tipo: "BLOQUEIO_AUTO" }), ctxA, lookups);
  await assertRejects(() => assertEventoNoEscopo(ev("OPERADOR_EVENTO", { id: "e", loja_id: LOJA_B, usuario_id: OP_B }), ctxA, lookups), Error, "EVENTO_LOJA_FORA_DO_DISPOSITIVO");
  await assertRejects(() => assertEventoNoEscopo(ev("OPERADOR_EVENTO", { id: "e", loja_id: LOJA_A, usuario_id: OP_B }), ctxA, lookups), Error, "EVENTO_OPERADOR_SEM_VINCULO");
  await assertRejects(() => assertEventoNoEscopo(ev("OPERADOR_EVENTO", { id: "e", usuario_id: OP_A }), ctxA, lookups), Error, "EVENTO_LOJA_OBRIGATORIA");
});
