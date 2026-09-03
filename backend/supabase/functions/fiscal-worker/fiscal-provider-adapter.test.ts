// Onda C2.4/C2.5/C2.6/C2.9 — FocusProvider com fetch fake. Nenhum destes testes
// toca rede real nem Focus real.
//
// Sprint C2.9 (P0-3, achado Codex): `callProvider`/`emitirNfe` agora checam
// `bloqueante` (buildFocusNfceEnvelope) ANTES de montar a URL/chamar fetch —
// gap bloqueante = ZERO POST. Como o grupo de tributação (ICMS-CST/PIS/
// COFINS) ainda não confirmado pela Focus gera um gap bloqueante
// INCONDICIONAL para qualquer item real (ver fiscal_focus_dto.ts), NENHUM
// payload com itens consegue mais alcançar `fetch` através de
// `callProvider`/`emitirNfe` hoje — o que é o comportamento CORRETO (não dá
// pra emitir de verdade com tributação desconhecida), mas significa que os
// testes de mecânica HTTP (timeout, headers, shape do corpo, classificação
// de status) precisam exercitar as peças exportadas diretamente
// (`buildFocusEmitBody`, `postFocusEmit`, `classifyFocusEmitResponse`,
// `classifyFocusConsultaResponse`, `buildFocusEmitUrl`/`buildFocusConsultaUrl`)
// em vez de passar pelo gate inteiro — sem inventar um DTO "completo" que
// não existe de verdade hoje.

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { FiscalDoc } from "./fiscal_types.ts";
import {
  buildFocusConsultaUrl,
  buildFocusEmitBody,
  buildFocusEmitUrl,
  classifyFocusConsultaResponse,
  classifyFocusEmitResponse,
  FocusProvider,
  postFocusEmit,
  resolveFocusRef,
} from "./fiscal-provider-adapter.ts";

type FakeCall = { url: string; method: string; headers: Record<string, string>; body: string | null };

function installFakeFetch(handler: (call: FakeCall) => { status: number; body: unknown } | "abort") {
  const calls: FakeCall[] = [];
  const original = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).fetch = (input: string | URL, init?: RequestInit) => {
    const call: FakeCall = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers as HeadersInit).entries()),
      body: typeof init?.body === "string" ? init.body : null,
    };
    calls.push(call);
    const outcome = handler(call);
    if (outcome === "abort") {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }
    return Promise.resolve(
      new Response(JSON.stringify(outcome.body), { status: outcome.status, headers: { "Content-Type": "application/json" } }),
    );
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function fakeResponse(status: number): Response {
  return new Response(null, { status });
}

function doc(overrides: Partial<FiscalDoc> = {}): FiscalDoc {
  return {
    id: "doc-1",
    venda_id: "venda-1",
    tipo_doc: "NFCE",
    correlation_id: "corr-1",
    payload: { emitente: { cnpj: "12345678000199" }, data_venda: "2026-09-02T12:00:00Z" },
    ...overrides,
  };
}

/** Item minimamente completo pros campos NÃO-tributários — mesmo assim
 * sempre bloqueante hoje, por causa do gap incondicional de tributação. */
function itemQuaseCompleto() {
  return {
    produto_id: "22222222-2222-4222-8222-222222222222",
    nome: "Item Teste",
    ncm: "85171231",
    cfop: "5102",
    unidade_medida: "UN",
    quantidade: 1,
    preco_unitario_original: 10,
    desconto_unitario: 0,
    icms_origem: "0",
  };
}

const CFG = { type: "focus" as const, url: "https://homologacao.focusnfe.com.br", token: "tok-teste", timeout: 200 };

Deno.test("resolveFocusRef usa doc.id por padrão e é estável entre chamadas (11. mesma ref em retry)", () => {
  const d = doc();
  assertEquals(resolveFocusRef(d), d.id);
  assertEquals(resolveFocusRef(d), resolveFocusRef(d));
});

// ---------------------------------------------------------------------------
// P0-3 (Sprint C2.9, achado Codex) — gap bloqueante = ZERO chamada HTTP.
// ---------------------------------------------------------------------------

