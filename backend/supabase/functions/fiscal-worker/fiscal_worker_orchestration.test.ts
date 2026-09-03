// Onda C2.7/C2.8/C2.9 — orquestração entre FocusRemoteState e as RPCs
// existentes. Sem rede: fake do Supabase client grava as chamadas de RPC.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { FiscalDoc, FocusRemoteState } from "./fiscal_types.ts";
import { applyCredentialResolutionFailure, applyFocusRemoteState, enforceRetrySafeGate, extractLojaId, type WorkerCounters } from "./fiscal_worker_orchestration.ts";

function fakeSupabase() {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    rpcCalls,
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      return { data: null, error: null };
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

function doc(): FiscalDoc {
  return { id: "doc-1", venda_id: "venda-1", tipo_doc: "NFE", tentativas: 1, ja_tentou_emissao_antes: true, correlation_id: "corr-1", payload: { loja_id: "loja-1" } };
}

function counters(): WorkerCounters {
  return { emitted: [], failed: [], retried: [] };
}

Deno.test("extractLojaId lê payload.loja_id; ausente/malformado -> null", () => {
  assertEquals(extractLojaId({ loja_id: "loja-1" }), "loja-1");
  assertEquals(extractLojaId({}), null);
  assertEquals(extractLojaId(null), null);
  assertEquals(extractLojaId({ loja_id: 123 } as unknown as Record<string, unknown>), null);
});

Deno.test("autorizado -> chama fiscal_marcar_emitido, nenhuma outra RPC", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  const estado: FocusRemoteState = { kind: "autorizado", chave_fiscal: "chave-x", protocolo: "proto-x", provider_ref: "ref-1", payload: null };
  await applyFocusRemoteState(supabase, doc(), estado, c);
  assertEquals(supabase.rpcCalls.length, 1);
  assertEquals(supabase.rpcCalls[0].fn, "fiscal_marcar_emitido");
  assertEquals(supabase.rpcCalls[0].args.p_chave_fiscal, "chave-x");
  assertEquals(c.emitted, ["doc-1"]);
});

Deno.test("processando -> ZERO chamadas de RPC (7. 202 não é erro; reaproveita EM_PROCESSAMENTO já setado pelo claim)", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  const estado: FocusRemoteState = { kind: "processando", payload: { status: "processando_autorizacao" } };
  await applyFocusRemoteState(supabase, doc(), estado, c);
  assertEquals(supabase.rpcCalls.length, 0);
  assertEquals(c.emitted, []);
  assertEquals(c.failed, []);
  assertEquals(c.retried, []);
});

Deno.test("rejeitado -> fiscal_marcar_erro_normalizado com retryable=false", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  const estado: FocusRemoteState = { kind: "rejeitado", erro: "CADASTRO_INVALIDO", provider_code: "CADASTRO_INVALIDO", provider_message: null, payload: null };
  await applyFocusRemoteState(supabase, doc(), estado, c);
  assertEquals(supabase.rpcCalls.length, 1);
  assertEquals(supabase.rpcCalls[0].fn, "fiscal_marcar_erro_normalizado");
  assertEquals(supabase.rpcCalls[0].args.p_retryable, false);
});

Deno.test("erro_transitorio -> fiscal_marcar_erro com transitorio=true (backoff existente, sem RPC nova)", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  const estado: FocusRemoteState = { kind: "erro_transitorio", erro: "TIMEOUT", http_status: null, provider_code: "TIMEOUT", provider_message: null, payload: null };
  await applyFocusRemoteState(supabase, doc(), estado, c);
  assertEquals(supabase.rpcCalls.length, 1);
  assertEquals(supabase.rpcCalls[0].fn, "fiscal_marcar_erro");
  assertEquals(supabase.rpcCalls[0].args.p_transitorio, true);
});

