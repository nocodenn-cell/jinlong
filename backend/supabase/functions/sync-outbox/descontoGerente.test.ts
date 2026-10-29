import { assertEquals } from "jsr:@std/assert@1";
import { descontoSemValidacao, infoDescontoVenda, resolverStrictManagerDiscountAuth } from "./descontoGerente.ts";

Deno.test("STRICT_MANAGER_DISCOUNT_AUTH: ausente/vazio = estrito (padrão seguro)", () => {
  assertEquals(resolverStrictManagerDiscountAuth(undefined).estrito, true);
  assertEquals(resolverStrictManagerDiscountAuth(null).estrito, true);
  assertEquals(resolverStrictManagerDiscountAuth("").estrito, true);
  assertEquals(resolverStrictManagerDiscountAuth("   ").fonte, "padrao");
});

Deno.test("STRICT_MANAGER_DISCOUNT_AUTH: valor inválido = estrito e marcado inválido", () => {
  for (const v of ["ture", "maybe", "sim", "2", "falso"]) {
    const f = resolverStrictManagerDiscountAuth(v);
    assertEquals(f.estrito, true, v);
    assertEquals(f.invalida, true, v);
  }
});

Deno.test("STRICT_MANAGER_DISCOUNT_AUTH: só false explícito desliga", () => {
  for (const v of ["false", "FALSE", " 0 ", "no", "off"]) assertEquals(resolverStrictManagerDiscountAuth(v).estrito, false, v);
  for (const v of ["true", "TRUE", "1", "yes", "on"]) assertEquals(resolverStrictManagerDiscountAuth(v).estrito, true, v);
});

const venda = (p: Record<string, unknown>) => JSON.stringify({ venda_id: "11111111-1111-4111-8111-111111111111", ...p });

Deno.test("desconto de gerente sem token nem PIN: bloqueado no modo estrito", () => {
  const info = infoDescontoVenda("VENDA_REGISTRADA", venda({ desconto_gerente_percentual: 10 }));
  assertEquals(info.temDesconto, true);
  assertEquals(descontoSemValidacao(info, true, false), true);
  // PIN de gerente conferido no servidor é a outra validação aceita.
  assertEquals(descontoSemValidacao(info, true, true), false);
  // Rollback explícito (false) é a única forma de aceitar sem validação.
  assertEquals(descontoSemValidacao(info, false, false), false);
});

Deno.test("desconto por valor ou com número inválido conta como desconto protegido", () => {
  assertEquals(infoDescontoVenda("VENDA_REGISTRADA", venda({ desconto_gerente_valor: 5 })).temDesconto, true);
  assertEquals(infoDescontoVenda("VENDA_REGISTRADA", venda({ desconto_gerente_percentual: "abc" })).temDesconto, true);
  assertEquals(infoDescontoVenda("VENDA_REGISTRADA", venda({ desconto_gerente_percentual: 0 })).temDesconto, false);
  assertEquals(infoDescontoVenda("VENDA_REGISTRADA", venda({})).temDesconto, false);
});

Deno.test("token informado é sempre conferido no banco (com ou sem modo estrito)", () => {
  const info = infoDescontoVenda("VENDA_REGISTRADA", venda({ desconto_gerente_percentual: 10, desconto_gerente_token: " tok " }));
  assertEquals(info.token, "tok");
  assertEquals(info.exigeToken, true);
  assertEquals(descontoSemValidacao(info, true, false), false);
  assertEquals(infoDescontoVenda("VENDA_REGISTRADA", venda({ desconto_gerente_token: "   " })).exigeToken, false);
});

Deno.test("outros tipos e payload inválido: sem desconto", () => {
  assertEquals(infoDescontoVenda("CAIXA_ABERTO", venda({ desconto_gerente_percentual: 10 })).temDesconto, false);
  assertEquals(infoDescontoVenda("VENDA_REGISTRADA", "{nao-json").temDesconto, false);
  assertEquals(infoDescontoVenda("VENDA_REGISTRADA", venda({ venda_id: "x" })).vendaId, null);
});
