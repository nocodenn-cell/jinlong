// Onda C2.3, fechada parcialmente no Gate C2.5 com evidência oficial adicional
// (modalidade_frete/local_destino/presenca_comprador/natureza_operacao). O
// mapeador nunca inventa campo/valor não confirmado — natureza_operacao em
// particular nunca aparece populado com "VENDA" nem qualquer outro default
// mágico: fica AUSENTE por decisão documentada (Focus aplica o próprio
// default quando omitido — confirmado pela documentação oficial).

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildFocusNfceEnvelope, gapsEstruturais, omittedByDesign } from "./fiscal_focus_dto.ts";

Deno.test("mapeia cnpj_emitente quando o snapshot tem o dado", () => {
  const payload = { emitente: { cnpj: "12345678000199" } };
  const { body } = buildFocusNfceEnvelope(payload);
  assertEquals(body.cnpj_emitente, "12345678000199");
});

Deno.test("payload nulo -> cnpj_emitente vira gap; constantes de negócio continuam presentes", () => {
  const { body, gaps } = buildFocusNfceEnvelope(null);
  assertEquals(body.cnpj_emitente, undefined);
  assertEquals(gaps.some((g) => g.campo === "cnpj_emitente"), true);
  assertEquals(body.modalidade_frete, "9");
  assertEquals(body.local_destino, "1");
  assertEquals(body.presenca_comprador, "1");
});

Deno.test("9. natureza_operacao NUNCA é populado — ausente por decisão, não 'VENDA' nem qualquer string mágica", () => {
  const payload = { emitente: { cnpj: "12345678000199" } };
  const { body, omittedByDesign: omitted } = buildFocusNfceEnvelope(payload);
  // deno-lint-ignore no-explicit-any
  assertEquals((body as any).natureza_operacao, undefined);
  const decisao = omitted.find((o) => o.campo === "natureza_operacao");
  assertExists(decisao);
  assertEquals(decisao!.motivo.includes("Focus aplica seu próprio padrão"), true);
});

Deno.test("11. local_destino confirmado — '1' (operação interna), único caso hoje detectável", () => {
  const { body } = buildFocusNfceEnvelope({ emitente: { cnpj: "1" } });
  assertEquals(body.local_destino, "1");
});

Deno.test("10. modalidade_frete confirmado — '9' (sem frete), consistente com PDV presencial", () => {
  const { body } = buildFocusNfceEnvelope({ emitente: { cnpj: "1" } });
  assertEquals(body.modalidade_frete, "9");
});

Deno.test("12. presenca_comprador confirmado — '1' (presencial)", () => {
  const { body } = buildFocusNfceEnvelope({ emitente: { cnpj: "1" } });
  assertEquals(body.presenca_comprador, "1");
});

Deno.test("gaps restantes (Gate C2.5): items[]/formas_pagamento[]/interestadual — pendentes de fonte, não inventados", () => {
  const { gaps } = buildFocusNfceEnvelope({ emitente: { cnpj: "1" } });
  const campos = gaps.map((g) => g.campo);
  for (const esperado of ["items[]", "formas_pagamento[]", "local_destino_interestadual_exterior"]) {
    assertEquals(campos.includes(esperado), true, `esperava gap "${esperado}"`);
  }
  // Os 3 campos fechados no Gate C2.5 NÃO devem mais aparecer como gap.
  for (const fechado of ["modalidade_frete", "local_destino", "presenca_comprador", "natureza_operacao"]) {
    assertEquals(campos.includes(fechado), false, `"${fechado}" não deveria mais ser gap`);
  }
});

Deno.test("24. boundary — o envelope nunca inclui um objeto items[]/formas_pagamento[] inventado", () => {
  const payload = {
    emitente: { cnpj: "12345678000199" },
    itens: [{ produto_id: "x", ncm: "12345678" }],
    pagamentos: [{ forma_pagamento: "DINHEIRO", valor: 10 }],
  };
  const { body } = buildFocusNfceEnvelope(payload);
  // deno-lint-ignore no-explicit-any
  const asAny = body as any;
  assertEquals(asAny.items, undefined);
  assertEquals(asAny.formas_pagamento, undefined);
});

Deno.test("destinatario presente no snapshot vira gap explícito (schema Focus não confirmado)", () => {
  const payload = { destinatario: { cliente_id: "x", nome: "y" } };
  const { gaps } = buildFocusNfceEnvelope(payload);
  assertEquals(gaps.some((g) => g.campo === "destinatario"), true);
});

Deno.test("gapsEstruturais()/omittedByDesign() são estáveis — mesma lista sempre", () => {
  assertEquals(gapsEstruturais().map((g) => g.campo), gapsEstruturais().map((g) => g.campo));
  assertEquals(omittedByDesign().map((g) => g.campo), omittedByDesign().map((g) => g.campo));
});