Deno.test("18. falha de credencial -> fiscal_marcar_erro_normalizado, ZERO chamada HTTP (nem chega a instanciar provider)", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  await applyCredentialResolutionFailure(supabase, doc(), "FISCAL_CONFIG_AUSENTE", c);
  assertEquals(supabase.rpcCalls.length, 1);
  assertEquals(supabase.rpcCalls[0].fn, "fiscal_marcar_erro_normalizado");
  assertEquals(supabase.rpcCalls[0].args.p_error_code, "FISCAL_CONFIG_AUSENTE");
  assertEquals(supabase.rpcCalls[0].args.p_retryable, false);
  assertEquals(c.failed[0].erro, "FISCAL_CONFIG_AUSENTE");
});

Deno.test("9/10. retry (tentativas>0) — consulta antes de reemitir é responsabilidade do laço em index.ts; aqui provamos que aplicar um estado de consulta usa a MESMA função (não duplica lógica)", async () => {
  // Simula o resultado de uma consulta feita ANTES de um novo POST (index.ts,
  // C2.7): se veio autorizado, aplica exatamente como se fosse resultado de
  // emissão — mesma RPC, sem segunda chamada de emissão.
  const supabase = fakeSupabase();
  const c = counters();
  const estadoDaConsulta: FocusRemoteState = { kind: "autorizado", chave_fiscal: "chave-recuperada", protocolo: "proto-recuperado", provider_ref: null, payload: null };
  await applyFocusRemoteState(supabase, doc(), estadoDaConsulta, c);
  assertEquals(supabase.rpcCalls[0].fn, "fiscal_marcar_emitido");
  assertEquals(supabase.rpcCalls[0].args.p_chave_fiscal, "chave-recuperada");
  // Nenhuma chamada de emissão (POST) aconteceu neste teste — só a aplicação
  // do resultado da consulta. O laço em index.ts só chama emitirNfce/emitirNfe
  // quando a consulta prévia retorna "nao_encontrado" (ver fiscal-provider-
  // adapter.test.ts para a prova de que o POST em si usa sempre a mesma ref).
});

// ---------------------------------------------------------------------------
// Sprint de convergência (auditoria Codex) — P0 "query-before-reemit":
// prova EXECUTÁVEL, não estática, de que `enforceRetrySafeGate` (agora
// chamado por `index.ts` no lugar do bloco inline anterior) nunca libera
// um novo POST sem antes consultar a referência quando a tentativa não é a
// primeira. Cada teste conta chamadas reais (spy), não apenas lê o código.
// ---------------------------------------------------------------------------

/** Provider fake com contador de chamadas — prova quantas vezes `consultarDocumento` rodou. */
function fakeProviderComConsulta(estado: FocusRemoteState) {
  let chamadas = 0;
  return {
    get chamadas() { return chamadas; },
    async consultarDocumento(_ref: string, _tipoDoc: string, _cfg: unknown): Promise<FocusRemoteState> {
      chamadas += 1;
      return estado;
    },
  };
}

Deno.test("P0 query-before-reemit — tentativas>0 e estado remoto CONHECIDO (não nao_encontrado) -> NÃO libera novo POST, aplica o estado consultado", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  const provider = fakeProviderComConsulta({ kind: "autorizado", chave_fiscal: "chave-recuperada-retry", protocolo: "proto-retry", provider_ref: null, payload: null });

  const gate = await enforceRetrySafeGate(supabase, doc(), provider, "ref-estavel-1", { type: 'focus' }, c);

  assertEquals(provider.chamadas, 1); // consulta realmente aconteceu
  assertEquals(gate.proceed, false); // chamador NÃO deve prosseguir para um novo POST
  assertEquals(supabase.rpcCalls.length, 1);
  assertEquals(supabase.rpcCalls[0].fn, "fiscal_marcar_emitido"); // resultado da consulta aplicado, não uma 2ª emissão
  assertEquals(supabase.rpcCalls[0].args.p_chave_fiscal, "chave-recuperada-retry");
});

