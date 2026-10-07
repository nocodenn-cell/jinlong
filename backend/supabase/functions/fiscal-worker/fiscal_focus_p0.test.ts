// Sprint P0 Focus NFe — contrato confirmado pela Focus em 2026-10-03:
// classificação pelo `status`, `already_processed`, XML real (link sem
// autenticação), cancelamento com XML separado, PIX. Nenhum teste toca rede
// real: `fetch` é substituído por um stub em cada teste.

import { assert, assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { FiscalDoc, FocusRemoteState } from "./fiscal_types.ts";
import {
  baixarXmlFocus,
  buildFocusEmitBody,
  classifyFocusConsultaResponse,
  classifyFocusEmitResponse,
  FocusProvider,
  isWellFormedXml,
  postFocusEmit,
  resolveFocusArtefatoUrl,
  type ProviderConfig,
} from "./fiscal-provider-adapter.ts";
import {
  applyFocusRemoteState,
  enforceRetrySafeGate,
  processarCancelamento,
  resolverEstadoEmissao,
  type WorkerCounters,
} from "./fiscal_worker_orchestration.ts";
import { FISCAL_XML_BUCKET, processXmlDocumento, sha256Hex, type XmlDoc, type XmlWorkerCounters } from "./fiscal_xml_orchestration.ts";

const TOKEN = "token-secreto-focus-123";
const BASE = "https://homologacao.focusnfe.com.br";
const CFG: ProviderConfig = { type: "focus", url: BASE, token: TOKEN, timeout: 2_000 };
const CHAVE = "35261012345678000199650010000000011000000019";
const XML_OK = `<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00"><NFe><infNFe Id="NFe${CHAVE}"><ide><mod>65</mod></ide></infNFe></NFe><protNFe><infProt><nProt>135000000000001</nProt></infProt></protNFe></nfeProc>`;
const XML_CANC = `<?xml version="1.0" encoding="UTF-8"?><procEventoNFe versao="1.00"><evento><infEvento><tpEvento>110111</tpEvento></infEvento></evento></procEventoNFe>`;

type FetchCall = { url: string; method: string; headers: Record<string, string>; body: string | null };

function stubFetch(handler: (call: FetchCall) => Response | Promise<Response>): { calls: FetchCall[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers ?? {}).forEach((v, k) => (headers[k] = v));
    const call: FetchCall = {
      url: String(input),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : null,
    };
    calls.push(call);
    if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
    return await handler(call);
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fakeRpc(dataPorFn: Record<string, unknown> = {}) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client = {
    rpcCalls,
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      return { data: fn in dataPorFn ? dataPorFn[fn] : true, error: null };
    },
    // deno-lint-ignore no-explicit-any
  } as any;
  return client;
}

function fakeStorage() {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const uploads: Array<{ bucket: string; path: string; options: unknown }> = [];
  const downloads: string[] = [];
  const disco = new Map<string, string>();
  const client = {
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      return { data: true, error: null };
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, body: unknown, options: unknown) {
            uploads.push({ bucket, path, options });
            if (disco.has(path)) return { data: null, error: { statusCode: "409", error: "Duplicate", message: "The resource already exists" } };
            disco.set(path, String(body));
            return { data: { path }, error: null };
          },
          async download(path: string) {
            downloads.push(path);
            const c = disco.get(path);
            if (c === undefined) return { data: null, error: { message: "not_found" } };
            return { data: { text: async () => c }, error: null };
          },
        };
      },
    },
    // deno-lint-ignore no-explicit-any
  } as any;
  return { client, rpcCalls, uploads, downloads, disco };
}

function fiscalDoc(over: Partial<FiscalDoc> = {}): FiscalDoc {
  return {
    id: "doc-p0",
    venda_id: "venda-p0",
    tipo_doc: "NFC_E_STUB",
    tentativas: 0,
    ja_tentou_emissao_antes: false,
    payload: { loja_id: "loja-1" },
    ...over,
  };
}

function counters(): WorkerCounters {
  return { emitted: [], failed: [], retried: [] };
}

function xmlCounters(): XmlWorkerCounters {
  return { armazenados: [], bloqueados: [], comErro: [], ignoradosPorConcorrencia: [] };
}

