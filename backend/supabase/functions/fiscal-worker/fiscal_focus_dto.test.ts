// Onda C2.3, fechada em 2 rodadas do Gate C2.5 com evidência oficial da Focus
// (doc.focusnfe.com.br + campos.focusnfe.com.br). O mapeador nunca inventa
// campo/valor não confirmado — natureza_operacao em particular nunca aparece
// populado com "VENDA" nem qualquer default mágico.

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildFocusNfceEnvelope, mapPagamentoToFocus, mapSnapshotItemToFocus, omittedByDesign } from "./fiscal_focus_dto.ts";

function itemCompleto(overrides: Record<string, unknown> = {}) {
  return {
    produto_id: "22222222-2222-4222-8222-222222222222",
    nome: "Umidificador",
    codigo_barras: "7898512340004",
    quantidade: 2,
    preco_unitario_original: 68,
    preco_unitario: 68,
    desconto_unitario: 0,
    tipo_preco: "VAREJO",
    unidade_medida: "UN",
    ncm: "85094000",
    cfop: "5102",
    csosn: "102",
    cest: "1234567",
    cst_pis: "01",
    cst_cofins: "01",
    icms_origem: "1",
    ...overrides,
  };
}

Deno.test("mapeia cnpj_emitente quando o snapshot tem o dado", () => {
  const payload = { emitente: { cnpj: "12345678000199" }, itens: [itemCompleto()], pagamentos: [{ forma_pagamento: "DINHEIRO", valor: 136 }] };
  const { body } = buildFocusNfceEnvelope(payload);
  assertEquals(body.cnpj_emitente, "12345678000199");
});

Deno.test("9. natureza_operacao ausente no snapshot -> gap BLOQUEANTE; nunca preenchido com 'VENDA' ou outro default", () => {
  const payload = { emitente: { cnpj: "12345678000199" } };
  const { body, gaps, bloqueante, omittedByDesign: omitted } = buildFocusNfceEnvelope(payload);
  // deno-lint-ignore no-explicit-any
  assertEquals((body as any).natureza_operacao, undefined);
  assertEquals(gaps.some((g) => g.campo === "natureza_operacao"), true);
  assertEquals(bloqueante, true);
  // Não está mais em omittedByDesign: Focus confirmou que é obrigatória e sem default.
  assertEquals(omitted.some((o) => o.campo === "natureza_operacao"), false);
});

Deno.test("9b. natureza_operacao presente no snapshot -> enviado exatamente como congelado", () => {
  const payload = { natureza_operacao: "Venda de mercadoria", emitente: { cnpj: "12345678000199" } };
  const { body, gaps } = buildFocusNfceEnvelope(payload);
  assertEquals(body.natureza_operacao, "Venda de mercadoria");
  assertEquals(gaps.some((g) => g.campo === "natureza_operacao"), false);
});

Deno.test("10/11/12. modalidade_frete/local_destino/presenca_comprador confirmados", () => {
  const { body } = buildFocusNfceEnvelope({ emitente: { cnpj: "1" } });
  assertEquals(body.modalidade_frete, "9");
  assertEquals(body.local_destino, "1");
  assertEquals(body.presenca_comprador, "1");
});

Deno.test("24. boundary — items[]/formas_pagamento[] usam nomes de campo Focus reais, não inventados", () => {
  const payload = { emitente: { cnpj: "12345678000199" }, itens: [itemCompleto()], pagamentos: [{ forma_pagamento: "DINHEIRO", valor: 136 }] };
  const { body } = buildFocusNfceEnvelope(payload);
  assertExists(body.items);
  assertEquals(body.items![0].codigo_produto, "22222222-2222-4222-8222-222222222222");
  assertEquals(body.items![0].descricao, "Umidificador");
  assertEquals(body.items![0].codigo_ncm, "85094000");
  assertEquals(body.items![0].cfop, "5102");
  assertEquals(body.items![0].unidade_comercial, "UN");
  assertEquals(body.items![0].quantidade_comercial, 2);
  assertEquals(body.items![0].valor_unitario_comercial, 68);
  assertEquals(body.items![0].numero_item, 1);
  assertEquals(body.items![0].icms_origem, "1");
  assertExists(body.formas_pagamento);
  assertEquals(body.formas_pagamento![0].forma_pagamento, "01");
});