Deno.test("P0 query-before-reemit — tentativas>0 e Focus devolve 'processando' -> NÃO libera novo POST (nenhuma RPC, mesma regra de 202)", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  const provider = fakeProviderComConsulta({ kind: "processando", payload: null });

  const gate = await enforceRetrySafeGate(supabase, doc(), provider, "ref-estavel-2", { type: 'focus' }, c);

  assertEquals(provider.chamadas, 1);
  assertEquals(gate.proceed, false);
  assertEquals(supabase.rpcCalls.length, 0); // "processando" não gera RPC — mas também não libera reemissão
});

Deno.test("P0 query-before-reemit — tentativas>0 e Focus confirma 'nao_encontrado' -> SÓ ENTÃO libera novo POST, sem aplicar nenhum estado", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  const provider = fakeProviderComConsulta({ kind: "nao_encontrado" });

  const gate = await enforceRetrySafeGate(supabase, doc(), provider, "ref-estavel-3", { type: 'focus' }, c);

  assertEquals(provider.chamadas, 1); // a consulta aconteceu ANTES de qualquer decisão de emitir
  assertEquals(gate.proceed, true); // só agora o chamador pode prosseguir para POST
  assertEquals(supabase.rpcCalls.length, 0); // nada foi escrito — a decisão de emitir é do chamador, não desta função
});

Deno.test("P0 query-before-reemit — nunca reclamado antes (ja_tentou_emissao_antes=false) NÃO consulta antes de emitir (nada a reconciliar)", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  const provider = fakeProviderComConsulta({ kind: "autorizado", chave_fiscal: "não deveria aparecer", protocolo: "x", provider_ref: null, payload: null });
  const nuncaReclamado: FiscalDoc = { ...doc(), tentativas: 0, ja_tentou_emissao_antes: false };

  const gate = await enforceRetrySafeGate(supabase, nuncaReclamado, provider, "ref-estavel-4", { type: 'focus' }, c);

  assertEquals(provider.chamadas, 0); // consulta NÃO acontece quando nunca houve claim anterior
  assertEquals(gate.proceed, true);
  assertEquals(supabase.rpcCalls.length, 0);
});

Deno.test("P0-1 (achado Codex) — bypass DLQ/reprocessamento: tentativas=0 (resetada) MAS ja_tentou_emissao_antes=true -> AINDA consulta, POST continua bloqueado", async () => {
  // Reproduz exatamente o cenário do achado: fiscal_reprocessar_documento
  // zera `tentativas` ao resgatar da DLQ, mas `ja_tentou_emissao_antes`
  // (derivado de ultima_tentativa_em, nunca resetado) continua TRUE. Se o
  // gate ainda lesse `tentativas`, este caso passaria como "1ª tentativa" e
  // pularia a consulta — exatamente o bug que este teste prova fechado.
  const supabase = fakeSupabase();
  const c = counters();
  const provider = fakeProviderComConsulta({ kind: "autorizado", chave_fiscal: "recuperada-pos-dlq", protocolo: "proto-pos-dlq", provider_ref: null, payload: null });
  const posReprocessamento: FiscalDoc = { ...doc(), tentativas: 0, ja_tentou_emissao_antes: true };

  const gate = await enforceRetrySafeGate(supabase, posReprocessamento, provider, "ref-estavel-6", { type: 'focus' }, c);

  assertEquals(provider.chamadas, 1); // consulta aconteceu apesar de tentativas=0
  assertEquals(gate.proceed, false); // POST máximo = 1: novo POST continua bloqueado
  assertEquals(supabase.rpcCalls[0].fn, "fiscal_marcar_emitido");
  assertEquals(supabase.rpcCalls[0].args.p_chave_fiscal, "recuperada-pos-dlq");
});

Deno.test("P0 query-before-reemit — provider sem capacidade de consulta (mock/http/bling legado) não bloqueia o laço", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  const providerSemConsulta = {}; // sem consultarDocumento — mesmo shape do provider legado

  const gate = await enforceRetrySafeGate(supabase, doc(), providerSemConsulta, "ref-estavel-5", { type: 'focus' }, c);

  assertEquals(gate.proceed, true);
  assertEquals(supabase.rpcCalls.length, 0);
});
