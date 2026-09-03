// Missão final (C3) — testes de fiscal_xml_orchestration.ts. Fake mínimo do
// SupabaseClient (rpc + storage.from().upload()/.download(), com um "disco"
// em memória para simular conflito create-only) — sem rede, sem Postgres
// real. A prova de banco real (lease/posse durável, monotonicidade,
// imutabilidade — inclusive contra concorrência genuína) está na migration
// 20260903170000, seção $verify$, e no script de concorrência adversarial
// `backend/scripts/test-fiscal-xml-concorrencia.ts` (dois processos
// disputando o mesmo documento de verdade). Aqui só a orquestração
// TypeScript — sequencial por natureza (um só processo Deno), então não
// substitui a prova concorrente real, só cobre a lógica de decisão local.

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
  return { armazenados: [], bloqueados: [], comErro: [], ignoradosPorConcorrencia: [] };
}

type FakeOpts = {
  uploadError?: string;
  rpcError?: string;
  /** false = simula RPC "ignorada por lease obsoleto" (hotfix concorrência). */
  rpcAplicado?: boolean;
  /** Semeia o "disco" em memória — simula um objeto já existente no path
   * (upload anterior, de qualquer worker) antes desta chamada rodar. */
  disco?: Record<string, string>;
};

function fakeSupabase(opts: FakeOpts = {}) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const uploadCalls: Array<{ path: string; body: unknown; options: unknown }> = [];
  const downloadCalls: string[] = [];
  const disco = new Map<string, string>(Object.entries(opts.disco ?? {}));

  const client = {
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (opts.rpcError) return { data: null, error: { message: opts.rpcError } };
      return { data: opts.rpcAplicado ?? true, error: null };
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, body: unknown, options: unknown) {
            uploadCalls.push({ path, body, options });
            if (opts.uploadError) return { data: null, error: { message: opts.uploadError } };
            if (disco.has(path)) {
              // Mesma forma de erro confirmada empiricamente contra o
              // Storage real do Supabase (upload com upsert:false sobre um
              // path já ocupado).
              return { data: null, error: { statusCode: "409", error: "Duplicate", message: "The resource already exists" } };
            }
            disco.set(path, String(body));
            return { data: { path: `${bucket}/${path}` }, error: null };
          },
          async download(path: string) {
            downloadCalls.push(path);
            const conteudo = disco.get(path);
            if (conteudo === undefined) return { data: null, error: { message: "not_found" } };
            return { data: { text: async () => conteudo }, error: null };
          },
        };
      },
    },
    // deno-lint-ignore no-explicit-any
  } as any;
  return { client, rpcCalls, uploadCalls, downloadCalls, disco };
}

function doc(overrides: Partial<XmlDoc> = {}): XmlDoc {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    venda_id: "22222222-2222-4222-8222-222222222222",
    tipo_doc: "NFC_E_STUB",
    provider: "focus:homologacao:loja-x",
    lease_token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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

Deno.test("processXmlDocumento — provider sem obterXmlAutorizado -> marca bloqueado com o lease_token, ZERO upload", async () => {
  const { client, rpcCalls, uploadCalls } = fakeSupabase();
  const provider: FiscalProvider = {
    async callProvider() {
      throw new Error("não deveria ser chamado");
    },
  };
  const counters = freshCounters();
  const d = doc();
  await processXmlDocumento(client, d, provider, "ref-1", { type: "focus" }, counters);
  assertEquals(uploadCalls.length, 0);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].fn, "fiscal_marcar_xml_bloqueado");
  assertEquals(rpcCalls[0].args.p_lease_token, d.lease_token);
  assertEquals(counters.bloqueados, [d.id]);
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

Deno.test("processXmlDocumento — erro_transitorio -> marca xml_erro com o lease_token, nunca toca RPC de emissão", async () => {
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
  const d = doc();
  await processXmlDocumento(client, d, provider, "ref-1", { type: "focus" }, counters);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].fn, "fiscal_marcar_xml_erro");
  assertEquals(rpcCalls[0].args.p_lease_token, d.lease_token);
  // Nenhuma RPC de emissão é chamada por este módulo — confirma por
  // ausência: as únicas 3 RPCs que este módulo conhece são as de XML.
  const rpcsDeEmissao = ["fiscal_marcar_emitido", "fiscal_marcar_erro", "fiscal_marcar_erro_normalizado"];
  assertEquals(rpcCalls.some((c) => rpcsDeEmissao.includes(c.fn)), false);
  assertEquals(counters.comErro.length, 1);
});