// ---------------------------------------------------------------------------
// C2.5.1 — ITEM
// ---------------------------------------------------------------------------

Deno.test("4. item fiscal completo do cenário mínimo — mapeado sem bloqueio", () => {
  const { item, gaps } = mapSnapshotItemToFocus(itemCompleto(), 1);
  assertExists(item);
  assertEquals(item!.numero_item, 1);
  assertEquals(item!.codigo_ncm, "85094000");
  assertEquals(item!.cest, "1234567");
  assertEquals(item!.codigo_barras_comercial, "7898512340004");
  assertEquals(item!.icms_origem, "1");
  // Tributação (CST/CSOSN/PIS/COFINS) continua gap — não bloqueia os outros campos.
  assertEquals(gaps.some((g) => g.campo.includes("tributacao")), true);
});

// ---------------------------------------------------------------------------
// Onda C2.6 — icms_origem: fail-closed no boundary, sem inferência/default.
// ---------------------------------------------------------------------------

Deno.test("icms_origem ausente -> item bloqueado (produto ainda não classificado), gap explícito", () => {
  const { item, gaps } = mapSnapshotItemToFocus(itemCompleto({ icms_origem: null }), 1);
  assertEquals(item, null);
  assertEquals(gaps.some((g) => g.campo === "items[1].icms_origem"), true);
});

Deno.test("icms_origem fora de '0'..'8' -> item bloqueado, não propagado ao corpo Focus", () => {
  const { item, gaps } = mapSnapshotItemToFocus(itemCompleto({ icms_origem: "9" }), 1);
  assertEquals(item, null);
  const gap = gaps.find((g) => g.campo === "items[1].icms_origem");
  assertExists(gap);
  assertEquals(gap!.motivo.includes("fora do domínio confirmado"), true);
});

Deno.test("icms_origem válido (cada código 0..8) -> mapeado sem bloqueio, valor propagado literalmente", () => {
  for (const codigo of ["0", "1", "2", "3", "4", "5", "6", "7", "8"]) {
    const { item } = mapSnapshotItemToFocus(itemCompleto({ icms_origem: codigo }), 1);
    assertExists(item, `código ${codigo} não deveria bloquear`);
    assertEquals(item!.icms_origem, codigo);
  }
});

Deno.test("icms_origem nunca é derivado de produtos.origem — campo origem no snapshot é ignorado pelo mapeador", () => {
  const { item } = mapSnapshotItemToFocus(itemCompleto({ icms_origem: null, origem: "china_manual" }), 1);
  // Bloqueado (icms_origem ausente) mesmo com `origem` presente no snapshot —
  // prova que o mapeador não lê `origem` como fallback.
  assertEquals(item, null);
});

Deno.test("item sem NCM -> bloqueado (obrigatório ausente), não inventa valor", () => {
  const { item, gaps } = mapSnapshotItemToFocus(itemCompleto({ ncm: null }), 1);
  assertEquals(item, null);
  assertEquals(gaps.some((g) => g.campo === "items[1].codigo_ncm"), true);
});

Deno.test("valor_desconto calculado como quantidade x desconto_unitario; valor_bruto omitido (Focus calcula)", () => {
  const { item } = mapSnapshotItemToFocus(itemCompleto({ desconto_unitario: 5, quantidade: 3 }), 1);
  assertEquals(item!.valor_desconto, 15);
  assertEquals(item!.valor_bruto, undefined);
});

