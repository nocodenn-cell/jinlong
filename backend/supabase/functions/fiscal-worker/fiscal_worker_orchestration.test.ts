// Onda C2.7/C2.8/C2.9 — orquestração entre FocusRemoteState e as RPCs
// existentes. Sem rede: fake do Supabase client grava as chamadas de RPC.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { FiscalDoc, FocusRemoteState } from "./fiscal_types.ts";
import { applyCredentialResolutionFailure, applyFocusRemoteState, extractLojaId, type WorkerCounters } from "./fiscal_worker_orchestration.ts";

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
  return { id: "doc-1", venda_id: "venda-1", tipo_doc: "NFE", tentativas: 1, correlation_id: "corr-1", payload: { loja_id: "loja-1" } };
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