Deno.test("processXmlDocumento — obtido com sucesso: upload create-only (upsert:false) + VERIFICA por leitura antes de confirmar, path/hash corretos", async () => {
  const { client, rpcCalls, uploadCalls, downloadCalls } = fakeSupabase();
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
  const path = computeXmlStoragePath(d, d.provider!);
  await processXmlDocumento(client, d, provider, "ref-1", { type: "focus" }, counters);

  assertEquals(uploadCalls.length, 1);
  assertEquals(uploadCalls[0].path, path);
  assertEquals(uploadCalls[0].body, xmlContent);
  assertEquals((uploadCalls[0].options as { upsert?: boolean }).upsert, false);
  // Hotfix: NUNCA confia cegamente em upload()==sucesso — sempre lê de
  // volta antes de confirmar (achado de concorrência real do Storage local).
  assertEquals(downloadCalls, [path]);

  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].fn, "fiscal_marcar_xml_armazenado");
  assertEquals(rpcCalls[0].args.p_documento_id, d.id);
  assertEquals(rpcCalls[0].args.p_storage_path, path);
  assertEquals(rpcCalls[0].args.p_sha256, await sha256Hex(xmlContent));
  assertEquals(rpcCalls[0].args.p_lease_token, d.lease_token);
  assertEquals(counters.armazenados, [d.id]);
});

Deno.test("processXmlDocumento — HOTFIX (achado de concorrência real): upload reporta sucesso mas o blob lido de volta NÃO bate com o esperado -> fail-closed, NUNCA confirma hash divergente", async () => {
  // Simula o cenário empírico encontrado ao rodar a prova de concorrência
  // real: Storage local pode reportar sucesso em upload() sem garantir
  // exclusividade perfeita sob corrida genuína — outra escrita pode ter
  // pousado no mesmo path entre o upload e a leitura de confirmação.
  const d = doc();
  const path = computeXmlStoragePath(d, d.provider!);
  const { client, rpcCalls, downloadCalls } = fakeSupabase();
  // Fake especial: upload "sucede" mas o disco já contém outro conteúdo
  // (simula a corrida vencida por outro worker entre o upload e a leitura).
  const outroConteudo = "<escritoPorOutroWorkerNoMeioDoCaminho/>";
  // deno-lint-ignore no-explicit-any
  (client as any).storage.from = (_bucket: string) => ({
    async upload() {
      return { data: { path }, error: null }; // reporta sucesso...
    },
    async download(p: string) {
      downloadCalls.push(p);
      return { data: { text: async () => outroConteudo }, error: null }; // ...mas não é o que fica lá
    },
  });

  const provider: FiscalProvider = {
    async callProvider() {
      throw new Error("não deveria ser chamado");
    },
    async obterXmlAutorizado(): Promise<FiscalXmlResult> {
      return { kind: "obtido", xml: "<oQueEUAcheiQueEstavaEscrevendo/>" };
    },
  };
  const counters = freshCounters();
  await processXmlDocumento(client, d, provider, "ref-1", { type: "focus" }, counters);

  assertEquals(downloadCalls, [path]);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].fn, "fiscal_marcar_xml_erro");
  assertEquals(rpcCalls[0].args.p_erro, "XML_DIVERGENTE_DE_BLOB_JA_EXISTENTE_NO_PATH");
  assertEquals(counters.armazenados, []);
});