Deno.test("código de barras que não parece GTIN não é enviado como codigo_barras_comercial", () => {
  const { item } = mapSnapshotItemToFocus(itemCompleto({ codigo_barras: "ABC123" }), 1);
  assertEquals(item!.codigo_barras_comercial, undefined);
});

// ---------------------------------------------------------------------------
// C2.5.2 — PAGAMENTOS
// ---------------------------------------------------------------------------

Deno.test("5. dinheiro -> forma_pagamento '01', indicador_pagamento '0' (à vista)", () => {
  const { entrada, gap } = mapPagamentoToFocus({ forma_pagamento: "DINHEIRO", valor: 136 });
  assertEquals(entrada, { forma_pagamento: "01", valor_pagamento: 136, indicador_pagamento: "0" });
  assertEquals(gap, null);
});

Deno.test("6. PIX genérico -> bloqueado (modalidade desconhecida); nenhuma modalidade presumida", () => {
  const { entrada, gap } = mapPagamentoToFocus({ forma_pagamento: "PIX", valor: 100 });
  assertEquals(entrada, null);
  assertExists(gap);
  assertEquals(gap!.motivo.includes("modalidade"), true);
});

Deno.test("6b. PIX com pix_modalidade -> códigos confirmados pela Focus: 17 estático, 20 dinâmico, 23 automático", () => {
  assertEquals(mapPagamentoToFocus({ forma_pagamento: "PIX", valor: 10, pix_modalidade: "ESTATICO" }).entrada?.forma_pagamento, "17");
  assertEquals(mapPagamentoToFocus({ forma_pagamento: "PIX", valor: 10, pix_modalidade: "DINAMICO" }).entrada?.forma_pagamento, "20");
  assertEquals(mapPagamentoToFocus({ forma_pagamento: "PIX", valor: 10, pix_modalidade: "AUTOMATICO" }).entrada?.forma_pagamento, "23");
  const r = mapPagamentoToFocus({ forma_pagamento: "pix", valor: 12.5, pix_modalidade: "dinamico" });
  assertEquals(r.entrada, { forma_pagamento: "20", valor_pagamento: 12.5, indicador_pagamento: "0" });
  assertEquals(r.gap, null);
  // modalidade fora do contrato -> bloqueado, sem fallback
  assertEquals(mapPagamentoToFocus({ forma_pagamento: "PIX", valor: 1, pix_modalidade: "QRCODE" }).entrada, null);
});

Deno.test("6c. venda 100% PIX dinâmico -> uma forma '20' com o valor total; total bate com totais.liquido", () => {
  const payload = {
    natureza_operacao: "Venda de mercadoria",
    emitente: { cnpj: "1" },
    totais: { liquido: 136 },
    itens: [itemCompleto()],
    pagamentos: [{ forma_pagamento: "PIX", valor: 136, pix_modalidade: "DINAMICO" }],
  };
  const { body, gaps } = buildFocusNfceEnvelope(payload);
  assertEquals(body.formas_pagamento, [{ forma_pagamento: "20", valor_pagamento: 136, indicador_pagamento: "0" }]);
  assertEquals(gaps.some((g) => g.campo.startsWith("formas_pagamento")), false);
});

Deno.test("7. cartão (crédito/débito) -> código confirmado, mas gap de dados transacionais não capturados", () => {
  const credito = mapPagamentoToFocus({ forma_pagamento: "CARTAO_CREDITO", valor: 50 });
  assertEquals(credito.entrada?.forma_pagamento, "03");
  assertExists(credito.gap); // dados transacionais (bandeira/autorização/etc.) não capturados

  const debito = mapPagamentoToFocus({ forma_pagamento: "CARTAO_DEBITO", valor: 50 });
  assertEquals(debito.entrada?.forma_pagamento, "04");
});

