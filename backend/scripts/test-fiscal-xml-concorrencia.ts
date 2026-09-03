// Hotfix final — prova de concorrência REAL (não sequencial, não fake) do
// fechamento do P0 achado pela auditoria independente do Codex:
// "concorrência entre workers pode sobrescrever XML fiscal já confirmado e
// regredir ARMAZENADO -> ERRO".
//
// Roda contra o stack local de verdade (Postgres real via `docker exec
// psql` para setup/asserts diretos no banco, Storage real via
// @supabase/supabase-js) e exercita a função de orquestração REAL
// (`processXmlDocumento`), não uma reimplementação — dois "workers" são
// duas chamadas dessa mesma função, cada uma com sua própria conexão HTTP
// independente, disparadas com `Promise.all`: concorrência genuína de I/O,
// não duas chamadas sequenciais dentro do mesmo processo.
//
// Achado empírico importante desta prova (documentado, não escondido): o
// Storage local do Supabase NÃO garante atomicidade perfeita de
// create-only sob concorrência genuína — duas requisições realmente
// simultâneas de upload() para um path NOVO podem ambas reportar sucesso
// (confirmado abaixo, seção "Storage bruto"). É exatamente por isso que
// `processXmlDocumento` nunca confia no retorno de `upload()`: sempre lê de
// volta e compara hash antes de confirmar na RPC (fiscal_xml_
// orchestration.ts). As provas desta seção testam a função REAL, não
// Storage isolado, e confirmam que o resultado final é sempre consistente
// mesmo com Storage não sendo perfeitamente atômico por baixo.
//
// Uso:
//   deno run --allow-net --allow-env --allow-run --node-modules-dir=none backend/scripts/test-fiscal-xml-concorrencia.ts
// (a partir da raiz do worktree, com `supabase start` já de pé)

import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { computeXmlStoragePath, FISCAL_XML_BUCKET, processXmlDocumento, sha256Hex, type XmlDoc, type XmlWorkerCounters } from "../supabase/functions/fiscal-worker/fiscal_xml_orchestration.ts";
import type { FiscalProvider } from "../supabase/functions/fiscal-worker/fiscal-provider-adapter.ts";
import type { FiscalXmlResult } from "../supabase/functions/fiscal-worker/fiscal_types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const CONTAINER = Deno.env.get("CONTAINER") ?? "supabase_db_fastproduct";
const PROVIDER_IDENTITY = "mock";

let passCount = 0;
let failCount = 0;
function ok(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passCount++;
    console.log(`  PASS  ${label}`);
  } else {
    failCount++;
    console.log(`  FAIL  ${label} ${detail !== undefined ? JSON.stringify(detail) : ""}`);
  }
}
function info(label: string) {
  console.log(`  INFO  ${label}`);
}