function xmlDoc(over: Partial<XmlDoc> = {}): XmlDoc {
  return {
    id: "doc-xml",
    venda_id: "venda-xml",
    tipo_doc: "NFC_E_STUB",
    provider: "focus:homologacao:loja-1",
    lease_token: "lease-1",
    focus_xml_path: "https://api.focusnfe.com.br/arquivos/doc-xml.xml",
    ...over,
  };
}

function payloadNfce(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    loja_id: "loja-1",
    natureza_operacao: "Venda de mercadoria",
    emitente: { cnpj: "12345678000199", regime_tributario: "SIMPLES_NACIONAL" },
    totais: { liquido: 136 },
    itens: [{
      produto_id: "p1",
      nome: "Umidificador",
      quantidade: 2,
      preco_unitario_original: 68,
      preco_unitario: 68,
      desconto_unitario: 0,
      unidade_medida: "UN",
      ncm: "85094000",
      cfop: "5102",
      csosn: "102",
      icms_origem: "0",
    }],
    pagamentos: [{ forma_pagamento: "PIX", valor: 136, pix_modalidade: "DINAMICO" }],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Emissão
// ---------------------------------------------------------------------------

Deno.test("EMISSÃO — corpo NFC-e leva natureza_operacao do snapshot e a forma PIX dinâmico (20)", () => {
  const { body, gaps } = buildFocusEmitBody(fiscalDoc({ payload: payloadNfce() }), "doc-p0");
  assertEquals(body.natureza_operacao, "Venda de mercadoria");
  assertEquals(body.cnpj_emitente, "12345678000199");
  // deno-lint-ignore no-explicit-any
  assertEquals((body.formas_pagamento as any[])[0].forma_pagamento, "20");
  assertEquals(gaps.includes("natureza_operacao"), false);
});

Deno.test("EMISSÃO — POST chega à Focus com Basic Auth, ref na query e corpo JSON (mecânica HTTP)", async () => {
  const { body } = buildFocusEmitBody(fiscalDoc({ payload: payloadNfce() }), "doc-p0");
  const f = stubFetch(() =>
    jsonRes(201, { status: "autorizado", chave_nfe: CHAVE, protocolo: "135000000000001", caminho_xml_nota_fiscal: "/arquivos/x.xml" })
  );
  try {
    const estado = await postFocusEmit(`${BASE}/v2/nfce?ref=doc-p0`, TOKEN, body, 2_000);
    assertEquals(estado.kind, "autorizado");
    assertEquals(f.calls.length, 1);
    assertEquals(f.calls[0].method, "POST");
    assertEquals(f.calls[0].url, `${BASE}/v2/nfce?ref=doc-p0`);
    assertEquals(f.calls[0].headers["authorization"], `Basic ${btoa(`${TOKEN}:`)}`);
    assertEquals(JSON.parse(f.calls[0].body!).natureza_operacao, "Venda de mercadoria");
  } finally {
    f.restore();
  }
});

Deno.test("EMISSÃO — natureza_operacao ausente bloqueia ANTES do POST (zero fetch), sem default", async () => {
  const f = stubFetch(() => jsonRes(500, {}));
  try {
    const p = payloadNfce();
    delete p.natureza_operacao;
    const estado = await new FocusProvider().emitirDocumento(fiscalDoc({ payload: p }), CFG);
    assertEquals(estado.kind, "erro_definitivo");
    assertEquals(estado.kind === "erro_definitivo" && estado.provider_message?.includes("natureza_operacao"), true);
    assertEquals(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

Deno.test("EMISSÃO — CSOSN/regime: tributação não confirmada pela Focus continua bloqueando o POST (zero fetch)", async () => {
  const f = stubFetch(() => jsonRes(201, {}));
  try {
    const estado = await new FocusProvider().emitirDocumento(fiscalDoc({ payload: payloadNfce() }), CFG);
    assertEquals(estado.kind, "erro_definitivo");
    assertEquals(estado.kind === "erro_definitivo" && estado.provider_message?.includes("tributacao_icms_pis_cofins"), true);
    assertEquals(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

Deno.test("EMISSÃO — status=autorizado captura chave, protocolo e as 3 referências Focus como vieram", () => {
  const estado = classifyFocusEmitResponse(new Response(null, { status: 201 }), {
    status: "autorizado",
    chave_nfe: CHAVE,
    protocolo: "135000000000001",
    caminho_xml_nota_fiscal: "/arquivos/123/NFe.xml",
    caminho_danfe: "/notas_fiscais_consumidor/NFe.html",
    qrcode_url: "https://www.fazenda.sp.gov.br/nfce/qrcode?p=abc",
  });
  assertEquals(estado.kind, "autorizado");
  if (estado.kind !== "autorizado") return;
  assertEquals(estado.chave_fiscal, CHAVE);
  assertEquals(estado.artefatos, {
    xml_path: "/arquivos/123/NFe.xml",
    danfe_path: "/notas_fiscais_consumidor/NFe.html",
    qrcode_url: "https://www.fazenda.sp.gov.br/nfce/qrcode?p=abc",
  });
});

Deno.test("EMISSÃO — status=autorizado SEM chave/protocolo nunca vira EMITIDO (erro transitório)", () => {
  const estado = classifyFocusEmitResponse(new Response(null, { status: 200 }), { status: "autorizado" });
  assertEquals(estado.kind, "erro_transitorio");
});

Deno.test("EMISSÃO — status=processando_autorizacao -> processando (mesmo em HTTP 200/201 NFC-e)", () => {
  assertEquals(classifyFocusEmitResponse(new Response(null, { status: 201 }), { status: "processando_autorizacao" }).kind, "processando");
  assertEquals(classifyFocusConsultaResponse(new Response(null, { status: 200 }), { status: "processando_autorizacao" }).kind, "processando");
});

Deno.test("EMISSÃO — status=erro_autorizacao -> rejeitado com mensagem da Focus", () => {
  const estado = classifyFocusEmitResponse(new Response(null, { status: 200 }), {
    status: "erro_autorizacao",
    mensagem: "Rejeição: CFOP inválido",
  });
  assertEquals(estado.kind, "rejeitado");
  assertEquals(estado.kind === "rejeitado" && estado.provider_message, "Rejeição: CFOP inválido");
});

Deno.test("EMISSÃO — status=cancelado NUNCA é autorizado, mesmo com chave/protocolo da autorização no corpo", () => {
  const corpo = { status: "cancelado", chave_nfe: CHAVE, protocolo: "135000000000001", numero_protocolo: "135000000000099", caminho_xml_cancelamento: "/arquivos/canc.xml" };
  const e1 = classifyFocusEmitResponse(new Response(null, { status: 200 }), corpo);
  const e2 = classifyFocusConsultaResponse(new Response(null, { status: 200 }), corpo);
  assertEquals(e1.kind, "cancelado");
  assertEquals(e2.kind, "cancelado");
  if (e2.kind !== "cancelado") return;
  assertEquals(e2.protocolo_cancelamento, "135000000000099");
  assertEquals(e2.xml_cancelamento_path, "/arquivos/canc.xml");
});

Deno.test("EMISSÃO — status=denegado nunca vira emitido", () => {
  const corpo = { status: "denegado", chave_nfe: CHAVE, protocolo: "135000000000001", mensagem_sefaz: "Uso denegado" };
  assertEquals(classifyFocusEmitResponse(new Response(null, { status: 200 }), corpo).kind, "denegado");
  assertEquals(classifyFocusConsultaResponse(new Response(null, { status: 200 }), corpo).kind, "denegado");
});

Deno.test("EMISSÃO — status desconhecido -> erro transitório explícito (nem sucesso nem rejeição presumidos)", () => {
  const estado = classifyFocusConsultaResponse(new Response(null, { status: 200 }), { status: "algo_novo" });
  assertEquals(estado.kind, "erro_transitorio");
});

Deno.test("EMISSÃO — consulta 404 -> nao_encontrado", () => {
  assertEquals(classifyFocusConsultaResponse(new Response(null, { status: 404 }), {}).kind, "nao_encontrado");
});

Deno.test("EMISSÃO — already_processed -> ja_processado (independe do HTTP)", () => {
  assertEquals(classifyFocusEmitResponse(new Response(null, { status: 422 }), { codigo: "already_processed", mensagem: "Nota já processada" }).kind, "ja_processado");
});

Deno.test("EMISSÃO — timeout do POST -> erro transitório (retry seguro preservado)", async () => {
  const f = stubFetch((call) =>
    new Promise((_resolve, reject) => {
      setTimeout(() => reject(new DOMException("aborted", "AbortError")), 50);
      void call;
    })
  );
  try {
    const estado = await postFocusEmit(`${BASE}/v2/nfce?ref=x`, TOKEN, {}, 10);
    assertEquals(estado.kind, "erro_transitorio");
    assertEquals(estado.kind === "erro_transitorio" && estado.erro, "FOCUS_PROVIDER_TIMEOUT");
  } finally {
    f.restore();
  }
});

Deno.test("ORQUESTRAÇÃO — already_processed consulta a MESMA referência e aplica o estado remoto (sem 2º POST)", async () => {
  const consultas: string[] = [];
  const provider = {
    consultarDocumento: async (ref: string) => {
      consultas.push(ref);
      return {
        kind: "autorizado",
        chave_fiscal: CHAVE,
        protocolo: "135000000000001",
        provider_ref: null,
        artefatos: { xml_path: "/arquivos/x.xml", danfe_path: null, qrcode_url: null },
        payload: null,
      } as FocusRemoteState;
    },
  };
  const estado = await resolverEstadoEmissao(fiscalDoc(), { kind: "ja_processado", payload: null }, provider, "doc-p0", CFG);
  assertEquals(consultas, ["doc-p0"]);
  const supa = fakeRpc();
  const c = counters();
  await applyFocusRemoteState(supa, fiscalDoc(), estado, c);
  assertEquals(supa.rpcCalls.map((r: { fn: string }) => r.fn), ["fiscal_marcar_emitido_focus"]);
  assertEquals(supa.rpcCalls[0].args.p_focus_xml_path, "/arquivos/x.xml");
});

Deno.test("ORQUESTRAÇÃO — already_processed com consulta inconclusiva (404) -> erro transitório, nunca outra ref", async () => {
  const provider = { consultarDocumento: async () => ({ kind: "nao_encontrado" }) as FocusRemoteState };
  const estado = await resolverEstadoEmissao(fiscalDoc(), { kind: "ja_processado", payload: null }, provider, "doc-p0", CFG);
  assertEquals(estado.kind, "ja_processado");
  const supa = fakeRpc();
  await applyFocusRemoteState(supa, fiscalDoc(), estado, counters());
  assertEquals(supa.rpcCalls.length, 1);
  assertEquals(supa.rpcCalls[0].fn, "fiscal_marcar_erro");
  assertEquals(supa.rpcCalls[0].args.p_transitorio, true);
});

Deno.test("ORQUESTRAÇÃO — cancelado aplica fiscal_marcar_cancelado (nunca fiscal_marcar_emitido*)", async () => {
  const supa = fakeRpc();
  await applyFocusRemoteState(supa, fiscalDoc(), {
    kind: "cancelado",
    protocolo_cancelamento: "135000000000099",
    xml_cancelamento_path: "/arquivos/canc.xml",
    payload: null,
  }, counters());
  assertEquals(supa.rpcCalls.map((r: { fn: string }) => r.fn), ["fiscal_marcar_cancelado"]);
  assertEquals(supa.rpcCalls[0].args.p_lease_token, null);
});

Deno.test("ORQUESTRAÇÃO — denegado vira erro não-retryable FOCUS_DENEGADO", async () => {
  const supa = fakeRpc();
  await applyFocusRemoteState(supa, fiscalDoc(), {
    kind: "denegado",
    erro: "FOCUS_DENEGADO",
    provider_code: "FOCUS_DENEGADO",
    provider_message: "Uso denegado",
    payload: null,
  }, counters());
  assertEquals(supa.rpcCalls[0].fn, "fiscal_marcar_erro_normalizado");
  assertEquals(supa.rpcCalls[0].args.p_error_code, "FOCUS_DENEGADO");
  assertEquals(supa.rpcCalls[0].args.p_retryable, false);
});

Deno.test("ORQUESTRAÇÃO — retry seguro: consulta prévia devolve cancelado -> sem POST, CANCELADO aplicado", async () => {
  const supa = fakeRpc();
  const provider = {
    consultarDocumento: async () => ({ kind: "cancelado", protocolo_cancelamento: "1", xml_cancelamento_path: null, payload: null }) as FocusRemoteState,
  };
  const gate = await enforceRetrySafeGate(supa, fiscalDoc({ ja_tentou_emissao_antes: true }), provider, "doc-p0", CFG, counters());
  assertEquals(gate.proceed, false);
  assertEquals(supa.rpcCalls[0].fn, "fiscal_marcar_cancelado");
});

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

Deno.test("XML — URL absoluta https usada exatamente como veio; relativa resolvida no host do próprio ambiente, sem /v2", () => {
  assertEquals(resolveFocusArtefatoUrl("https://api.focusnfe.com.br/arquivos/a.xml", BASE), "https://api.focusnfe.com.br/arquivos/a.xml");
  assertEquals(resolveFocusArtefatoUrl("/arquivos/123/a.xml", `${BASE}/`), `${BASE}/arquivos/123/a.xml`);
  assertEquals(resolveFocusArtefatoUrl("http://inseguro/a.xml", BASE), null);
  assertEquals(resolveFocusArtefatoUrl("//outro-host/a.xml", BASE), null);
  assertEquals(resolveFocusArtefatoUrl("arquivos/a.xml", BASE), null);
  assertEquals(resolveFocusArtefatoUrl("", BASE), null);
});

Deno.test("XML — download sem Basic Auth (nenhum header Authorization, token não aparece no request)", async () => {
  const f = stubFetch(() => new Response(XML_OK, { status: 200 }));
  try {
    const r = await baixarXmlFocus("/arquivos/123/a.xml", BASE, 2_000);
    assertEquals(r.kind, "obtido");
    assertEquals(f.calls.length, 1);
    assertEquals(f.calls[0].method, "GET");
    assertEquals(f.calls[0].url, `${BASE}/arquivos/123/a.xml`);
    assertEquals("authorization" in f.calls[0].headers, false);
    assertEquals(JSON.stringify(f.calls[0]).includes(TOKEN), false);
  } finally {
    f.restore();
  }
});

Deno.test("XML — resposta HTTP inválida: 5xx/404 transitório, 403 definitivo", async () => {
  for (const [status, kind] of [[503, "erro_transitorio"], [404, "erro_transitorio"], [403, "erro_definitivo"]] as const) {
    const f = stubFetch(() => new Response("x", { status }));
    try {
      const r = await baixarXmlFocus("https://api.focusnfe.com.br/a.xml", BASE, 2_000);
      assertEquals(r.kind, kind);
      assertEquals("motivo" in r && r.motivo, `FOCUS_XML_HTTP_${status}`);
    } finally {
      f.restore();
    }
  }
});

Deno.test("XML — conteúdo não XML (JSON, HTML de erro, XML truncado, vazio) é recusado", async () => {
  for (const corpo of ['{"erro":"x"}', "<html><body><br></body></html>", "<nfeProc><NFe>", "", "texto"]) {
    const f = stubFetch(() => new Response(corpo, { status: 200 }));
    try {
      const r = await baixarXmlFocus("https://api.focusnfe.com.br/a.xml", BASE, 2_000);
      assertEquals(r.kind, "erro_definitivo", `corpo: ${corpo}`);
    } finally {
      f.restore();
    }
  }
});

Deno.test("XML — validador: aceita declaração, comentário, CDATA, autofechada; recusa duas raízes", () => {
  assert(isWellFormedXml(XML_OK));
  assert(isWellFormedXml(`<?xml version="1.0"?><!-- c --><a><b/><c><![CDATA[<x>]]></c></a>`));
  assert(!isWellFormedXml("<a></a><b></b>"));
  assert(!isWellFormedXml("<a><b></a></b>"));
});

Deno.test("XML — referência ausente -> erro transitório (fila tenta de novo), nunca compõe URL", async () => {
  const f = stubFetch(() => new Response(XML_OK));
  try {
    const r = await baixarXmlFocus(null, BASE, 2_000);
    assertEquals(r.kind, "erro_transitorio");
    assertEquals(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

Deno.test("XML — fluxo completo: download -> SHA-256 -> Storage privado -> leitura de confirmação -> XML_ARMAZENADO", async () => {
  const f = stubFetch(() => new Response(XML_OK, { status: 200 }));
  const s = fakeStorage();
  const c = xmlCounters();
  try {
    await processXmlDocumento(s.client, xmlDoc(), new FocusProvider(), "doc-xml", CFG, c);
  } finally {
    f.restore();
  }
  const path = "focus/homologacao/loja-1/NFC_E_STUB/doc-xml.xml";
  assertEquals(f.calls[0].url, "https://api.focusnfe.com.br/arquivos/doc-xml.xml");
  assertEquals(s.uploads, [{ bucket: FISCAL_XML_BUCKET, path, options: { contentType: "application/xml", upsert: false } }]);
  assertEquals(s.downloads, [path]);
  const rpc = s.rpcCalls.find((r) => r.fn === "fiscal_marcar_xml_armazenado");
  assertExists(rpc);
  assertEquals(rpc!.args.p_sha256, await sha256Hex(XML_OK));
  assertEquals(rpc!.args.p_storage_path, path);
  assertEquals(rpc!.args.p_lease_token, "lease-1");
  assertEquals(c.armazenados, ["doc-xml"]);
});

Deno.test("XML — idempotente: 2ª execução sobre o mesmo blob reconcilia pelo hash, sem sobrescrever", async () => {
  const s = fakeStorage();
  for (let i = 0; i < 2; i++) {
    const f = stubFetch(() => new Response(XML_OK, { status: 200 }));
    try {
      await processXmlDocumento(s.client, xmlDoc(), new FocusProvider(), "doc-xml", CFG, xmlCounters());
    } finally {
      f.restore();
    }
  }
  assertEquals(s.disco.size, 1);
  const confirmacoes = s.rpcCalls.filter((r) => r.fn === "fiscal_marcar_xml_armazenado");
  assertEquals(confirmacoes.length, 2);
  assertEquals(confirmacoes[0].args.p_sha256, confirmacoes[1].args.p_sha256);
});

Deno.test("XML — sem referência persistida: consulta a mesma ref, grava a referência original e então armazena", async () => {
  const f = stubFetch((call) => {
    if (call.url === `${BASE}/v2/nfce/doc-xml`) {
      return jsonRes(200, { status: "autorizado", chave_nfe: CHAVE, protocolo: "1", caminho_xml_nota_fiscal: "/arquivos/rec.xml" });
    }
    return new Response(XML_OK, { status: 200 });
  });
  const s = fakeStorage();
  try {
    await processXmlDocumento(s.client, xmlDoc({ focus_xml_path: null }), new FocusProvider(), "doc-xml", CFG, xmlCounters());
  } finally {
    f.restore();
  }
  assertEquals(f.calls.map((c) => c.url), [`${BASE}/v2/nfce/doc-xml`, `${BASE}/arquivos/rec.xml`]);
  assertEquals(f.calls[1].headers["authorization"], undefined);
  assertEquals(s.rpcCalls.map((r) => r.fn), ["fiscal_registrar_referencias_focus", "fiscal_marcar_xml_armazenado"]);
  assertEquals(s.rpcCalls[0].args.p_focus_xml_path, "/arquivos/rec.xml");
});

Deno.test("XML — erro de download não chega ao Storage e marca erro com backoff (fiscal_marcar_xml_erro)", async () => {
  const f = stubFetch(() => new Response("indisponível", { status: 502 }));
  const s = fakeStorage();
  try {
    await processXmlDocumento(s.client, xmlDoc(), new FocusProvider(), "doc-xml", CFG, xmlCounters());
  } finally {
    f.restore();
  }
  assertEquals(s.uploads.length, 0);
  assertEquals(s.rpcCalls.map((r) => r.fn), ["fiscal_marcar_xml_erro"]);
});

// ---------------------------------------------------------------------------
// Cancelamento
// ---------------------------------------------------------------------------

const CANC_DOC = { id: "doc-c", venda_id: "venda-c", tipo_doc: "NFC_E_STUB", lease_token: "lease-c", tentativas_anteriores: 0 };
const JUST = "Cliente desistiu da compra no caixa";

Deno.test("CANCELAMENTO — DELETE pela mesma referência com justificativa; cancelado -> fiscal_marcar_cancelado com lease", async () => {
  const f = stubFetch(() =>
    jsonRes(200, { status: "cancelado", numero_protocolo: "135000000000099", caminho_xml_cancelamento: "/arquivos/canc.xml" })
  );
  const supa = fakeRpc();
  try {
    const r = await processarCancelamento(supa, CANC_DOC, new FocusProvider(), "doc-c", JUST, CFG);
    assertEquals(r.resultado, "cancelado");
  } finally {
    f.restore();
  }
  assertEquals(f.calls.length, 1);
  assertEquals(f.calls[0].method, "DELETE");
  assertEquals(f.calls[0].url, `${BASE}/v2/nfce/doc-c`);
  assertEquals(JSON.parse(f.calls[0].body!), { justificativa: JUST });
  assertEquals(supa.rpcCalls.map((r: { fn: string }) => r.fn), ["fiscal_marcar_cancelado"]);
  assertEquals(supa.rpcCalls[0].args, {
    p_documento_id: "doc-c",
    p_protocolo_cancelamento: "135000000000099",
    p_focus_xml_cancelamento_path: "/arquivos/canc.xml",
    p_lease_token: "lease-c",
  });
});

Deno.test("CANCELAMENTO — resposta não confirmada (erro HTTP) mantém EMITIDO e registra erro", async () => {
  const f = stubFetch(() => jsonRes(422, { codigo: "nao_permitido", mensagem: "Prazo de cancelamento expirado" }));
  const supa = fakeRpc();
  try {
    const r = await processarCancelamento(supa, CANC_DOC, new FocusProvider(), "doc-c", JUST, CFG);
    assertEquals(r.resultado, "erro");
  } finally {
    f.restore();
  }
  assertEquals(supa.rpcCalls.map((r: { fn: string }) => r.fn), ["fiscal_marcar_cancelamento_erro"]);
});

Deno.test("CANCELAMENTO — 2xx sem status=cancelado nunca é presumido cancelado", async () => {
  const f = stubFetch(() => jsonRes(200, { status: "autorizado", chave_nfe: CHAVE, protocolo: "1" }));
  const supa = fakeRpc();
  try {
    const r = await processarCancelamento(supa, CANC_DOC, new FocusProvider(), "doc-c", JUST, CFG);
    assertEquals(r.resultado, "erro");
  } finally {
    f.restore();
  }
  assertEquals(supa.rpcCalls.some((r: { fn: string }) => r.fn === "fiscal_marcar_cancelado"), false);
});

Deno.test("CANCELAMENTO — tentativa anterior: consulta primeiro; já cancelado -> confirma SEM novo DELETE", async () => {
  const f = stubFetch(() => jsonRes(200, { status: "cancelado", numero_protocolo: "9", caminho_xml_cancelamento: "/c.xml" }));
  const supa = fakeRpc();
  try {
    const r = await processarCancelamento(supa, { ...CANC_DOC, tentativas_anteriores: 1 }, new FocusProvider(), "doc-c", JUST, CFG);
    assertEquals(r.resultado, "cancelado");
  } finally {
    f.restore();
  }
  assertEquals(f.calls.map((c) => c.method), ["GET"]);
});

Deno.test("CANCELAMENTO — tentativa anterior: consulta autorizado -> repete DELETE pela mesma referência", async () => {
  const f = stubFetch((call) =>
    call.method === "GET"
      ? jsonRes(200, { status: "autorizado", chave_nfe: CHAVE, protocolo: "1" })
      : jsonRes(200, { status: "cancelado", numero_protocolo: "9", caminho_xml_cancelamento: "/c.xml" })
  );
  const supa = fakeRpc();
  try {
    await processarCancelamento(supa, { ...CANC_DOC, tentativas_anteriores: 2 }, new FocusProvider(), "doc-c", JUST, CFG);
  } finally {
    f.restore();
  }
  assertEquals(f.calls.map((c) => `${c.method} ${c.url}`), [`GET ${BASE}/v2/nfce/doc-c`, `DELETE ${BASE}/v2/nfce/doc-c`]);
});

Deno.test("CANCELAMENTO — justificativa fora de 15–255 caracteres: zero chamada HTTP", async () => {
  const f = stubFetch(() => jsonRes(200, {}));
  try {
    const estado = await new FocusProvider().cancelarDocumento("doc-c", "NFC_E_STUB", "curta", CFG);
    assertEquals(estado.kind, "erro_definitivo");
    assertEquals(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

Deno.test("CANCELAMENTO — timeout -> erro registrado (próxima tentativa consulta antes)", async () => {
  const f = stubFetch(() => Promise.reject(new DOMException("aborted", "AbortError")));
  const supa = fakeRpc();
  try {
    const r = await processarCancelamento(supa, CANC_DOC, new FocusProvider(), "doc-c", JUST, CFG);
    assertEquals(r.erro, "FOCUS_PROVIDER_TIMEOUT");
  } finally {
    f.restore();
  }
  assertEquals(supa.rpcCalls.map((r: { fn: string }) => r.fn), ["fiscal_marcar_cancelamento_erro"]);
});

Deno.test("XML CANCELAMENTO — armazenado em path próprio (-cancelamento.xml) e RPCs próprias; XML da autorização intocado", async () => {
  const f = stubFetch(() => new Response(XML_CANC, { status: 200 }));
  const s = fakeStorage();
  const pathAutorizacao = "focus/homologacao/loja-1/NFC_E_STUB/doc-xml.xml";
  s.disco.set(pathAutorizacao, XML_OK);
  try {
    await processXmlDocumento(
      s.client,
      xmlDoc({ focus_xml_path: "https://api.focusnfe.com.br/arquivos/canc.xml" }),
      new FocusProvider(),
      "doc-xml",
      CFG,
      xmlCounters(),
      "CANCELAMENTO",
    );
  } finally {
    f.restore();
  }
  assertEquals(s.uploads.map((u) => u.path), ["focus/homologacao/loja-1/NFC_E_STUB/doc-xml-cancelamento.xml"]);
  assertEquals(s.disco.get(pathAutorizacao), XML_OK);
  assertEquals(s.rpcCalls.map((r) => r.fn), ["fiscal_marcar_xml_cancelamento_armazenado"]);
  assertEquals(s.rpcCalls[0].args.p_sha256, await sha256Hex(XML_CANC));
});

Deno.test("XML CANCELAMENTO — erro de download -> fiscal_marcar_xml_cancelamento_erro, nada no Storage", async () => {
  const f = stubFetch(() => new Response("x", { status: 500 }));
  const s = fakeStorage();
  try {
    await processXmlDocumento(s.client, xmlDoc({ focus_xml_path: "/arquivos/canc.xml" }), new FocusProvider(), "doc-xml", CFG, xmlCounters(), "CANCELAMENTO");
  } finally {
    f.restore();
  }
  assertEquals(s.uploads.length, 0);
  assertEquals(s.rpcCalls.map((r) => r.fn), ["fiscal_marcar_xml_cancelamento_erro"]);
});

// ---------------------------------------------------------------------------
// Segurança
// ---------------------------------------------------------------------------

Deno.test("SEGURANÇA — token Focus não aparece em logs nem nos estados devolvidos (falhas de rede/HTTP)", async () => {
  const logs: string[] = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...a: unknown[]) => logs.push(a.map(String).join(" "));
  console.error = console.log;
  console.warn = console.log;
  const f = stubFetch((call) =>
    call.method === "GET" && call.url.endsWith(".xml") ? new Response("x", { status: 500 }) : Promise.reject(new Error("conexão recusada"))
  );
  const resultados: unknown[] = [];
  try {
    const p = new FocusProvider();
    resultados.push(await p.consultarDocumento("doc", "NFC_E_STUB", CFG));
    resultados.push(await p.cancelarDocumento("doc", "NFC_E_STUB", JUST, CFG));
    resultados.push(await p.obterXmlAutorizado("doc", "NFC_E_STUB", CFG, "/arquivos/a.xml"));
    resultados.push(await postFocusEmit(`${BASE}/v2/nfce?ref=doc`, TOKEN, {}, 1_000));
  } finally {
    f.restore();
    Object.assign(console, orig);
  }
  assertEquals(logs.join("\n").includes(TOKEN), false);
  assertEquals(JSON.stringify(resultados).includes(TOKEN), false);
  assertEquals(JSON.stringify(resultados).includes(btoa(`${TOKEN}:`)), false);
});