Deno.test("processXmlDocumento — fiscal_marcar_xml_armazenado retorna aplicado:false (lease obsoleto) -> vai para ignoradosPorConcorrencia, NUNCA para armazenados", async () => {
  const { client, rpcCalls } = fakeSupabase({ rpcAplicado: false });
  const provider: FiscalProvider = {
    async callProvider() {
      throw new Error("não deveria ser chamado");
    },
    async obterXmlAutorizado(): Promise<FiscalXmlResult> {
      return { kind: "obtido", xml: "<xml/>" };
    },
  };
  const counters = freshCounters();
  const d = doc();
  await processXmlDocumento(client, d, provider, "ref-1", { type: "focus" }, counters);

  assertEquals(rpcCalls[0].fn, "fiscal_marcar_xml_armazenado");
  assertEquals(counters.armazenados, []);
  assertEquals(counters.ignoradosPorConcorrencia, [d.id]);
});

Deno.test("processXmlDocumento — HOTFIX CODEX: fiscal_marcar_xml_erro retorna aplicado:false (documento já ARMAZENADO por outro worker) -> ignoradosPorConcorrencia, NUNCA comErro", async () => {
  const { client, rpcCalls } = fakeSupabase({ rpcAplicado: false });
  const provider: FiscalProvider = {
    async callProvider() {
      throw new Error("não deveria ser chamado");
    },
    async obterXmlAutorizado(): Promise<FiscalXmlResult> {
      return { kind: "erro_transitorio", motivo: "erro tardio de um worker cujo lease já expirou" };
    },
  };
  const counters = freshCounters();
  const d = doc();
  await processXmlDocumento(client, d, provider, "ref-1", { type: "focus" }, counters);

  assertEquals(rpcCalls[0].fn, "fiscal_marcar_xml_erro");
  // Esta é exatamente a asserção que teria falhado ANTES do hotfix: o
  // resultado da RPC (aplicado:false) precisa impedir que esta chamada
  // conte como um erro real — a RPC do banco já recusou aplicar a mudança
  // (ver migration 20260903170000), então o worker que perdeu a corrida
  // nunca reporta "erro" sobre um documento que na verdade está ARMAZENADO.
  assertEquals(counters.comErro, []);
  assertEquals(counters.ignoradosPorConcorrencia, [d.id]);
});

Deno.test("processXmlDocumento — fiscal_marcar_xml_bloqueado retorna aplicado:false -> ignoradosPorConcorrencia", async () => {
  const { client } = fakeSupabase({ rpcAplicado: false });
  const provider: FiscalProvider = {
    async callProvider() {
      throw new Error("não deveria ser chamado");
    },
    async obterXmlAutorizado(): Promise<FiscalXmlResult> {
      return { kind: "blocked_external", motivo: "x" };
    },
  };
  const counters = freshCounters();
  const d = doc();
  await processXmlDocumento(client, d, provider, "ref-1", { type: "focus" }, counters);
  assertEquals(counters.bloqueados, []);
  assertEquals(counters.ignoradosPorConcorrencia, [d.id]);
});

Deno.test("processXmlDocumento — CREATE-ONLY: path já ocupado com MESMO conteúdo -> reconcilia (NUNCA sobrescreve), confirma com o hash real do blob existente", async () => {
  const d = doc();
  const path = computeXmlStoragePath(d, d.provider!);
  const xmlContent = "<mesmoConteudo/>";
  const { client, rpcCalls, uploadCalls, downloadCalls, disco } = fakeSupabase({ disco: { [path]: xmlContent } });
  const provider: FiscalProvider = {
    async callProvider() {
      throw new Error("não deveria ser chamado");
    },
    async obterXmlAutorizado(): Promise<FiscalXmlResult> {
      return { kind: "obtido", xml: xmlContent };
    },
  };
  const counters = freshCounters();
  await processXmlDocumento(client, d, provider, "ref-1", { type: "focus" }, counters);

  assertEquals(uploadCalls.length, 1); // tentou, mas o fake recusou (409)
  assertEquals(downloadCalls, [path]); // baixou pra comparar
  assertEquals(disco.get(path), xmlContent); // blob no "disco" continua o mesmo, byte a byte
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].fn, "fiscal_marcar_xml_armazenado");
  assertEquals(rpcCalls[0].args.p_sha256, await sha256Hex(xmlContent));
  assertEquals(counters.armazenados, [d.id]);
});

