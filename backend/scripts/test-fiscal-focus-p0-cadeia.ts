// Sprint P0 Focus NFe — prova MANUAL da cadeia completa contra um Postgres
// local real (RPCs e triggers reais da migration 20261003120000), com a Focus
// simulada por um stub de `fetch` e o Storage por um disco em memória (o
// Storage real já foi provado em test-fiscal-xml-concorrencia.ts).
//
//   claim -> consulta/reconciliação -> emissão -> classificação -> XML ->
//   Storage -> auditoria ; cancelamento -> XML de cancelamento
//
// Nunca fala com a Focus real nem com nenhum banco remoto.
//
// Uso (banco local descartável, todas as migrations aplicadas):
//   PGURL=postgresql://postgres:postgres@localhost:54329/postgres \
//   deno run --allow-net --allow-env backend/scripts/test-fiscal-focus-p0-cadeia.ts

import postgres from "npm:postgres@3.4.4";
import type { FiscalDoc, FocusRemoteState } from "../supabase/functions/fiscal-worker/fiscal_types.ts";
import { FocusProvider, type ProviderConfig } from "../supabase/functions/fiscal-worker/fiscal-provider-adapter.ts";
import {
  applyFocusRemoteState,
  enforceRetrySafeGate,
  processarCancelamento,
  resolverEstadoEmissao,
  type WorkerCounters,
} from "../supabase/functions/fiscal-worker/fiscal_worker_orchestration.ts";
import { processXmlDocumento, sha256Hex, type XmlWorkerCounters } from "../supabase/functions/fiscal-worker/fiscal_xml_orchestration.ts";

const PGURL = Deno.env.get("PGURL") ?? "postgresql://postgres:postgres@localhost:54329/postgres";
if (!/localhost|127\.0\.0\.1/.test(PGURL)) {
  console.error("Recusado: este script só roda contra banco local.");
  Deno.exit(2);
}
const sql = postgres(PGURL, { max: 1, onnotice: () => {} });

