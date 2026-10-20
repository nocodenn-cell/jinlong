import { assertEquals } from "jsr:@std/assert@1";
import { avaliarEventoNoPlano } from "./planGate.ts";

Deno.test("legado (sem assinatura) libera tudo", () => {
  assertEquals(avaliarEventoNoPlano("CAIXA_ABERTO", null), { ok: true });
});
Deno.test("suspensa: não abre caixa novo", () => {
  assertEquals(avaliarEventoNoPlano("CAIXA_ABERTO", []), { ok: false, error: "ASSINATURA_SEM_PDV" });
});
Deno.test("suspensa: venda offline / fechamento / movimento continuam aceitos", () => {
  for (const t of ["VENDA_REGISTRADA", "CAIXA_FECHADO", "MOVIMENTO_CAIXA"]) assertEquals(avaliarEventoNoPlano(t, []), { ok: true });
});
Deno.test("plano ativo com pdv abre caixa", () => {
  assertEquals(avaliarEventoNoPlano("CAIXA_ABERTO", ["pdv", "estoque", "caixa"]), { ok: true });
});