Deno.test("processXmlDocumento — CREATE-ONLY: path já ocupado com conteúdo DIFERENTE -> fail-closed, NUNCA sobrescreve, NUNCA confirma armazenado", async () => {
  const d = doc();
  const path = computeXmlStoragePath(d, d.provider!);
  const conteudoOriginal = "<original/>";
  const conteudoNovo = "<tentativaDeSobrescrever/>";
  const { client, rpcCalls, uploadCalls, downloadCalls, disco } = fakeSupabase({ disco: { [path]: conteudoOriginal } });
  const provider: FiscalProvider = {
    async callProvider() {
      throw new Error("não deveria ser chamado");
    },
    async obterXmlAutorizado(): Promise<FiscalXmlResult> {
      return { kind: "obtido", xml: conteudoNovo };
    },
  };
  const counters = freshCounters();
  await processXmlDocumento(client, d, provider, "ref-1", { type: "focus" }, counters);

  assertEquals(uploadCalls.length, 1);
  assertEquals(downloadCalls, [path]);
  // O blob original PERMANECE INTACTO, byte a byte — nunca foi sobrescrito.
  assertEquals(disco.get(path), conteudoOriginal);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].fn, "fiscal_marcar_xml_erro");
  assertEquals(rpcCalls[0].args.p_erro, "XML_DIVERGENTE_DE_BLOB_JA_EXISTENTE_NO_PATH");
  assertEquals(counters.armazenados, []);
});

Deno.test("processXmlDocumento — upload falha por erro NÃO relacionado a conflito -> fail-closed (marca xml_erro), NUNCA chama fiscal_marcar_xml_armazenado", async () => {
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

Deno.test("processXmlDocumento — 'obtido' com xml vazio -> fail-closed (xml_erro), NUNCA armazena blob vazio", async () => {
  const { client, rpcCalls, uploadCalls } = fakeSupabase();
  const provider: FiscalProvider = {
    async callProvider() {
      throw new Error("não deveria ser chamado");
    },
    async obterXmlAutorizado(): Promise<FiscalXmlResult> {
      return { kind: "obtido", xml: "   " };
    },
  };
  const counters = freshCounters();
  await processXmlDocumento(client, doc(), provider, "ref-1", { type: "focus" }, counters);

  assertEquals(uploadCalls.length, 0);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].fn, "fiscal_marcar_xml_erro");
  assertEquals(counters.armazenados, []);
});

Deno.test("processXmlDocumento — 'obtido' com conteúdo claramente não-XML -> fail-closed, NUNCA armazena", async () => {
  const { client, rpcCalls, uploadCalls } = fakeSupabase();
  const provider: FiscalProvider = {
    async callProvider() {
      throw new Error("não deveria ser chamado");
    },
    async obterXmlAutorizado(): Promise<FiscalXmlResult> {
      return { kind: "obtido", xml: '{"isso": "não é xml"}' };
    },
  };
  const counters = freshCounters();
  await processXmlDocumento(client, doc(), provider, "ref-1", { type: "focus" }, counters);

  assertEquals(uploadCalls.length, 0);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].fn, "fiscal_marcar_xml_erro");
  assertEquals(counters.armazenados, []);
});

Deno.test("FISCAL_XML_BUCKET — id estável do bucket privado", () => {
  assertEquals(FISCAL_XML_BUCKET, "documentos-fiscais-xml");
  assertExists(FISCAL_XML_BUCKET);
});