const BASE = "https://homologacao.focusnfe.com.br";
const CFG: ProviderConfig = { type: "focus", url: BASE, token: "token-teste-local", timeout: 2_000 };
const CHAVE = "35261012345678000199650010000000011000000019";
const XML_AUT = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${CHAVE}"/></NFe><protNFe><infProt><nProt>135000000000001</nProt></infProt></protNFe></nfeProc>`;
const XML_CANC = `<?xml version="1.0"?><procEventoNFe><evento><infEvento><tpEvento>110111</tpEvento></infEvento></evento></procEventoNFe>`;

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label} ${detail === undefined ? "" : JSON.stringify(detail)}`);
  }
}

// Adaptador mínimo com a mesma forma do supabase-js usada pelo worker:
// rpc(nome, args nomeados) -> chama a função SQL real.
const supabase = {
  async rpc(fn: string, args: Record<string, unknown>) {
    const nomes = Object.keys(args);
    const lista = nomes.map((n, i) => `${n} => $${i + 1}`).join(", ");
    try {
      const rows = await sql.unsafe(`select * from public.${fn}(${lista})`, nomes.map((n) => args[n] as never));
      if (rows.length === 1 && Object.keys(rows[0]).length === 1 && fn in rows[0]) {
        return { data: rows[0][fn] === "" ? null : rows[0][fn], error: null };
      }
      return { data: rows, error: null };
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    }
  },
  storage: {
    from(_bucket: string) {
      return {
        async upload(path: string, body: unknown) {
          if (disco.has(path)) return { data: null, error: { statusCode: "409", message: "The resource already exists" } };
          disco.set(path, String(body));
          return { data: { path }, error: null };
        },
        async download(path: string) {
          const c = disco.get(path);
          return c === undefined ? { data: null, error: { message: "not_found" } } : { data: { text: async () => c }, error: null };
        },
      };
    },
  },
};
const disco = new Map<string, string>();

type Chamada = { method: string; url: string; auth: string | null };
const chamadas: Chamada[] = [];
let focusResponder: (c: Chamada) => Response = () => new Response("{}", { status: 500 });
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const c = { method: init?.method ?? "GET", url: String(input), auth: new Headers(init?.headers ?? {}).get("authorization") };
  chamadas.push(c);
  return focusResponder(c);
}) as typeof fetch;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

const LOJA = "f9200000-0000-4000-8000-000000000001";
const OPERADOR = "f9200001-0000-4000-8000-000000000001";
const IDENTIDADE = `focus:homologacao:${LOJA}`;

async function novoDocumento(n: number, payload: Record<string, unknown>): Promise<string> {
  const venda = `f9200002-0000-4000-8000-${String(n).padStart(12, "0")}`;
  await sql`insert into public.vendas (id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
            values (${venda}, ${OPERADOR}, 136, 0, 136, 'PIX', 'CONCLUIDA') on conflict (id) do nothing`;
  const [d] = await sql`insert into public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
                        values (${venda}, 'NFC_E_STUB', 'PENDENTE', ${sql.json(payload as never)}) returning id`;
  return d.id as string;
}

async function claim(id: string): Promise<FiscalDoc> {
  const { data, error } = await supabase.rpc("fiscal_claim_documentos", { p_limit: 100 });
  if (error) throw new Error(error.message);
  const raw = (data as Array<Record<string, unknown>>).find((r) => r.id === id);
  if (!raw) throw new Error(`documento ${id} não reclamado`);
  // Congela identidade como o laço de index.ts faz (1ª vez).
  await sql`update public.documentos_fiscais_pendentes set provider = ${IDENTIDADE} where id = ${id} and provider is null`;
  return {
    id,
    venda_id: String(raw.venda_id),
    tipo_doc: String(raw.tipo_doc),
    tentativas: Number(raw.tentativas ?? 0),
    ja_tentou_emissao_antes: raw.ja_tentou_emissao_antes === true,
    payload: raw.payload as Record<string, unknown>,
  };
}

async function estado(id: string) {
  const [r] = await sql`select * from public.documentos_fiscais_pendentes where id = ${id}`;
  return r;
}
async function eventos(id: string): Promise<string[]> {
  const rows = await sql`select evento_tipo from public.documentos_fiscais_eventos where documento_id = ${id} order by created_at, id`;
  return rows.map((r) => String(r.evento_tipo));
}

const payloadBase = {
  loja_id: LOJA,
  natureza_operacao: "Venda de mercadoria",
  emitente: { cnpj: "12345678000199" },
  totais: { liquido: 136 },
  itens: [{ produto_id: "p1", nome: "Item", quantidade: 2, preco_unitario_original: 68, unidade_medida: "UN", ncm: "85094000", cfop: "5102", csosn: "102", icms_origem: "0" }],
  pagamentos: [{ forma_pagamento: "PIX", valor: 136, pix_modalidade: "DINAMICO" }],
};

try {
  await sql`insert into public.lojas (id, nome, codigo, ativo) values (${LOJA}, 'P0 Cadeia', 'P0CADEIA', true) on conflict (id) do nothing`;
  await sql`insert into auth.users (id) values (${OPERADOR}) on conflict (id) do nothing`;
  await sql`insert into public.usuarios (id, nome, perfil, ativo, loja_id) values (${OPERADOR}, 'P0 Op', 'OPERADOR', true, ${LOJA}) on conflict (id) do nothing`;
  const sufixo = Date.now() % 1_000_000;

  console.log("\n[A] 1ª tentativa: DTO bloqueante (tributação não confirmada) -> zero POST, ERRO normalizado");
  {
    const id = await novoDocumento(sufixo * 10 + 1, payloadBase);
    const doc = await claim(id);
    chamadas.length = 0;
    const c: WorkerCounters = { emitted: [], failed: [], retried: [] };
    const gate = await enforceRetrySafeGate(supabase, doc, new FocusProvider(), id, CFG, c);
    ok("A gate libera 1ª tentativa sem consulta", gate.proceed && chamadas.length === 0);
    const e = await new FocusProvider().emitirDocumento(doc, CFG);
    await applyFocusRemoteState(supabase, doc, await resolverEstadoEmissao(doc, e, new FocusProvider(), id, CFG), c);
    const r = await estado(id);
    ok("A nenhuma chamada HTTP à Focus", chamadas.length === 0, chamadas);
    ok("A documento em ERRO com FOCUS_DTO_INCOMPLETO", r.status === "ERRO" && r.fiscal_error_code !== null && String(r.ultimo_erro).includes("FOCUS_DTO_INCOMPLETO"), r.ultimo_erro);
  }

  console.log("\n[B] retry após timeout: consulta a MESMA ref -> autorizado -> EMITIDO + refs -> XML -> Storage -> auditoria");
  let idB = "";
  {
    idB = await novoDocumento(sufixo * 10 + 2, payloadBase);
    let doc = await claim(idB);
    await supabase.rpc("fiscal_marcar_erro", { p_documento_id: idB, p_erro: "FOCUS_PROVIDER_TIMEOUT", p_transitorio: true });
    await sql`update public.documentos_fiscais_pendentes set proxima_tentativa_em = now() - interval '1 second' where id = ${idB}`;
    doc = await claim(idB);
    ok("B 2ª claim marca ja_tentou_emissao_antes", doc.ja_tentou_emissao_antes === true);

    chamadas.length = 0;
    focusResponder = (c) =>
      c.url === `${BASE}/v2/nfce/${idB}`
        ? json(200, { status: "autorizado", chave_nfe: CHAVE, protocolo: "135000000000001", caminho_xml_nota_fiscal: "https://api.focusnfe.com.br/arquivos/b.xml", caminho_danfe: "/arquivos/b.html", qrcode_url: "https://qr.example/b" })
        : new Response(XML_AUT, { status: 200 });
    const c: WorkerCounters = { emitted: [], failed: [], retried: [] };
    const gate = await enforceRetrySafeGate(supabase, doc, new FocusProvider(), idB, CFG, c);
    ok("B gate NÃO libera novo POST (consulta resolveu)", !gate.proceed);
    ok("B só um GET de consulta, pela mesma ref, com Basic Auth", chamadas.length === 1 && chamadas[0].method === "GET" && chamadas[0].url.endsWith(`/v2/nfce/${idB}`) && !!chamadas[0].auth);
    let r = await estado(idB);
    ok("B EMITIDO com chave/protocolo", r.status === "EMITIDO" && r.chave_fiscal === CHAVE);
    ok("B referência Focus persistida como devolvida", r.focus_xml_path === "https://api.focusnfe.com.br/arquivos/b.xml" && r.focus_danfe_path === "/arquivos/b.html" && r.focus_qrcode_url === "https://qr.example/b");
    ok("B snapshot congelado intacto", r.payload?.natureza_operacao === "Venda de mercadoria");

    const { data: xmlRows } = await supabase.rpc("fiscal_claim_documentos_xml", { p_limit: 100 });
    const raw = (xmlRows as Array<Record<string, unknown>>).find((x) => x.id === idB)!;
    ok("B claim do XML devolve focus_xml_path", raw?.focus_xml_path === "https://api.focusnfe.com.br/arquivos/b.xml");
    chamadas.length = 0;
    const xc: XmlWorkerCounters = { armazenados: [], bloqueados: [], comErro: [], ignoradosPorConcorrencia: [] };
    await processXmlDocumento(
      supabase,
      { id: idB, venda_id: String(raw.venda_id), tipo_doc: String(raw.tipo_doc), provider: String(raw.provider), lease_token: String(raw.xml_lease_token), focus_xml_path: String(raw.focus_xml_path) },
      new FocusProvider(),
      idB,
      CFG,
      xc,
    );
    ok("B download no link exato, sem Authorization", chamadas.length === 1 && chamadas[0].url === "https://api.focusnfe.com.br/arquivos/b.xml" && chamadas[0].auth === null, chamadas);
    r = await estado(idB);
    ok("B xml_status ARMAZENADO, sha256 do conteúdo, armazenado_em, sem erro, tentativas 0",
      r.xml_status === "ARMAZENADO" && r.xml_sha256 === await sha256Hex(XML_AUT) && r.xml_armazenado_em !== null && r.xml_ultimo_erro === null && r.xml_tentativas === 0, r);
    ok("B blob no Storage (path determinístico) igual ao baixado", disco.get(r.xml_storage_path) === XML_AUT);
    const ev = await eventos(idB);
    ok("B auditoria: EMITIDO e XML_ARMAZENADO na timeline", ev.includes("EMITIDO") && ev.includes("XML_ARMAZENADO"), ev);
  }

  console.log("\n[C] cancelamento -> CANCELADO -> XML de cancelamento separado; XML da autorização preservado");
  {
    const antes = await estado(idB);
    const { data: ini } = await supabase.rpc("fiscal_iniciar_cancelamento", { p_documento_id: idB, p_justificativa: "Cliente desistiu da compra no caixa" });
    const linha = (ini as Array<Record<string, unknown>>)[0];
    ok("C pedido iniciado com lease", linha.resultado === "INICIADO" && !!linha.cancelamento_lease_token);
    const { data: ini2 } = await supabase.rpc("fiscal_iniciar_cancelamento", { p_documento_id: idB, p_justificativa: "Cliente desistiu da compra no caixa" });
    ok("C pedido concorrente fica EM_ANDAMENTO (sem 2º DELETE)", (ini2 as Array<Record<string, unknown>>)[0].resultado === "EM_ANDAMENTO");

    chamadas.length = 0;
    focusResponder = (c) =>
      c.method === "DELETE"
        ? json(200, { status: "cancelado", numero_protocolo: "135000000000099", caminho_xml_cancelamento: "https://api.focusnfe.com.br/arquivos/b-canc.xml" })
        : new Response(XML_CANC, { status: 200 });
    const r1 = await processarCancelamento(
      supabase,
      { id: idB, venda_id: "", tipo_doc: "NFC_E_STUB", lease_token: String(linha.cancelamento_lease_token), tentativas_anteriores: Number(linha.cancelamento_tentativas_anteriores) },
      new FocusProvider(),
      idB,
      "Cliente desistiu da compra no caixa",
      CFG,
    );
    ok("C DELETE único pela mesma ref", r1.resultado === "cancelado" && chamadas.length === 1 && chamadas[0].method === "DELETE" && chamadas[0].url.endsWith(`/v2/nfce/${idB}`), chamadas);
    let r = await estado(idB);
    ok("C CANCELADO com protocolo e caminho de cancelamento", r.status === "CANCELADO" && r.cancelamento_protocolo === "135000000000099" && r.focus_xml_cancelamento_path === "https://api.focusnfe.com.br/arquivos/b-canc.xml");
    ok("C XML da autorização intacto", r.xml_status === "ARMAZENADO" && r.xml_storage_path === antes.xml_storage_path && r.xml_sha256 === antes.xml_sha256);

    const { data: cRows } = await supabase.rpc("fiscal_claim_documentos_xml_cancelamento", { p_limit: 100 });
    const raw = (cRows as Array<Record<string, unknown>>).find((x) => x.id === idB)!;
    chamadas.length = 0;
    await processXmlDocumento(
      supabase,
      { id: idB, venda_id: String(raw.venda_id), tipo_doc: String(raw.tipo_doc), provider: String(raw.provider), lease_token: String(raw.xml_cancelamento_lease_token), focus_xml_path: String(raw.focus_xml_cancelamento_path) },
      new FocusProvider(),
      idB,
      CFG,
      { armazenados: [], bloqueados: [], comErro: [], ignoradosPorConcorrencia: [] },
      "CANCELAMENTO",
    );
    r = await estado(idB);
    ok("C XML de cancelamento ARMAZENADO em path próprio",
      r.xml_cancelamento_status === "ARMAZENADO" && r.xml_cancelamento_storage_path !== r.xml_storage_path && disco.get(r.xml_cancelamento_storage_path) === XML_CANC, r);
    ok("C download do XML de cancelamento sem Authorization", chamadas.length === 1 && chamadas[0].auth === null);
    ok("C blob da autorização não sobrescrito", disco.get(r.xml_storage_path) === XML_AUT);

    const tentarEmitido = await supabase.rpc("fiscal_marcar_emitido_focus", { p_documento_id: idB, p_chave_fiscal: CHAVE, p_protocolo: "x" });
    ok("C CANCELADO nunca volta a EMITIDO", !!tentarEmitido.error && tentarEmitido.error.message.includes("FISCAL_TRANSICAO_INVALIDA"));
    const ev = await eventos(idB);
    ok("C auditoria: CANCELAMENTO_SOLICITADO, CANCELADO, XML_CANCELAMENTO_ARMAZENADO",
      ev.includes("CANCELAMENTO_SOLICITADO") && ev.includes("CANCELADO") && ev.includes("XML_CANCELAMENTO_ARMAZENADO"), ev);
  }

  console.log("\n[D] already_processed -> consulta a mesma ref -> estado remoto aplicado (sem outra ref)");
  {
    const id = await novoDocumento(sufixo * 10 + 4, payloadBase);
    const doc = await claim(id);
    chamadas.length = 0;
    focusResponder = () => json(200, { status: "denegado", mensagem_sefaz: "Uso denegado" });
    const est = await resolverEstadoEmissao(doc, { kind: "ja_processado", payload: null } as FocusRemoteState, new FocusProvider(), id, CFG);
    await applyFocusRemoteState(supabase, doc, est, { emitted: [], failed: [], retried: [] });
    const r = await estado(id);
    ok("D uma consulta pela mesma ref", chamadas.length === 1 && chamadas[0].url.endsWith(`/v2/nfce/${id}`));
    ok("D denegado -> ERRO não-retryable FOCUS_DENEGADO (nunca EMITIDO)", r.status === "ERRO" && r.fiscal_error_code === "FOCUS_DENEGADO" && r.fiscal_retryable === false, r.status);
  }
} catch (e) {
  fail++;
  console.log(`  FAIL  exceção: ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  await sql.end();
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
Deno.exit(fail === 0 ? 0 : 1);