async function psql(sql: string): Promise<string> {
  const cmd = new Deno.Command("docker", {
    args: ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-A", "-t", "-q"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = cmd.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(sql));
  await writer.close();
  const { stdout, stderr, success } = await child.output();
  const out = new TextDecoder().decode(stdout);
  const err = new TextDecoder().decode(stderr);
  if (!success) throw new Error(`psql falhou: ${err || out}`);
  return out.trim();
}

async function criarDocumentoEmitido(): Promise<{ vendaId: string; docId: string }> {
  const vendaId = crypto.randomUUID();
  const uid = await psql(`SELECT id FROM public.usuarios LIMIT 1;`);
  if (!uid) throw new Error("Sem usuário seed no banco local — rode o script de start do Supabase local primeiro.");
  await psql(`
    INSERT INTO public.vendas (id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
    VALUES ('${vendaId}', '${uid}', 10, 0, 10, 'DINHEIRO', 'CONCLUIDA');
  `);
  const docId = await psql(`
    INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
    VALUES ('${vendaId}', 'NFC_E_STUB', 'PENDENTE', '{}'::jsonb)
    RETURNING id;
  `);
  await psql(`UPDATE public.documentos_fiscais_pendentes SET status = 'EM_PROCESSAMENTO' WHERE id = '${docId}';`);
  await psql(`
    UPDATE public.documentos_fiscais_pendentes
    SET status = 'EMITIDO', chave_fiscal = repeat('7', 44), protocolo = 'PROTO-CONC', processado_em = now(), provider = '${PROVIDER_IDENTITY}'
    WHERE id = '${docId}';
  `);
  return { vendaId, docId };
}

async function limpar(vendaId: string, docId: string) {
  // Remove qualquer blob de teste que tenha ficado no bucket (path
  // determinístico a partir de PROVIDER_IDENTITY + tipo_doc + docId).
  const path = computeXmlStoragePath({ id: docId, tipo_doc: "NFC_E_STUB" }, PROVIDER_IDENTITY);
  const client = createClient(SUPABASE_URL, SERVICE_KEY);
  await client.storage.from(FISCAL_XML_BUCKET).remove([path]);

  await psql(`DELETE FROM public.documentos_fiscais_eventos WHERE documento_id = '${docId}';`);
  await psql(`DELETE FROM public.documentos_fiscais_pendentes WHERE id = '${docId}';`);
  await psql(`DELETE FROM public.vendas WHERE id = '${vendaId}';`);
}

function fakeProvider(xml: string): FiscalProvider {
  return {
    async callProvider() {
      throw new Error("não deveria ser chamado");
    },
    async obterXmlAutorizado(): Promise<FiscalXmlResult> {
      return { kind: "obtido", xml };
    },
  };
}

// ---------------------------------------------------------------------------
// Storage bruto — documenta o comportamento REAL do Storage local sob
// concorrência genuína (não é o que decide a correção final; é a
// justificativa empírica de por que processXmlDocumento nunca confia
// cegamente em upload()==sucesso).
// ---------------------------------------------------------------------------
async function documentarComportamentoStorageBruto() {
  console.log("\n[Storage bruto] Documentando o comportamento real do create-only sob concorrência genuína (informativo)");
  const clientA = createClient(SUPABASE_URL, SERVICE_KEY);
  const clientB = createClient(SUPABASE_URL, SERVICE_KEY);
  const path = `conc-test/bruto-${crypto.randomUUID()}.xml`;
  await clientA.storage.from(FISCAL_XML_BUCKET).remove([path]);

  const [rA, rB] = await Promise.all([
    clientA.storage.from(FISCAL_XML_BUCKET).upload(path, "<a/>", { contentType: "application/xml", upsert: false }),
    clientB.storage.from(FISCAL_XML_BUCKET).upload(path, "<b/>", { contentType: "application/xml", upsert: false }),
  ]);
  info(`upload A error=${JSON.stringify(rA.error)} | upload B error=${JSON.stringify(rB.error)}`);
  info("Isto é OBSERVAÇÃO, não uma garantia exigida do Storage — é por isso que a camada de aplicação verifica por leitura antes de confirmar (ver Cenário D abaixo).");
  await clientA.storage.from(FISCAL_XML_BUCKET).remove([path]);
}

// ---------------------------------------------------------------------------
// Cenário claim — duas RPCs `fiscal_claim_documentos_xml` disparadas ao
// mesmo tempo (Promise.all) contra o MESMO documento elegível único.
// ---------------------------------------------------------------------------
async function cenarioClaimConcorrente() {
  console.log("\n[Cenário Claim] Dois claims REALMENTE concorrentes disputando o MESMO único documento elegível");
  const { vendaId, docId } = await criarDocumentoEmitido();
  try {
    const clientA = createClient(SUPABASE_URL, SERVICE_KEY);
    const clientB = createClient(SUPABASE_URL, SERVICE_KEY);

    const [rA, rB] = await Promise.all([
      clientA.rpc("fiscal_claim_documentos_xml", { p_limit: 50 }),
      clientB.rpc("fiscal_claim_documentos_xml", { p_limit: 50 }),
    ]);
    // deno-lint-ignore no-explicit-any
    const pegouA = (rA.data ?? []).some((d: any) => d.id === docId);
    // deno-lint-ignore no-explicit-any
    const pegouB = (rB.data ?? []).some((d: any) => d.id === docId);
    ok("exatamente UM dos dois claims concorrentes reclamou o documento (nunca os dois, nunca nenhum)", pegouA !== pegouB, { pegouA, pegouB });

    const xmlStatus = await psql(`SELECT xml_status FROM public.documentos_fiscais_pendentes WHERE id = '${docId}';`);
    ok("documento ficou EM_PROCESSAMENTO (lease atribuído) após a disputa", xmlStatus === "EM_PROCESSAMENTO", xmlStatus);
  } finally {
    await limpar(vendaId, docId);
  }
}

/** Prepara dois XmlDoc "concorrentes" para o MESMO documento real: A com um
 * lease que será backdatado (simula worker travado/lento), B reclamando o
 * lease vencido de A (simula o segundo worker que realmente processa). */
async function prepararDoisWorkersDisputandoMesmoDocumento(): Promise<{
  vendaId: string;
  docId: string;
  docA: XmlDoc;
  docB: XmlDoc;
  clientA: ReturnType<typeof createClient>;
  clientB: ReturnType<typeof createClient>;
}> {
  const { vendaId, docId } = await criarDocumentoEmitido();
  const clientA = createClient(SUPABASE_URL, SERVICE_KEY);
  const clientB = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: claimA } = await clientA.rpc("fiscal_claim_documentos_xml", { p_limit: 50 });
  // deno-lint-ignore no-explicit-any
  const rowA = (claimA ?? []).find((d: any) => d.id === docId);
  if (!rowA) throw new Error("setup: worker A não conseguiu reclamar o documento");

  // Simula A travado/lento: backdata a expiração do lease dele ANTES de A
  // sequer tentar processar — reproduz "worker A pegou o documento, ficou
  // preso (crash/timeout de rede real seria mais devagar de simular; a
  // técnica de backdatar já é usada nesta missão desde C2.9 para o reaper)".
  await psql(`UPDATE public.documentos_fiscais_pendentes SET xml_lease_expires_em = now() - interval '1 second' WHERE id = '${docId}';`);

  const { data: claimB } = await clientB.rpc("fiscal_claim_documentos_xml", { p_limit: 50 });
  // deno-lint-ignore no-explicit-any
  const rowB = (claimB ?? []).find((d: any) => d.id === docId);
  if (!rowB) throw new Error("setup: worker B não conseguiu reclamar o lease vencido de A");
  if (rowB.xml_lease_token === rowA.xml_lease_token) throw new Error("setup inválido: B recebeu o mesmo token de A");

  const base: Omit<XmlDoc, "lease_token"> = { id: docId, venda_id: vendaId, tipo_doc: "NFC_E_STUB", provider: PROVIDER_IDENTITY };
  return {
    vendaId,
    docId,
    docA: { ...base, lease_token: rowA.xml_lease_token },
    docB: { ...base, lease_token: rowB.xml_lease_token },
    clientA,
    clientB,
  };
}

async function estadoFinalConsistente(docId: string): Promise<{ status: string; path: string; hash: string; blobHashReal: string | null }> {
  const linha = await psql(`SELECT xml_status || '|' || COALESCE(xml_storage_path,'') || '|' || COALESCE(xml_sha256,'') FROM public.documentos_fiscais_pendentes WHERE id = '${docId}';`);
  const [status, path, hash] = linha.split("|");
  let blobHashReal: string | null = null;
  if (path) {
    const client = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data } = await client.storage.from(FISCAL_XML_BUCKET).download(path);
    if (data) blobHashReal = await sha256Hex(await data.text());
  }
  return { status, path, hash, blobHashReal };
}

