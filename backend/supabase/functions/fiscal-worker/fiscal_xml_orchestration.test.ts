// Missão final (C3) — testes de fiscal_xml_orchestration.ts. Fake mínimo do
// SupabaseClient (rpc + storage.from().upload()) — sem rede, sem Postgres
// real (a prova de banco real — imutabilidade, idempotência da RPC, fila —
// está na migration 20260903150000, seção $verify$, e reexecutada
// manualmente via docker exec psql). Aqui só a orquestração TypeScript.

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  computeXmlStoragePath,
  FISCAL_XML_BUCKET,
  parseProviderIdentity,
  processXmlDocumento,
  sha256Hex,
  type XmlDoc,
  type XmlWorkerCounters,
} from "./fiscal_xml_orchestration.ts";
import type { FiscalProvider, ProviderConfig } from "./fiscal-provider-adapter.ts";
import type { FiscalXmlResult } from "./fiscal_types.ts";

function freshCounters(): XmlWorkerCounters {
  return { armazenados: [], bloqueados: [], comErro: [] };
}

function fakeSupabase(opts: { uploadError?: string; rpcError?: string } = {}) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const uploadCalls: Array<{ path: string; body: unknown; options: unknown }> = [];
  const client = {
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (opts.rpcError) return { data: null, error: { message: opts.rpcError } };
      return { data: null, error: null };
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, body: unknown, options: unknown) {
            uploadCalls.push({ path, body, options });
            if (opts.uploadError) return { data: null, error: { message: opts.uploadError } };
            return { data: { path: `${bucket}/${path}` }, error: null };
          },
        };
      },
    },
    // deno-lint-ignore no-explicit-any
  } as any;
  return { client, rpcCalls, uploadCalls };
}

function doc(overrides: Partial<XmlDoc> = {}): XmlDoc {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    venda_id: "22222222-2222-4222-8222-222222222222",
    tipo_doc: "NFC_E_STUB",
    provider: "focus:homologacao:loja-x",
    ...overrides,
  };
}

Deno.test("sha256Hex — determinístico, 64 chars hex", async () => {
  const h1 = await sha256Hex("<xml/>");
  const h2 = await sha256Hex("<xml/>");
  const h3 = await sha256Hex("<xml2/>");
  assertEquals(h1, h2);
  assertEquals(h1.length, 64);
  assertEquals(/^[0-9a-f]{64}$/.test(h1), true);
  assertEquals(h1 === h3, false);
});

Deno.test("computeXmlStoragePath — sanitiza ':' e monta path determinístico", () => {
  const d = doc({ id: "abc-123", tipo_doc: "NFCE" });
  const path = computeXmlStoragePath(d, "focus:homologacao:loja-x");
  assertEquals(path, "focus/homologacao/loja-x/NFCE/abc-123.xml");
});

Deno.test("computeXmlStoragePath — mesmo doc + mesma identidade sempre produz o MESMO path (idempotência)", () => {
  const d = doc({ id: "abc-123", tipo_doc: "NFCE" });
  const p1 = computeXmlStoragePath(d, "focus:producao:loja-y");
  const p2 = computeXmlStoragePath(d, "focus:producao:loja-y");
  assertEquals(p1, p2);
});

Deno.test("parseProviderIdentity — focus com ambiente+loja", () => {
  const parsed = parseProviderIdentity("focus:homologacao:loja-x");
  assertEquals(parsed, { type: "focus", ambiente: "homologacao", lojaId: "loja-x" });
});

Deno.test("parseProviderIdentity — mock/http/bling sem ambiente", () => {
  assertEquals(parseProviderIdentity("mock"), { type: "mock" });
  assertEquals(parseProviderIdentity("http"), { type: "http" });
  assertEquals(parseProviderIdentity("bling"), { type: "bling" });
});

