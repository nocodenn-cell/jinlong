import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { parseParcelasOpcional, temParcelamento } from "./pagamentosParcelas.ts";

Deno.test("parcelas ausente => undefined (outbox antiga)", () => {
  assertEquals(parseParcelasOpcional({ forma_pagamento: "PIX", valor: 1 }, "PIX"), undefined);
  assertEquals(parseParcelasOpcional({ parcelas: null }, "PIX"), undefined);
});
Deno.test("crédito 1..24 aceito", () => {
  assertEquals(parseParcelasOpcional({ parcelas: 3 }, "CARTAO_CREDITO"), 3);
  assertEquals(parseParcelasOpcional({ parcelas: 1 }, "PIX"), 1);
});
Deno.test("inválidos rejeitados", () => {
  for (const [v, f] of [[0, "CARTAO_CREDITO"], [25, "CARTAO_CREDITO"], [2.5, "CARTAO_CREDITO"], ["3", "CARTAO_CREDITO"], [2, "PIX"], [2, "CARTAO_DEBITO"]] as const) {
    assertThrows(() => parseParcelasOpcional({ parcelas: v }, f), Error, "PAYLOAD_PAGAMENTOS_INVALIDO");
  }
});
Deno.test("parcelamento só quando há parcelas > 1", () => {
  assertEquals(temParcelamento(null), false);
  assertEquals(temParcelamento([{ forma_pagamento: "PIX", valor: 1 }]), false);
  assertEquals(temParcelamento([{ forma_pagamento: "CARTAO_CREDITO", valor: 1, parcelas: 1 }]), false);
  assertEquals(temParcelamento([{ forma_pagamento: "CARTAO_CREDITO", valor: 1, parcelas: 4 }]), true);
});