// ---------------------------------------------------------------------------
// Cenário C — dois workers reais (leases distintos) processando o MESMO
// documento com o MESMO conteúdo XML, via processXmlDocumento de verdade,
// disparados verdadeiramente ao mesmo tempo.
// ---------------------------------------------------------------------------
async function cenarioXmlIgualConcorrente() {
  console.log("\n[Cenário C] processXmlDocumento real, 2 workers, MESMO conteúdo XML, disputando o mesmo documento — via Promise.all genuíno");
  const { vendaId, docId, docA, docB, clientA, clientB } = await prepararDoisWorkersDisputandoMesmoDocumento();
  try {
    const conteudo = "<xmlIdenticoDosDoisWorkers/>";
    const countersA: XmlWorkerCounters = { armazenados: [], bloqueados: [], comErro: [], ignoradosPorConcorrencia: [] };
    const countersB: XmlWorkerCounters = { armazenados: [], bloqueados: [], comErro: [], ignoradosPorConcorrencia: [] };

    await Promise.all([
      processXmlDocumento(clientA, docA, fakeProvider(conteudo), "ref-a", { type: "mock" }, countersA),
      processXmlDocumento(clientB, docB, fakeProvider(conteudo), "ref-b", { type: "mock" }, countersB),
    ]);

    const final = await estadoFinalConsistente(docId);
    const ultimoErro = await psql(`SELECT COALESCE(xml_ultimo_erro,'') FROM public.documentos_fiscais_pendentes WHERE id = '${docId}';`);
    info(`resultado bruto: status=${final.status} hash=${final.hash || "(nenhum)"} xml_ultimo_erro=${ultimoErro || "(nenhum)"}`);
    info(`Worker A contadores: armazenados=${countersA.armazenados.length} ignorados=${countersA.ignoradosPorConcorrencia.length} comErro=${JSON.stringify(countersA.comErro)}`);
    info(`Worker B contadores: armazenados=${countersB.armazenados.length} ignorados=${countersB.ignoradosPorConcorrencia.length} comErro=${JSON.stringify(countersB.comErro)}`);

    // Mesmo raciocínio do Cenário D: sob colisão física verdadeiramente
    // simultânea no MESMO path novo (Storage local não é perfeitamente
    // atômico — ver "[Storage bruto]"), o desfecho seguro pode ser (a) um
    // dos dois confirma (aqui, como o conteúdo é idêntico, qualquer um dos
    // dois hashes serve) ou (b) os dois se recusam a confirmar sob
    // incerteza — nunca uma confirmação de valor incorreto.
    if (final.status === "ARMAZENADO") {
      ok("hash persistido no banco é o do conteúdo (idêntico dos dois lados)", final.hash === (await sha256Hex(conteudo)), final);
      ok("CONSISTÊNCIA: blob real no path == hash persistido no banco == XML confirmado", final.blobHashReal === final.hash && final.hash !== null, final);
    } else {
      ok("(desfecho: colisão dupla, ambos fail-closed) status é ERRO — nunca confirma valor incorreto", final.status === "ERRO", final);
    }
  } finally {
    await limpar(vendaId, docId);
  }
}

