import { assertEquals, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  assertEventoNoEscopo,
  EMPRESA_LEGADO_PADRAO,
  empresaLegado,
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
// LOJA_A e LOJA_L1 = Empresa 1 (legado); LOJA_B = outra empresa.
const E1 = EMPRESA_LEGADO_PADRAO;
const LOJA_L1 = "a1111111-1111-4111-8111-111111111111";
const empresas: Record<string, string> = { [LOJA_A]: E1, [LOJA_L1]: E1, [LOJA_B]: "eB" };
const operadorDoCaixa: Record<string, string> = { [CAIXA_A]: OP_A, [CAIXA_B]: OP_B };
const lookups = {
  caixaLoja: (id: string) => Promise.resolve(caixas[id] ?? null),
  produtosForaDaLoja: (ids: string[], loja: string) => Promise.resolve(ids.filter((i) => produtos[i] !== loja).length),
  operadorPodeLoja: (op: string, loja: string) => Promise.resolve(operadores[op] === loja),
  lojaEmpresa: (loja: string) => Promise.resolve(empresas[loja] ?? null),
  caixaOperador: (cx: string) => Promise.resolve(operadorDoCaixa[cx] ?? null),
};
const ctxLeg: SyncContext = { mode: "legado", lojaId: null, empresaId: E1 };
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

// 20261028130000: o legado NÃO tem mais atalho — preso à Empresa 1 e devolve operador para validação no banco.
Deno.test("legado: evento em loja/caixa de OUTRA empresa é recusado", async () => {
  await assertRejects(() => assertEventoNoEscopo(ev("CAIXA_FECHADO", { id: CAIXA_B }), ctxLeg, lookups), Error, "EVENTO_LOJA_FORA_DA_EMPRESA_LEGADO");
  await assertRejects(() => assertEventoNoEscopo(ev("VENDA_REGISTRADA", { caixa_id: CAIXA_B, loja_id: LOJA_B, itens: [] }), ctxLeg, lookups), Error, "EVENTO_LOJA_FORA_DA_EMPRESA_LEGADO");
  await assertRejects(() => assertEventoNoEscopo(ev("CAIXA_ABERTO", { id: "cn000000-0000-4000-8000-000000000004", loja_id: LOJA_B }), ctxLeg, lookups), Error, "EVENTO_LOJA_FORA_DA_EMPRESA_LEGADO");
  await assertRejects(() => assertEventoNoEscopo(ev("MOVIMENTO_CAIXA", { id: "m", caixa_id: "cx000000-0000-4000-8000-000000000009" }), ctxLeg, lookups), Error, "EVENTO_CAIXA_DESCONHECIDO");
  await assertRejects(() => assertEventoNoEscopo(ev("VENDA_REGISTRADA", { itens: [] }), ctxLeg, lookups), Error, "EVENTO_LOJA_OBRIGATORIA");
  // loja inexistente
  await assertRejects(() => assertEventoNoEscopo(ev("CAIXA_ABERTO", { id: "cn000000-0000-4000-8000-000000000005", loja_id: "ff000000-0000-4000-8000-000000000000" }), ctxLeg, lookups), Error, "EVENTO_LOJA_FORA_DA_EMPRESA_LEGADO");
});

Deno.test("legado: header x-loja-id divergente da loja do evento é recusado", async () => {
  const ctxH: SyncContext = { mode: "legado", lojaId: LOJA_L1, empresaId: E1 };
  await assertRejects(() => assertEventoNoEscopo(ev("CAIXA_FECHADO", { id: CAIXA_A }), ctxH, lookups), Error, "LOJA_LEGADO_DIVERGENTE_DO_HEADER");
});

Deno.test("legado: produto de outra loja e caixa de outra loja são recusados", async () => {
  await assertRejects(() => assertEventoNoEscopo(ev("VENDA_REGISTRADA", { caixa_id: CAIXA_A, loja_id: LOJA_A, itens: [{ produto_id: PROD_B }] }), ctxLeg, lookups), Error, "EVENTO_PRODUTO_DE_OUTRA_LOJA");
  await assertRejects(() => assertEventoNoEscopo(ev("VENDA_REGISTRADA", { caixa_id: CAIXA_A, loja_id: LOJA_L1, itens: [] }), ctxLeg, lookups), Error, "EVENTO_CAIXA_DE_OUTRA_LOJA");
});

Deno.test("legado: evento legítimo da Empresa 1 devolve loja/caixa/operador (do caixa no servidor se ausente)", async () => {
  assertEquals(
    await assertEventoNoEscopo(ev("CAIXA_FECHADO", { id: CAIXA_A }), ctxLeg, lookups),
    { lojaId: LOJA_A, empresaId: E1, caixaId: CAIXA_A, operadorId: OP_A },
  );
  assertEquals(
    await assertEventoNoEscopo(ev("VENDA_REGISTRADA", { caixa_id: CAIXA_A, loja_id: LOJA_A, operador_id: OP_B, itens: [{ produto_id: PROD_A }] }), ctxLeg, lookups),
    { lojaId: LOJA_A, empresaId: E1, caixaId: CAIXA_A, operadorId: OP_B },
  );
  // OPERADOR_EVENTO no legado é descartado depois (processOperadorEvento) — escopo não devolve operador.
  assertEquals(await assertEventoNoEscopo(ev("OPERADOR_EVENTO", { id: "e" }), ctxLeg, lookups), null);
});

Deno.test("legado: empresa configurável, inválida ⇒ Empresa 1; contexto carrega a empresa", () => {
  assertEquals(empresaLegado(undefined), E1);
  assertEquals(empresaLegado("lixo"), E1);
  assertEquals(empresaLegado(" EB000000-0000-4000-8000-000000000001 "), "eb000000-0000-4000-8000-000000000001");
  const r = resolveAuthContext({ dispositivo: null, headerLojaId: null, legacyEnabled: true, legacyKey: "k" });
  assertEquals(r.ok && r.ctx, { mode: "legado", lojaId: null, empresaId: E1 });
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

// 20261028130000: o operador de eventos operacionais é validado em public.sync_avaliar_evento (ativo + vínculo +
// papel atual, nos dois modos, com fila de revisão para venda offline de quem foi inativado depois). O escopo só
// precisa devolver QUEM operou — inclusive quando o PDV não manda (fechamento/movimento ⇒ operador do caixa).
Deno.test("escopo devolve o operador para a validação no banco (payload ou dono do caixa)", async () => {
  const r = await assertEventoNoEscopo(ev("VENDA_REGISTRADA", { caixa_id: CAIXA_A, loja_id: LOJA_A, operador_id: OP_B, itens: [] }), ctxA, lookups);
  assertEquals(r?.operadorId, OP_B);
  const m = await assertEventoNoEscopo(ev("MOVIMENTO_CAIXA", { id: "m", caixa_id: CAIXA_A }), ctxA, lookups);
  assertEquals(m, { lojaId: LOJA_A, empresaId: "eA", caixaId: CAIXA_A, operadorId: OP_A });
  const nova = await assertEventoNoEscopo(ev("CAIXA_ABERTO", { id: "cn000000-0000-4000-8000-000000000006", loja_id: LOJA_A, operador_id: OP_A }), ctxA, lookups);
  assertEquals(nova?.operadorId, OP_A);
});

Deno.test("OPERADOR_EVENTO (PIN): loja do dispositivo e usuário com vínculo", async () => {
  await assertEventoNoEscopo(ev("OPERADOR_EVENTO", { id: "e", loja_id: LOJA_A, usuario_id: OP_A, tipo: "ENTROU" }), ctxA, lookups);
  await assertEventoNoEscopo(ev("OPERADOR_EVENTO", { id: "e", loja_id: LOJA_A, usuario_id: null, tipo: "BLOQUEIO_AUTO" }), ctxA, lookups);
  await assertRejects(() => assertEventoNoEscopo(ev("OPERADOR_EVENTO", { id: "e", loja_id: LOJA_B, usuario_id: OP_B }), ctxA, lookups), Error, "EVENTO_LOJA_FORA_DO_DISPOSITIVO");
  await assertRejects(() => assertEventoNoEscopo(ev("OPERADOR_EVENTO", { id: "e", loja_id: LOJA_A, usuario_id: OP_B }), ctxA, lookups), Error, "EVENTO_OPERADOR_SEM_VINCULO");
  await assertRejects(() => assertEventoNoEscopo(ev("OPERADOR_EVENTO", { id: "e", usuario_id: OP_A }), ctxA, lookups), Error, "EVENTO_LOJA_OBRIGATORIA");
});

// 20261028 (decisão do dono, item 3): fechamento sem operador no payload usa o dono do caixa no servidor; quem
// valida ativo/vínculo é sync_avaliar_evento (backend/scripts/sync-outbox-revisao-offline.test.sql).
Deno.test("CAIXA_FECHADO sem operador no payload ⇒ operador do caixa no servidor", async () => {
  const r = await assertEventoNoEscopo(ev("CAIXA_FECHADO", { id: CAIXA_A }), ctxA, lookups);
  assertEquals(r?.operadorId, OP_A);
  const r2 = await assertEventoNoEscopo(ev("CAIXA_FECHADO", { id: CAIXA_A, operador_id: OP_B }), ctxA, lookups);
  assertEquals(r2?.operadorId, OP_B);
});