Deno.test("8. pagamento misto — dinheiro + cartão + PIX estático gera 3 entradas na ordem, soma = total", () => {
  const payload = {
    natureza_operacao: "Venda de mercadoria",
    emitente: { cnpj: "1" },
    totais: { liquido: 156 },
    itens: [itemCompleto()],
    pagamentos: [
      { forma_pagamento: "DINHEIRO", valor: 50 },
      { forma_pagamento: "CARTAO_CREDITO", valor: 86 },
      { forma_pagamento: "PIX", valor: 20, pix_modalidade: "ESTATICO" },
    ],
  };
  const { body, gaps } = buildFocusNfceEnvelope(payload);
  assertEquals(body.formas_pagamento?.map((p) => p.forma_pagamento), ["01", "03", "17"]);
  assertEquals(body.formas_pagamento?.map((p) => p.valor_pagamento), [50, 86, 20]);
  assertEquals(gaps.some((g) => g.campo === "formas_pagamento[].valor_pagamento"), false);
});

Deno.test("8b. pagamento misto com PIX genérico -> PIX bloqueado e emissão bloqueante (nunca reduz a venda a uma forma)", () => {
  const payload = {
    natureza_operacao: "Venda de mercadoria",
    emitente: { cnpj: "1" },
    itens: [itemCompleto()],
    pagamentos: [
      { forma_pagamento: "DINHEIRO", valor: 50 },
      { forma_pagamento: "PIX", valor: 20 },
    ],
  };
  const { body, gaps, bloqueante } = buildFocusNfceEnvelope(payload);
  assertEquals(body.formas_pagamento?.map((p) => p.forma_pagamento), ["01"]);
  assertEquals(gaps.some((g) => g.campo === "formas_pagamento[].PIX"), true);
  assertEquals(bloqueante, true);
});

Deno.test("8c. múltiplos pagamentos cuja soma diverge do total líquido -> gap bloqueante", () => {
  const payload = {
    natureza_operacao: "Venda de mercadoria",
    emitente: { cnpj: "1" },
    totais: { liquido: 100 },
    itens: [itemCompleto()],
    pagamentos: [
      { forma_pagamento: "DINHEIRO", valor: 50 },
      { forma_pagamento: "PIX", valor: 40, pix_modalidade: "DINAMICO" },
    ],
  };
  const { gaps, bloqueante } = buildFocusNfceEnvelope(payload);
  assertEquals(gaps.some((g) => g.campo === "formas_pagamento[].valor_pagamento"), true);
  assertEquals(bloqueante, true);
});

Deno.test("CSOSN/regime: grupo de tributação continua não confirmado -> gap bloqueante por item (não inventado)", () => {
  const item = { ...itemCompleto(), csosn: "102" };
  const { gaps, bloqueante } = buildFocusNfceEnvelope({
    natureza_operacao: "Venda de mercadoria",
    emitente: { cnpj: "1", regime_tributario: "SIMPLES_NACIONAL" },
    itens: [item],
    pagamentos: [{ forma_pagamento: "DINHEIRO", valor: 136 }],
  });
  assertEquals(gaps.some((g) => g.campo === "items[1].tributacao_icms_pis_cofins"), true);
  assertEquals(bloqueante, true);
});

Deno.test("forma de pagamento Jinlong desconhecida -> gap explícito, não inventa código", () => {
  const { entrada, gap } = mapPagamentoToFocus({ forma_pagamento: "VALE_REFEICAO", valor: 10 });
  assertEquals(entrada, null);
  assertExists(gap);
});

Deno.test("omittedByDesign() é estável — mesma lista sempre", () => {
  assertEquals(omittedByDesign().map((g) => g.campo), omittedByDesign().map((g) => g.campo));
});

Deno.test("destinatario presente -> gap de local_destino interestadual/exterior (sem UF no snapshot)", () => {
  const { gaps } = buildFocusNfceEnvelope({ emitente: { cnpj: "1" }, destinatario: { cliente_id: "x", nome: "y" } });
  assertEquals(gaps.some((g) => g.campo === "local_destino_interestadual_exterior"), true);
});