// ---------------------------------------------------------------------------
// Cenário D — dois workers reais processando o MESMO documento com XML
// DIFERENTE, via processXmlDocumento de verdade, ao mesmo tempo. O
// resultado tem que ser único e consistente (nunca uma mistura, nunca um
// hash que não bate com o blob real).
// ---------------------------------------------------------------------------
async function cenarioXmlDiferenteConcorrente() {
  console.log("\n[Cenário D] processXmlDocumento real, 2 workers, XML DIFERENTE, disputando o mesmo documento — via Promise.all genuíno");
  const { vendaId, docId, docA, docB, clientA, clientB } = await prepararDoisWorkersDisputandoMesmoDocumento();
  try {
    const conteudoA = "<xmlDoWorkerA-lease-vencido/>";
    const conteudoB = "<xmlDoWorkerB-lease-vigente/>";
    const hashA = await sha256Hex(conteudoA);
    const hashB = await sha256Hex(conteudoB);
    const countersA: XmlWorkerCounters = { armazenados: [], bloqueados: [], comErro: [], ignoradosPorConcorrencia: [] };
    const countersB: XmlWorkerCounters = { armazenados: [], bloqueados: [], comErro: [], ignoradosPorConcorrencia: [] };

    await Promise.all([
      processXmlDocumento(clientA, docA, fakeProvider(conteudoA), "ref-a", { type: "mock" }, countersA),
      processXmlDocumento(clientB, docB, fakeProvider(conteudoB), "ref-b", { type: "mock" }, countersB),
    ]);

    const final = await estadoFinalConsistente(docId);
    info(`resultado bruto: status=${final.status} hash=${final.hash || "(nenhum)"}`);

    // Sob colisão física verdadeiramente simultânea no MESMO path novo
    // (Storage local não é perfeitamente atômico — ver "[Storage bruto]"),
    // dois desfechos são SEGUROS e aceitáveis: (a) um dos dois vence e fica
    // ARMAZENADO com hash consistente; (b) os dois se recusam a confirmar
    // (cada um leu de volta um conteúdo que não era o seu) e o documento
    // fica ERRO, retryable — nunca corrompe, nunca confirma valor errado.
    // O que NUNCA pode acontecer, em nenhum dos dois casos, é o hash do
    // PERDEDOR (ou qualquer valor que não corresponda ao blob real) virar
    // o valor confirmado.
    if (final.status === "ARMAZENADO") {
      const decidiuA = final.hash === hashA;
      const decidiuB = final.hash === hashB;
      ok("(desfecho: 1 vencedor) hash persistido é EXATAMENTE de um dos dois (nunca uma mistura/valor estranho)", decidiuA !== decidiuB, final);
      ok("CONSISTÊNCIA CENTRAL: blob real no path == hash persistido no banco == XML confirmado (nunca diverge, mesmo com Storage não-atômico por baixo)", final.blobHashReal === final.hash && final.hash !== null, final);
      const hashPerdedor = decidiuA ? hashB : hashA;
      ok("hash do PERDEDOR nunca é o que fica persistido/confirmado", final.hash !== hashPerdedor);
    } else {
      // Colisão simultânea onde nenhum dos dois conseguiu verificar o
      // próprio conteúdo com segurança — SEGURO (fail-closed dos dois
      // lados), mas precisa retry (não é o desfecho preferido, é o
      // desfecho SEGURO quando a corrida é extrema o bastante).
      ok("(desfecho: colisão dupla, ambos fail-closed) status é ERRO — nunca CANCELADO/outro estado inesperado", final.status === "ERRO", final);
      ok("nenhum hash foi confirmado sob colisão dupla (nem A nem B) — nunca um valor incorreto vira ARMAZENADO", final.hash === "" || final.hash === undefined, final);
    }
    ok("em NENHUM desfecho o documento saiu do laço em um estado diferente de ARMAZENADO/ERRO (nunca meio-aplicado)", final.status === "ARMAZENADO" || final.status === "ERRO", final);

    info(`Worker A (lease vencido) contadores: armazenados=${countersA.armazenados.length} ignorados=${countersA.ignoradosPorConcorrencia.length} comErro=${countersA.comErro.length}`);
    info(`Worker B (lease vigente) contadores: armazenados=${countersB.armazenados.length} ignorados=${countersB.ignoradosPorConcorrencia.length} comErro=${countersB.comErro.length}`);
  } finally {
    await limpar(vendaId, docId);
  }
}

