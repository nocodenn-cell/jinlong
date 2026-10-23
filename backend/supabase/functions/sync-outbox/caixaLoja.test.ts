import { assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { assertMesmaLoja, caixaInsertForLoja } from "./caixaLoja.ts";

const LOJA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LOJA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAIXA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

Deno.test("caixa de duas lojas não herda loja padrão", () => {
  const a = caixaInsertForLoja({ id: CAIXA, operadorId: null, valorInicial: 10, lojaId: LOJA_A });
  const b = caixaInsertForLoja({ id: CAIXA, operadorId: null, valorInicial: 10, lojaId: LOJA_B });
  assertEquals(a.loja_id, LOJA_A);
  assertEquals(b.loja_id, LOJA_B);
  assertEquals(a.loja_id === b.loja_id, false);
});

Deno.test("caixa sem loja explícita é rejeitado", () => {
  assertThrows(
    () => caixaInsertForLoja({ id: CAIXA, operadorId: null, valorInicial: 0, lojaId: "" }),
    Error,
    "CAIXA_LOJA_OBRIGATORIA",
  );
  assertThrows(
    () => caixaInsertForLoja({ id: CAIXA, operadorId: null, valorInicial: 0, lojaId: null }),
    Error,
    "CAIXA_LOJA_OBRIGATORIA",
  );
});

Deno.test("caixa existente de outra loja não é reutilizado", () => {
  assertThrows(() => assertMesmaLoja(LOJA_A, LOJA_B), Error, "CAIXA_LOJA_DIVERGENTE");
  assertMesmaLoja(LOJA_B, LOJA_B);
});

// ---- aplicarLojaLegado (Build A, modo legado) ----
import { aplicarLojaLegado as _alj } from "./caixaLoja.ts";
const LA_ = "a0000001-0000-4000-8000-000000000001", LB_ = "b0000001-0000-4000-8000-0000000000b2";
const CX_ = "c1000001-0000-4000-8000-000000000001";
const lk = (caixa: string | null, ativas: string[]) => ({ caixaLoja: async () => caixa, lojasAtivas: async () => ativas });
const evA = (tipo: string, p: Record<string, unknown>) => ({ id: "e1", tipo, payload_json: JSON.stringify(p) });

Deno.test("legado: CAIXA_ABERTO sem loja + loja única => loja resolvida e auditada", async () => {
  const r = await _alj(evA("CAIXA_ABERTO", { id: CX_ }), null, lk(null, [LA_]));
  if (JSON.parse(r.ev.payload_json).loja_id !== LA_ || r.auditoria?.fonte !== "loja_unica") throw new Error("falhou");
});
Deno.test("legado: VENDA sem loja usa a loja do caixa existente (mesmo com várias lojas)", async () => {
  const r = await _alj(evA("VENDA_REGISTRADA", { caixa_id: CX_ }), null, lk(LB_, [LA_, LB_]));
  if (JSON.parse(r.ev.payload_json).loja_id !== LB_ || r.auditoria?.fonte !== "caixa") throw new Error("falhou");
});
Deno.test("legado: sem caixa e >1 loja ativa => rejeita LOJA_LEGADO_AMBIGUA", async () => {
  let err = ""; try { await _alj(evA("CAIXA_ABERTO", { id: CX_ }), null, lk(null, [LA_, LB_])); } catch (e) { err = (e as Error).message; }
  if (err !== "LOJA_LEGADO_AMBIGUA") throw new Error(err);
});
Deno.test("legado: 0 lojas ativas => LOJA_LEGADO_INDEFINIDA", async () => {
  let err = ""; try { await _alj(evA("CAIXA_ABERTO", { id: CX_ }), null, lk(null, [])); } catch (e) { err = (e as Error).message; }
  if (err !== "LOJA_LEGADO_INDEFINIDA") throw new Error(err);
});
Deno.test("legado: header x-loja-id divergente da loja resolvida => rejeita", async () => {
  let err = ""; try { await _alj(evA("VENDA_REGISTRADA", { caixa_id: CX_ }), LB_, lk(LA_, [LA_])); } catch (e) { err = (e as Error).message; }
  if (err !== "LOJA_LEGADO_DIVERGENTE_DO_HEADER") throw new Error(err);
});
Deno.test("Build B/C: loja_id presente => evento intacto, sem auditoria", async () => {
  const ev = evA("CAIXA_ABERTO", { id: CX_, loja_id: LB_ });
  const r = await _alj(ev, null, lk(LA_, [LA_]));
  if (r.ev !== ev || r.auditoria !== null) throw new Error("alterou evento B/C");
});
Deno.test("legado: outros tipos não são tocados", async () => {
  const ev = evA("CAIXA_FECHADO", { id: CX_ });
  const r = await _alj(ev, null, lk(null, []));
  if (r.ev !== ev) throw new Error("tocou CAIXA_FECHADO");
});
