// Onda C2.3 — o mapeador nunca inventa campo/valor não confirmado. Em
// particular, `natureza_operacao` nunca aparece populado com "VENDA" nem
// qualquer outro default mágico — só como gap reportado.

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildFocusNfceEnvelope, gapsEstruturais } from "./fiscal_focus_dto.ts";

Deno.test("mapeia cnpj_emitente e data_emissao quando o snapshot tem os dados", () => {
  const payload = {
    data_venda: "2026-09-02T12:00:00Z",
    emitente: { cnpj: "12345678000199" },
  };
  const { body } = buildFocusNfceEnvelope(payload);
  assertEquals(body.cnpj_emitente, "12345678000199");
  assertEquals(body.data_emissao, "2026-09-02T12:00:00Z");
});

Deno.test("payload nulo -> nenhum campo mapeado, só gaps", () => {
  const { body, gaps } = buildFocusNfceEnvelope(null);
  assertEquals(body.cnpj_emitente, undefined);
  assertEquals(body.data_emissao, undefined);
  assertEquals(gaps.some((g) => g.campo === "cnpj_emitente"), true);
  assertEquals(gaps.some((g) => g.campo === "data_emissao"), true);
});

Deno.test("natureza_operacao NUNCA é populado — sempre gap, nunca 'VENDA' ou qualquer string mágica", () => {
  const payload = { data_venda: "2026-09-02T12:00:00Z", emitente: { cnpj: "12345678000199" } };
  const { body, gaps } = buildFocusNfceEnvelope(payload);
  // deno-lint-ignore no-explicit-any
  assertEquals((body as any).natureza_operacao, undefined);
  const gap = gaps.find((g) => g.campo === "natureza_operacao");
  assertExists(gap);
  assertEquals(gap!.motivo.includes("Decisão de negócio pendente"), true);
});

Deno.test("gaps estruturais (items/formas_pagamento/modalidade_frete/local_destino/presenca_comprador) sempre presentes", () => {
  const { gaps } = buildFocusNfceEnvelope({ emitente: { cnpj: "1" }, data_venda: "x" });
  const campos = gaps.map((g) => g.campo);
  for (const esperado of ["items[]", "formas_pagamento[]", "modalidade_frete", "local_destino", "presenca_comprador"]) {
    assertEquals(campos.includes(esperado), true, `esperava gap "${esperado}"`);
  }
});

Deno.test("24. boundary — o envelope nunca inclui um objeto items[]/formas_pagamento[] inventado", () => {
  const payload = {
    emitente: { cnpj: "12345678000199" },
    data_venda: "2026-09-02T12:00:00Z",
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

Deno.test("gapsEstruturais() é estável — mesma lista de nomes sempre", () => {
  const a = gapsEstruturais().map((g) => g.campo);
  const b = gapsEstruturais().map((g) => g.campo);
  assertEquals(a, b);
});