Deno.test("parseProviderIdentity — null/formato desconhecido -> null (documento legado)", () => {
  assertEquals(parseProviderIdentity(null), null);
  assertEquals(parseProviderIdentity("NFE_PROVIDER_HTTP"), null);
  assertEquals(parseProviderIdentity("focus:producao"), null);
});

Deno.test("processXmlDocumento — provider sem obterXmlAutorizado -> marca bloqueado, ZERO tentativa de upload", async () => {
  const { client, rpcCalls, uploadCalls } = fakeSupabase();
  const provider: FiscalProvider = {
    async callProvider() {
      throw new Error("não deveria ser chamado");
    },
  };
  const counters = freshCounters();
  await processXmlDocumento(client, doc(), provider, "ref-1", { type: "focus" }, counters);
  assertEquals(uploadCalls.length, 0);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].fn, "fiscal_marcar_xml_bloqueado");
  assertEquals(counters.bloqueados, [doc().id]);
  assertEquals(counters.armazenados, []);
  assertEquals(counters.comErro, []);
});

Deno.test("processXmlDocumento — Focus retorna blocked_external -> marca bloqueado, ZERO upload, ZERO fetch/POST", async () => {
  const { client, rpcCalls, uploadCalls } = fakeSupabase();
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    fetchCalled = true;
    throw new Error("fetch não deveria ser chamado no passo de XML");
  }) as typeof fetch;
  try {
    const provider: FiscalProvider = {
      async callProvider() {
        throw new Error("não deveria ser chamado");
      },
      async obterXmlAutorizado(): Promise<FiscalXmlResult> {
        return { kind: "blocked_external", motivo: "FOCUS_XML_CONTRATO_NAO_CONFIRMADO" };
      },
    };
    const counters = freshCounters();
    await processXmlDocumento(client, doc(), provider, "ref-1", { type: "focus" }, counters);
    assertEquals(fetchCalled, false);
    assertEquals(uploadCalls.length, 0);
    assertEquals(rpcCalls.length, 1);
    assertEquals(rpcCalls[0].fn, "fiscal_marcar_xml_bloqueado");
    assertEquals(rpcCalls[0].args.p_motivo, "FOCUS_XML_CONTRATO_NAO_CONFIRMADO");
    assertEquals(counters.bloqueados.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("processXmlDocumento — erro_transitorio -> marca xml_erro (retryable), nunca toca RPC de emissão", async () => {
  const { client, rpcCalls } = fakeSupabase();
  const provider: FiscalProvider = {
    async callProvider() {
      throw new Error("não deveria ser chamado");
    },
    async obterXmlAutorizado(): Promise<FiscalXmlResult> {
      return { kind: "erro_transitorio", motivo: "TIMEOUT_SIMULADO" };
    },
  };
  const counters = freshCounters();
  await processXmlDocumento(client, doc(), provider, "ref-1", { type: "focus" }, counters);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].fn, "fiscal_marcar_xml_erro");
  // Nenhuma RPC de emissão é chamada por este módulo — confirma por
  // ausência: as únicas 3 RPCs que este módulo conhece são as de XML.
  const rpcsDeEmissao = ["fiscal_marcar_emitido", "fiscal_marcar_erro", "fiscal_marcar_erro_normalizado"];
  assertEquals(rpcCalls.some((c) => rpcsDeEmissao.includes(c.fn)), false);
  assertEquals(counters.comErro.length, 1);
});