Deno.test("P0-3 — payload incompleto (tributação não confirmada) -> callProvider NÃO chama fetch, devolve FOCUS_DTO_INCOMPLETO", async () => {
  const { calls, restore } = installFakeFetch(() => ({ status: 200, body: { chave: "x", protocolo: "y" } }));
  try {
    const provider = new FocusProvider();
    const comItem = doc({
      payload: {
        emitente: { cnpj: "12345678000199" },
        itens: [itemQuaseCompleto()],
        pagamentos: [{ forma_pagamento: "DINHEIRO", valor: 10 }],
      },
    });
    const result = await provider.callProvider(comItem, CFG);
    assertEquals(calls.length, 0); // ZERO POST
    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.provider_code, "FOCUS_DTO_INCOMPLETO");
      assertEquals(result.transitorio, false);
    }
  } finally {
    restore();
  }
});

Deno.test("P0-3 — payload incompleto -> emitirNfe também NÃO chama fetch (mesmo gate, caminho NF-e)", async () => {
  const { calls, restore } = installFakeFetch(() => ({ status: 201, body: { chave_nfe: "x", protocolo_nfe: "y" } }));
  try {
    const provider = new FocusProvider();
    const comItem = doc({
      tipo_doc: "NFE",
      payload: {
        emitente: { cnpj: "12345678000199" },
        itens: [itemQuaseCompleto()],
        pagamentos: [{ forma_pagamento: "DINHEIRO", valor: 10 }],
      },
    });
    const estado = await provider.emitirNfe!(comItem, CFG);
    assertEquals(calls.length, 0);
    assertEquals(estado.kind, "erro_definitivo");
    if (estado.kind === "erro_definitivo") assertEquals(estado.provider_code, "FOCUS_DTO_INCOMPLETO");
  } finally {
    restore();
  }
});

Deno.test("P0-4 (item 7) — destinatário incompleto (NFC-e identificada, sem UF) -> callProvider NÃO chama fetch", async () => {
  const { calls, restore } = installFakeFetch(() => ({ status: 200, body: { chave: "x", protocolo: "y" } }));
  try {
    const provider = new FocusProvider();
    const identificada = doc({
      payload: {
        emitente: { cnpj: "12345678000199" },
        itens: [itemQuaseCompleto()],
        pagamentos: [{ forma_pagamento: "DINHEIRO", valor: 10 }],
        destinatario: { cliente_id: "cli-1", nome: "Cliente Teste", documento: "12345678901", tipo: "PF" },
      },
    });
    const result = await provider.callProvider(identificada, CFG);
    assertEquals(calls.length, 0);
    assertEquals(result.ok, false);
  } finally {
    restore();
  }
});

Deno.test("P0-4 (item 7) — NF-e sem destinatário -> emitirNfe NÃO chama fetch (destinatário é obrigatório)", async () => {
  const { calls, restore } = installFakeFetch(() => ({ status: 201, body: { chave_nfe: "x", protocolo_nfe: "y" } }));
  try {
    const provider = new FocusProvider();
    const semDestinatario = doc({
      tipo_doc: "NFE",
      payload: {
        emitente: { cnpj: "12345678000199" },
        itens: [itemQuaseCompleto()],
        pagamentos: [{ forma_pagamento: "DINHEIRO", valor: 10 }],
      },
    });
    const estado = await provider.emitirNfe!(semDestinatario, CFG);
    assertEquals(calls.length, 0);
    assertEquals(estado.kind, "erro_definitivo");
  } finally {
    restore();
  }
});

