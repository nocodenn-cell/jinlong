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