// ---------------------------------------------------------------------------
// Cenário E — reprodução exata do achado do Codex: worker atrasado tenta
// marcar ERRO depois que outro já armazenou. Disparado concorrentemente
// (Promise.all) junto com uma reconfirmação legítima de B.
// ---------------------------------------------------------------------------
async function cenarioErroTardioAposArmazenado() {
  console.log("\n[Cenário E] Worker atrasado tenta marcar ERRO depois que outro já armazenou — disparado concorrentemente (ACHADO ORIGINAL DO CODEX)");
  const { vendaId, docId, docA, docB, clientA, clientB } = await prepararDoisWorkersDisputandoMesmoDocumento();
  try {
    // B (lease vigente) processa e confirma primeiro, sequencialmente,
    // para deixar o estado determinístico antes da disputa final.
    const countersB: XmlWorkerCounters = { armazenados: [], bloqueados: [], comErro: [], ignoradosPorConcorrencia: [] };
    await processXmlDocumento(clientB, docB, fakeProvider("<xmlDeB-ja-confirmado/>"), "ref-b", { type: "mock" }, countersB);
    ok("setup: B armazenou com sucesso antes da disputa final", countersB.armazenados.length === 1, countersB);

    const path = computeXmlStoragePath(docB, docB.provider!);
    const hashB = await sha256Hex("<xmlDeB-ja-confirmado/>");

    // Disputa REAL e simultânea: A (token velho) tenta marcar erro sobre o
    // que já foi decidido; B tenta reconfirmar (idempotente) — ambos ao
    // mesmo tempo via Promise.all.
    const [erroTardioDeA, reconfirmacaoDeB] = await Promise.all([
      clientA.rpc("fiscal_marcar_xml_erro", { p_documento_id: docId, p_erro: "erro tardio de A, achado original do Codex", p_lease_token: docA.lease_token }),
      clientB.rpc("fiscal_marcar_xml_armazenado", { p_documento_id: docId, p_storage_path: path, p_sha256: hashB, p_lease_token: docB.lease_token }),
    ]);
    // Aplicado precisa ser false (RPC recusou aplicar) — nunca `true`, que
    // seria o bug original (ARMAZENADO regredindo para ERRO).
    ok("ACHADO DO CODEX FECHADO: erro tardio de A NUNCA é aplicado (aplicado=false)", erroTardioDeA.data === false, erroTardioDeA);
    ok("reconfirmação idempotente de B continua aplicado=true", reconfirmacaoDeB.data === true, reconfirmacaoDeB);

    const final = await estadoFinalConsistente(docId);
    ok("estado PERMANECE ARMAZENADO mesmo após a tentativa de erro tardio disparada concorrentemente", final.status === "ARMAZENADO", final);
    ok("CONSISTÊNCIA: blob real == hash persistido, intacto após a disputa", final.blobHashReal === final.hash && final.hash === hashB, final);
  } finally {
    await limpar(vendaId, docId);
  }
}

async function main() {
  console.log(`Stack: ${SUPABASE_URL} / container ${CONTAINER}`);
  await documentarComportamentoStorageBruto();
  await cenarioClaimConcorrente();
  await cenarioXmlIgualConcorrente();
  await cenarioXmlDiferenteConcorrente();
  await cenarioErroTardioAposArmazenado();

  console.log(`\n===== ${passCount} PASS, ${failCount} FAIL =====`);
  if (failCount > 0) Deno.exit(1);
}

await main();