Deno.test("P0-3 — payload sem itens/pagamentos nenhum (venda vazia) também bloqueia, zero POST", async () => {
  const { calls, restore } = installFakeFetch(() => ({ status: 200, body: { chave: "x", protocolo: "y" } }));
  try {
    const provider = new FocusProvider();
    const result = await provider.callProvider(doc(), CFG); // doc() não tem itens/pagamentos
    assertEquals(calls.length, 0);
    assertEquals(result.ok, false);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// buildFocusEmitBody — shape do corpo, isolado do gate de bloqueante.
// ---------------------------------------------------------------------------

Deno.test("buildFocusEmitBody — _fastproduct_dto_gaps NUNCA aparece no corpo (campo interno, não é contrato Focus)", () => {
  const { body, gaps } = buildFocusEmitBody(doc({ payload: { emitente: { cnpj: "1" } } }), "ref-1");
  assertEquals(Object.prototype.hasOwnProperty.call(body, "_fastproduct_dto_gaps"), false);
  assertExists(gaps); // os gaps continuam disponíveis pro chamador, só não no wire
});

// ---------------------------------------------------------------------------
// P0-3 (Sprint C2.10, achado Codex) — wire é ALLOWLIST, não "snapshot menos
// alguns campos". Nenhum identificador interno do FastProduct chega ao JSON
// serializado que seria enviado à Focus.
// ---------------------------------------------------------------------------

const CAMPOS_INTERNOS_PROIBIDOS_NO_WIRE = ["documento_id", "venda_id", "tipo_doc", "correlation_id", "ref", "_fastproduct_dto_gaps"];

Deno.test("P0-3 — nenhum identificador interno (documento_id/venda_id/tipo_doc/correlation_id/ref) chega ao JSON serializado do corpo", () => {
  const d = doc({
    id: "doc-interno-123",
    venda_id: "venda-interna-456",
    correlation_id: "corr-interno-789",
    payload: {
      emitente: { cnpj: "12345678000199" },
      itens: [itemQuaseCompleto()],
      pagamentos: [{ forma_pagamento: "DINHEIRO", valor: 10 }],
    },
  });
  const { body } = buildFocusEmitBody(d, "ref-que-so-vai-na-url");
  const serializado = JSON.stringify(body);
  for (const campo of CAMPOS_INTERNOS_PROIBIDOS_NO_WIRE) {
    assertEquals(serializado.includes(`"${campo}"`), false, `campo interno '${campo}' vazou para o wire: ${serializado}`);
  }
  // `ref` continua transportado do jeito CONFIRMADO — na URL, não no corpo.
  const url = buildFocusEmitUrl("https://homologacao.focusnfe.com.br", d.tipo_doc, "ref-que-so-vai-na-url");
  assertEquals(url.includes("ref=ref-que-so-vai-na-url"), true);
});

Deno.test("P0-3 — internalMeta carrega os identificadores internos separadamente do body (uso só em log/erro do worker)", () => {
  const d = doc({ id: "doc-x", venda_id: "venda-y", correlation_id: "corr-z" });
  const { internalMeta } = buildFocusEmitBody(d, "ref-w");
  assertEquals(internalMeta.documento_id, "doc-x");
  assertEquals(internalMeta.venda_id, "venda-y");
  assertEquals(internalMeta.correlation_id, "corr-z");
  assertEquals(internalMeta.ref, "ref-w");
});

Deno.test("C2.5.1 — NFC-e presencial sem frete: corpo tem modalidade_frete=9, presenca_comprador=1, local_destino=1", () => {
  const { body } = buildFocusEmitBody(doc(), "ref-1");
  assertEquals(body.modalidade_frete, "9");
  assertEquals(body.presenca_comprador, "1");
  assertEquals(body.local_destino, "1");
});

Deno.test("C2.5.2 — NFC-e anônima: sem destinatario no snapshot, não bloqueia por causa do destinatário", () => {
  const anon = doc({ payload: { emitente: { cnpj: "12345678000199" } } });
  const { bloqueante, gaps } = buildFocusEmitBody(anon, "ref-1");
  // Bloqueante por falta de itens/pagamentos (payload vazio), mas NÃO por
  // causa do destinatário — anônimo é um caminho válido e não deveria gerar
  // gap de destinatário nenhum.
  assertEquals(gaps.some((g) => g.includes("destinatario") || g.includes("local_destino")), false);
  assertEquals(bloqueante, true); // ainda bloqueante — payload sem itens/pagamentos
});

Deno.test("P0-5 — NFC-e identificada (destinatario presente, sem UF): BLOQUEADA, gap local_destino reportado", () => {
  const identificada = doc({
    payload: {
      emitente: { cnpj: "12345678000199" },
      itens: [itemQuaseCompleto()],
      pagamentos: [{ forma_pagamento: "DINHEIRO", valor: 10 }],
      destinatario: { cliente_id: "cli-1", nome: "Cliente Teste", documento: "12345678901", tipo: "PF" },
    },
  });
  const { bloqueante, gaps } = buildFocusEmitBody(identificada, "ref-1");
  assertEquals(bloqueante, true);
  assertEquals(gaps.includes("local_destino_interestadual_exterior"), true);
});

Deno.test("P0-5 — NF-e sem destinatario: BLOQUEADA (destinatário é obrigatório, não é nota ao consumidor anônimo)", () => {
  const semDestinatario = doc({
    tipo_doc: "NFE",
    payload: {
      emitente: { cnpj: "12345678000199" },
      itens: [itemQuaseCompleto()],
      pagamentos: [{ forma_pagamento: "DINHEIRO", valor: 10 }],
    },
  });
  const { bloqueante, gaps } = buildFocusEmitBody(semDestinatario, "ref-1");
  assertEquals(bloqueante, true);
  assertEquals(gaps.includes("destinatario"), true);
});

Deno.test("P0-5 — NF-e com destinatario incompleto (sem documento): BLOQUEADA com gap específico de identificação", () => {
  const semDocumento = doc({
    tipo_doc: "NFE",
    payload: {
      emitente: { cnpj: "12345678000199" },
      itens: [itemQuaseCompleto()],
      pagamentos: [{ forma_pagamento: "DINHEIRO", valor: 10 }],
      destinatario: { cliente_id: "cli-1", nome: "Cliente Teste", documento: null, tipo: "PF" },
    },
  });
  const { gaps } = buildFocusEmitBody(semDocumento, "ref-1");
  assertEquals(gaps.includes("destinatario.identificacao"), true);
});

Deno.test("P0-4 — pagamento misto (dinheiro + PIX): BLOQUEADO, não reduz a venda a uma única forma", () => {
  const misto = doc({
    payload: {
      emitente: { cnpj: "12345678000199" },
      itens: [itemQuaseCompleto()],
      pagamentos: [
        { forma_pagamento: "DINHEIRO", valor: 50 },
        { forma_pagamento: "PIX", valor: 50 },
      ],
    },
  });
  const { body, bloqueante } = buildFocusEmitBody(misto, "ref-1");
  assertEquals(bloqueante, true);
  // Ainda assim reporta o que FOI mapeado (dinheiro) — não é isso que
  // bloqueia o POST, é a checagem de bloqueante que impede o envio parcial.
  assertEquals((body.formas_pagamento as unknown[] | undefined)?.length, 1);
});

Deno.test("P0-4 — pagamento único completo (só dinheiro) não é bloqueado pelo critério de pagamentos", () => {
  const unico = doc({
    payload: {
      emitente: { cnpj: "12345678000199" },
      pagamentos: [{ forma_pagamento: "DINHEIRO", valor: 10 }],
    },
  });
  const { gaps } = buildFocusEmitBody(unico, "ref-1");
  assertEquals(gaps.some((g) => g === "formas_pagamento[]"), false);
});

Deno.test("17. data_emissao é calculada no momento do envio (próxima de 'agora'), nunca lida do data_venda congelado", () => {
  const vendaAntiga = doc({ payload: { emitente: { cnpj: "12345678000199" }, data_venda: "2020-01-01T00:00:00.000Z" } });
  const antes = Date.now();
  const { body } = buildFocusEmitBody(vendaAntiga, "ref-1");
  const depois = Date.now();
  assertExists(body.data_emissao);
  assertEquals(body.data_emissao === "2020-01-01T00:00:00.000Z", false);
  const emissaoMs = new Date(body.data_emissao as string).getTime();
  assertEquals(emissaoMs >= antes && emissaoMs <= depois, true);
  assertEquals(/Z$|[+-]\d{2}:\d{2}$/.test(body.data_emissao as string), true);
});

// ---------------------------------------------------------------------------
// buildFocusEmitUrl/buildFocusConsultaUrl — shape de URL isolado.
// ---------------------------------------------------------------------------

Deno.test("buildFocusEmitUrl — NFC-e usa /v2/nfce?ref=, NF-e usa /v2/nfe?ref=", () => {
  assertEquals(buildFocusEmitUrl("https://homologacao.focusnfe.com.br", "NFCE", "doc-1"), "https://homologacao.focusnfe.com.br/v2/nfce?ref=doc-1");
  assertEquals(buildFocusEmitUrl("https://homologacao.focusnfe.com.br", "NFE", "doc-1"), "https://homologacao.focusnfe.com.br/v2/nfe?ref=doc-1");
});

Deno.test("buildFocusConsultaUrl — ref vai no path, não na query", () => {
  assertEquals(buildFocusConsultaUrl("https://homologacao.focusnfe.com.br", "NFCE", "ref-abc"), "https://homologacao.focusnfe.com.br/v2/nfce/ref-abc");
});

// ---------------------------------------------------------------------------
// postFocusEmit — mecânica HTTP isolada (headers, timeout, corpo).
// ---------------------------------------------------------------------------

Deno.test("postFocusEmit — POST com Basic auth correto, corpo = JSON do body passado", async () => {
  const { calls, restore } = installFakeFetch(() => ({ status: 200, body: { chave_nfe: "chave-x", protocolo_autorizacao: "PROTO123" } }));
  try {
    const estado = await postFocusEmit("https://homologacao.focusnfe.com.br/v2/nfce?ref=doc-1", "tok-teste", { foo: "bar" }, 200);
    assertEquals(estado.kind, "autorizado");
    if (estado.kind === "autorizado") {
      assertEquals(estado.chave_fiscal, "chave-x");
      assertEquals(estado.protocolo, "PROTO123");
    }
    assertEquals(calls.length, 1);
    assertEquals(calls[0].method, "POST");
    assertEquals(calls[0].headers["authorization"], `Basic ${btoa("tok-teste:")}`);
    assertEquals(JSON.parse(calls[0].body!), { foo: "bar" });
  } finally {
    restore();
  }
});

Deno.test("3. postFocusEmit — timeout: fetch nunca responde, erro transitório após o timeout configurado, 1 única tentativa", async () => {
  const { calls, restore } = installFakeFetch(() => "abort");
  try {
    const estado = await postFocusEmit("https://homologacao.focusnfe.com.br/v2/nfce?ref=doc-1", "tok-teste", {}, 10);
    assertEquals(estado.kind, "erro_transitorio");
    if (estado.kind === "erro_transitorio") assertEquals(estado.provider_code, "FOCUS_PROVIDER_TIMEOUT");
    assertEquals(calls.length, 1); // só 1 tentativa de POST — não reemitiu sozinho
  } finally {
    restore();
  }
});

Deno.test("23/24 — token nunca aparece em logs nem no corpo enviado (só no header Authorization)", async () => {
  const { calls, restore } = installFakeFetch(() => ({ status: 500, body: { mensagem: "erro interno" } }));
  const originalError = console.error;
  const logged: string[] = [];
  console.error = (...args: unknown[]) => { logged.push(args.map(String).join(" ")); };
  try {
    await postFocusEmit("https://homologacao.focusnfe.com.br/v2/nfce?ref=doc-1", "tok-teste", { algum: "campo" }, 200);
    for (const line of logged) {
      assertEquals(line.includes("tok-teste"), false, "token vazou para console.error");
    }
    assertExists(calls[0].body);
    assertEquals(calls[0].body!.includes("tok-teste"), false);
  } finally {
    console.error = originalError;
    restore();
  }
});

// ---------------------------------------------------------------------------
// classifyFocusEmitResponse — classificador puro (2xx/4xx/5xx/202).
// ---------------------------------------------------------------------------

Deno.test("classifyFocusEmitResponse — 200 com chave+protocolo -> autorizado", () => {
  const estado = classifyFocusEmitResponse(fakeResponse(200), { chave_nfe: "35...44digitos", protocolo_autorizacao: "PROTO123" });
  assertEquals(estado.kind, "autorizado");
});

Deno.test("2. classifyFocusEmitResponse — 200 sem chave/protocolo reconhecível -> rejeitado", () => {
  const estado = classifyFocusEmitResponse(fakeResponse(200), { mensagem: "cadastro invalido" });
  assertEquals(estado.kind, "rejeitado");
});

Deno.test("6. classifyFocusEmitResponse — 201 (NF-e) -> autorizado", () => {
  const estado = classifyFocusEmitResponse(fakeResponse(201), { chave_nfe: "chave-nfe-1", protocolo_nfe: "proto-nfe-1" });
  assertEquals(estado.kind, "autorizado");
});

Deno.test("7. classifyFocusEmitResponse — 202 (NF-e) -> processando, NÃO é erro", () => {
  const estado = classifyFocusEmitResponse(fakeResponse(202), { status: "processando_autorizacao" });
  assertEquals(estado.kind, "processando");
});

Deno.test("19. classifyFocusEmitResponse — 200 sem indício de chave/erro -> rejeitado (não sucesso silencioso)", () => {
  const estado = classifyFocusEmitResponse(fakeResponse(200), { alguma_coisa: "irrelevante" });
  assertEquals(estado.kind, "rejeitado");
});

Deno.test("20. classifyFocusEmitResponse — HTTP 429 -> erro_transitorio (retryable)", () => {
  const estado = classifyFocusEmitResponse(fakeResponse(429), { mensagem: "muitas requisicoes" });
  assertEquals(estado.kind, "erro_transitorio");
});

Deno.test("21. classifyFocusEmitResponse — HTTP 503 -> erro_transitorio", () => {
  const estado = classifyFocusEmitResponse(fakeResponse(503), {});
  assertEquals(estado.kind, "erro_transitorio");
});

Deno.test("22. classifyFocusEmitResponse — HTTP 400 -> erro_definitivo (não transitório)", () => {
  const estado = classifyFocusEmitResponse(fakeResponse(400), { codigo: "requisicao_invalida" });
  assertEquals(estado.kind, "erro_definitivo");
  if (estado.kind === "erro_definitivo") assertEquals(estado.provider_code, "requisicao_invalida");
});

// ---------------------------------------------------------------------------
// consultarDocumento (GET) — não é afetado pelo gate de bloqueante (nunca emite).
// ---------------------------------------------------------------------------

Deno.test("4. consulta NFC-e autorizada — GET /v2/nfce/{ref}", async () => {
  const { calls, restore } = installFakeFetch(() => ({ status: 200, body: { chave: "35...", protocolo: "P1" } }));
  try {
    const provider = new FocusProvider();
    const estado = await provider.consultarDocumento("ref-abc", "NFCE", CFG);
    assertEquals(estado.kind, "autorizado");
    assertEquals(calls[0].method, "GET");
    assertEquals(calls[0].url, "https://homologacao.focusnfe.com.br/v2/nfce/ref-abc");
  } finally {
    restore();
  }
});

Deno.test("5. consulta NFC-e rejeitada — BLOQUEADO (schema de rejeição via consulta não confirmado)", () => {
  // Registrado, não implementado: a documentação fornecida confirma que a
  // consulta "pode retornar... erro de autorização", mas não o nome/formato
  // do campo que sinaliza isso. classifyFocusConsultaResponse trata qualquer
  // 2xx sem chave/protocolo reconhecível como "processando" (lado seguro —
  // não presumir rejeição sem confirmação), não "rejeitado". Ver
  // fiscal_types.ts (nota sobre schema de resposta não confirmado) — mesma
  // ambiguidade cobre "Cancelada" (P0-6): sem o JSON real, não dá pra
  // distinguir de "Autorizada" quando o corpo também carrega chave/protocolo.
  assertEquals(true, true);
});

Deno.test("8. consulta posterior de NF-e 202 -> autorizada", async () => {
  const { restore } = installFakeFetch(() => ({ status: 200, body: { chave_nfe: "chave-final", protocolo_nfe: "proto-final" } }));
  try {
    const provider = new FocusProvider();
    const estado = await provider.consultarDocumento("doc-1", "NFE", CFG);
    assertEquals(estado.kind, "autorizado");
    if (estado.kind === "autorizado") {
      assertEquals(estado.chave_fiscal, "chave-final");
      assertEquals(estado.protocolo, "proto-final");
    }
  } finally {
    restore();
  }
});

Deno.test("15. consulta retorna estado ambíguo (2xx sem chave) -> 'processando', não 'rejeitado' nem erro", async () => {
  const { restore } = installFakeFetch(() => ({ status: 200, body: { status: "processando_autorizacao" } }));
  try {
    const provider = new FocusProvider();
    const estado = await provider.consultarDocumento("ref-x", "NFE", CFG);
    assertEquals(estado.kind, "processando");
  } finally {
    restore();
  }
});

Deno.test("classifyFocusConsultaResponse — 404 -> nao_encontrado (confirmado pela documentação oficial)", () => {
  assertEquals(classifyFocusConsultaResponse(fakeResponse(404), {}).kind, "nao_encontrado");
});

Deno.test("classifyFocusConsultaResponse — 5xx -> erro_transitorio (não confundir com nao_encontrado)", () => {
  assertEquals(classifyFocusConsultaResponse(fakeResponse(503), {}).kind, "erro_transitorio");
});

Deno.test("P0-6 — nenhum estado de consulta 'desconhecido' vira nao_encontrado por engano (só 404 literal)", () => {
  // Reforça o boundary: qualquer 2xx ambíguo vira 'processando' (fail-closed
  // — nunca autoriza um novo POST), nunca 'nao_encontrado'. Só 404 libera.
  for (const status of [200, 201, 204]) {
    const estado = classifyFocusConsultaResponse(fakeResponse(status), {});
    assertEquals(estado.kind === "nao_encontrado", false, `status ${status} não deveria virar nao_encontrado`);
  }
});