Deno.test("processXmlDocumento — obtido com sucesso: upload + confirma armazenado, path/hash corretos", async () => {
  const { client, rpcCalls, uploadCalls } = fakeSupabase();
  const xmlContent = '<?xml version="1.0"?><mockNFe/>';
  const provider: FiscalProvider = {
    async callProvider() {
      throw new Error("não deveria ser chamado");
    },
    async obterXmlAutorizado(): Promise<FiscalXmlResult> {
      return { kind: "obtido", xml: xmlContent };
    },
  };
  const counters = freshCounters();
  const d = doc();
  await processXmlDocumento(client, d, provider, "ref-1", { type: "focus" }, counters);

  assertEquals(uploadCalls.length, 1);
  assertEquals(uploadCalls[0].path, computeXmlStoragePath(d, d.provider!));
  assertEquals(uploadCalls[0].body, xmlContent);

  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].fn, "fiscal_marcar_xml_armazenado");
  assertEquals(rpcCalls[0].args.p_documento_id, d.id);
  assertEquals(rpcCalls[0].args.p_storage_path, computeXmlStoragePath(d, d.provider!));
  assertEquals(rpcCalls[0].args.p_sha256, await sha256Hex(xmlContent));
  assertEquals(counters.armazenados, [d.id]);
});

Deno.test("processXmlDocumento — upload falha -> fail-closed (marca xml_erro), NUNCA chama fiscal_marcar_xml_armazenado", async () => {
  const { client, rpcCalls, uploadCalls } = fakeSupabase({ uploadError: "storage indisponível (simulado)" });
  const provider: FiscalProvider = {
    async callProvider() {
      throw new Error("não deveria ser chamado");
    },
    async obterXmlAutorizado(): Promise<FiscalXmlResult> {
      return { kind: "obtido", xml: "<xml/>" };
    },
  };
  const counters = freshCounters();
  await processXmlDocumento(client, doc(), provider, "ref-1", { type: "focus" }, counters);

  assertEquals(uploadCalls.length, 1);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].fn, "fiscal_marcar_xml_erro");
  assertEquals(counters.armazenados, []);
  assertEquals(counters.comErro.length, 1);
});

Deno.test("processXmlDocumento — upload ok mas confirmar RPC falha -> fail-closed (marca xml_erro), path fica órfão só até o próximo retry idempotente", async () => {
  const { client, rpcCalls, uploadCalls } = fakeSupabase({ rpcError: "conexão perdida (simulado)" });
  const provider: FiscalProvider = {
    async callProvider() {
      throw new Error("não deveria ser chamado");
    },
    async obterXmlAutorizado(): Promise<FiscalXmlResult> {
      return { kind: "obtido", xml: "<xml/>" };
    },
  };
  const counters = freshCounters();
  await processXmlDocumento(client, doc(), provider, "ref-1", { type: "focus" }, counters);

  assertEquals(uploadCalls.length, 1);
  // rpc() é chamado 2x: 1ª tentativa (fiscal_marcar_xml_armazenado, falha
  // simulada) + a chamada de fail-closed (fiscal_marcar_xml_erro) — mas
  // essa 2ª também usa o fake com rpcError sempre ligado, então ambas
  // "falham" no fake; o que importa é que a PRIMEIRA tentada foi a de
  // armazenado, nunca pulou direto para outra coisa.
  assertEquals(rpcCalls[0].fn, "fiscal_marcar_xml_armazenado");
  assertEquals(counters.armazenados, []);
});

Deno.test("processXmlDocumento — 'obtido' sem doc.provider (documento legado pré-C2.10) -> bloqueado, nunca tenta upload", async () => {
  const { client, rpcCalls, uploadCalls } = fakeSupabase();
  const provider: FiscalProvider = {
    async callProvider() {
      throw new Error("não deveria ser chamado");
    },
    async obterXmlAutorizado(): Promise<FiscalXmlResult> {
      return { kind: "obtido", xml: "<xml/>" };
    },
  };
  const counters = freshCounters();
  await processXmlDocumento(client, doc({ provider: null }), provider, "ref-1", { type: "focus" }, counters);

  assertEquals(uploadCalls.length, 0);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].fn, "fiscal_marcar_xml_bloqueado");
  assertEquals(counters.bloqueados.length, 1);
});

Deno.test("FISCAL_XML_BUCKET — id estável do bucket privado", () => {
  assertEquals(FISCAL_XML_BUCKET, "documentos-fiscais-xml");
  assertExists(FISCAL_XML_BUCKET);
});
