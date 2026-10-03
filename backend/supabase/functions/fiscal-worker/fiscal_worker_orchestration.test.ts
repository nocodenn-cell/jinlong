// Onda C2.7/C2.8/C2.9 — orquestração entre FocusRemoteState e as RPCs
// existentes. Sem rede: fake do Supabase client grava as chamadas de RPC.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { FiscalDoc, FocusRemoteState } from "./fiscal_types.ts";
import {
  applyCredentialResolutionFailure,
  applyFocusRemoteState,
  applyProviderIdentityMismatch,
  applyReconciliarIdentityMismatch,
  computeProviderIdentity,
  confirmProviderFreezeOrFailClosed,
  enforceRetrySafeGate,
  extractLojaId,
  isRecognizedProviderIdentity,
  validateProviderIdentity,
  type WorkerCounters,
} from "./fiscal_worker_orchestration.ts";

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

Deno.test("autorizado -> chama fiscal_marcar_emitido_focus (EMITIDO + referências Focus), nenhuma outra RPC", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  const estado: FocusRemoteState = { kind: "autorizado", chave_fiscal: "chave-x", protocolo: "proto-x", provider_ref: "ref-1", payload: null };
  await applyFocusRemoteState(supabase, doc(), estado, c);
  assertEquals(supabase.rpcCalls.length, 1);
  assertEquals(supabase.rpcCalls[0].fn, "fiscal_marcar_emitido_focus");
  assertEquals(supabase.rpcCalls[0].args.p_chave_fiscal, "chave-x");
  assertEquals(c.emitted, ["doc-1"]);
});

Deno.test("HOTFIX (achado Codex) — autorizado NUNCA repassa a resposta do provider como p_payload, mesmo quando estado.payload tem conteúdo — protege o snapshot fiscal imutável de C1", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  // Resposta "rica" do provider, exatamente o tipo de coisa que antes
  // sobrescrevia o snapshot congelado via `payload = COALESCE(p_payload,
  // payload)` em fiscal_marcar_emitido.
  const estado: FocusRemoteState = {
    kind: "autorizado",
    chave_fiscal: "chave-x",
    protocolo: "proto-x",
    provider_ref: "ref-1",
    payload: { status: "autorizado", mensagem_sefaz: "Autorizado o uso da NF-e", numero_recibo: "999" },
  };
  await applyFocusRemoteState(supabase, doc(), estado, c);
  // `fiscal_marcar_emitido_focus` nem recebe payload: chama
  // `fiscal_marcar_emitido(..., NULL)` internamente.
  assertEquals("p_payload" in supabase.rpcCalls[0].args, false);
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
  assertEquals(supabase.rpcCalls[0].fn, "fiscal_marcar_emitido_focus");
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
  assertEquals(supabase.rpcCalls[0].fn, "fiscal_marcar_emitido_focus"); // resultado da consulta aplicado, não uma 2ª emissão
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
  assertEquals(supabase.rpcCalls[0].fn, "fiscal_marcar_emitido_focus");
  assertEquals(supabase.rpcCalls[0].args.p_chave_fiscal, "recuperada-pos-dlq");
});

Deno.test("P0 query-before-reemit — 1ª tentativa (ja_tentou_emissao_antes=false) com provider sem consulta segue normalmente", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  const providerSemConsulta = {}; // sem consultarDocumento — mesmo shape do provider legado
  const primeiraTentativa: FiscalDoc = { ...doc(), tentativas: 0, ja_tentou_emissao_antes: false };

  const gate = await enforceRetrySafeGate(supabase, primeiraTentativa, providerSemConsulta, "ref-estavel-5", { type: 'focus' }, c);

  assertEquals(gate.proceed, true);
  assertEquals(supabase.rpcCalls.length, 0);
});

// ---------------------------------------------------------------------------
// Sprint C2.10 (P0-2, achado Codex) — bug real corrigido: o gate original
// combinava "1ª tentativa" e "provider sem consulta" no MESMO OR, então
// "provider sem consulta" liberava proceed:true mesmo numa RETRY. Provider
// sem capacidade de consulta NUNCA pode significar "autorizado a emitir de
// novo" quando já existe tentativa anterior.
// ---------------------------------------------------------------------------

Deno.test("P0-2 (achado Codex) — tentativa anterior + provider SEM consulta -> fail-closed, ZERO POST (não mais proceed:true)", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  const providerSemConsulta = {}; // mock/http/bling, ou focus perdeu a capacidade por engano
  const comTentativaAnterior: FiscalDoc = { ...doc(), tentativas: 0, ja_tentou_emissao_antes: true };

  const gate = await enforceRetrySafeGate(supabase, comTentativaAnterior, providerSemConsulta, "ref-estavel-7", { type: 'mock' }, c);

  assertEquals(gate.proceed, false); // NUNCA proceed:true aqui — este era o bug
  assertEquals(supabase.rpcCalls.length, 1);
  assertEquals(supabase.rpcCalls[0].fn, "fiscal_marcar_erro_normalizado");
  assertEquals(supabase.rpcCalls[0].args.p_error_code, "FISCAL_PROVIDER_SEM_CONSULTA_APOS_TENTATIVA");
  assertEquals(supabase.rpcCalls[0].args.p_retryable, false);
});

// ---------------------------------------------------------------------------
// Sprint C2.10 (P0-1, achado Codex) — identidade do provider (empresa +
// ambiente + provider) persistida por documento.
// ---------------------------------------------------------------------------

Deno.test("computeProviderIdentity — focus inclui ambiente+loja; demais providers só o tipo", () => {
  assertEquals(computeProviderIdentity("focus", "homologacao", "loja-x"), "focus:homologacao:loja-x");
  assertEquals(computeProviderIdentity("focus", "producao", "loja-y"), "focus:producao:loja-y");
  assertEquals(computeProviderIdentity("mock", null, null), "mock");
  assertEquals(computeProviderIdentity("http", null, null), "http");
  assertEquals(computeProviderIdentity("bling", "producao", "loja-x"), "bling"); // ambiente irrelevante fora de focus
});

Deno.test("isRecognizedProviderIdentity — só reconhece formato deste mecanismo, não valor legado (ex.: NFE_PROVIDER_HTTP)", () => {
  assertEquals(isRecognizedProviderIdentity("mock"), true);
  assertEquals(isRecognizedProviderIdentity("focus:homologacao:loja-x"), true);
  assertEquals(isRecognizedProviderIdentity("focus:producao:loja-x"), true);
  assertEquals(isRecognizedProviderIdentity("NFE_PROVIDER_HTTP"), false); // legado, migration 037
  assertEquals(isRecognizedProviderIdentity("focus:staging:loja-x"), false); // ambiente inventado, não confirmado
  assertEquals(isRecognizedProviderIdentity(""), false);
});

Deno.test("validateProviderIdentity — nada congelado (null ou valor legado não reconhecido) -> libera e marca para congelar", () => {
  assertEquals(validateProviderIdentity(null, "focus:homologacao:loja-x"), { ok: true, shouldFreeze: true });
  assertEquals(validateProviderIdentity("NFE_PROVIDER_HTTP", "focus:homologacao:loja-x"), { ok: true, shouldFreeze: true });
});

Deno.test("validateProviderIdentity — congelado bate com o atual -> libera, não precisa recongelar", () => {
  assertEquals(validateProviderIdentity("focus:homologacao:loja-x", "focus:homologacao:loja-x"), { ok: true, shouldFreeze: false });
});

Deno.test("P0-1 (achado Codex) — restart/deploy muda o provider: identidade congelada diverge da atual -> ok:false, fail-closed", () => {
  // Reproduz o caminho do achado: documento tentou sob focus:producao,
  // restart/deploy muda FISCAL_PROVIDER_TYPE para mock (ou FISCAL_ENVIRONMENT
  // para homologacao) — a identidade atual não bate mais com a congelada.
  const check = validateProviderIdentity("focus:producao:loja-x", "mock");
  assertEquals(check.ok, false);
  if (!check.ok) {
    assertEquals(check.frozen, "focus:producao:loja-x");
    assertEquals(check.current, "mock");
  }

  // Mesmo caso, mas trocando só o AMBIENTE (continua "focus", tem
  // consultarDocumento normalmente — por isso P0-2 sozinho não pegaria
  // este caso; precisa da checagem de identidade dedicada).
  const checkAmbiente = validateProviderIdentity("focus:homologacao:loja-x", "focus:producao:loja-x");
  assertEquals(checkAmbiente.ok, false);
});

Deno.test("P0-1 — 1ª tentativa Focus, config muda, retry: enforceRetrySafeGate nunca é alcançado (índex.ts bloqueia antes) — prova via applyProviderIdentityMismatch: zero POST, erro marcado", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  const check = validateProviderIdentity("focus:producao:loja-x", "mock");
  if (check.ok) throw new Error("precondição do teste falhou: deveria ser mismatch");

  await applyProviderIdentityMismatch(supabase, doc(), check, c);

  assertEquals(supabase.rpcCalls.length, 1);
  assertEquals(supabase.rpcCalls[0].fn, "fiscal_marcar_erro_normalizado");
  assertEquals(supabase.rpcCalls[0].args.p_error_code, "FISCAL_PROVIDER_IDENTIDADE_DIVERGENTE");
  assertEquals(supabase.rpcCalls[0].args.p_retryable, false);
  assertEquals((supabase.rpcCalls[0].args.p_error_payload as Record<string, unknown>).frozen, "focus:producao:loja-x");
  assertEquals((supabase.rpcCalls[0].args.p_error_payload as Record<string, unknown>).current, "mock");
  // Nenhuma chamada HTTP possível a partir daqui — index.ts faz `continue`
  // imediatamente após este ponto, antes de resolver credencial ou
  // instanciar qualquer provider (inspeção de código, mesmo padrão de
  // prova composicional já usado para P0-1/query-before-reemit na sprint
  // anterior: aqui provamos que o erro é marcado corretamente; o `continue`
  // em index.ts garante que zero HTTP acontece depois disso).
});

// ---------------------------------------------------------------------------
// Sprint C2.11 (P0-1, achado Codex) — congelamento como PRÉ-CONDIÇÃO FATAL:
// "claim -> resolve provider -> falha ao congelar -> apenas log -> POST"
// não pode mais acontecer. `confirmProviderFreezeOrFailClosed` é o que
// `index.ts` chama logo após o `UPDATE ... .select()` — prova aqui que
// qualquer falha (erro de UPDATE, linha ausente, valor divergente) devolve
// `podeProsseguir: false`.
// ---------------------------------------------------------------------------

Deno.test("P0-1 — congelamento confirmado (UPDATE devolveu o valor esperado) -> podeProsseguir:true, ZERO erro marcado", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  const resultado = await confirmProviderFreezeOrFailClosed(
    supabase,
    doc(),
    "focus:homologacao:loja-x",
    { data: { provider: "focus:homologacao:loja-x" }, error: null },
    c,
  );
  assertEquals(resultado.podeProsseguir, true);
  assertEquals(supabase.rpcCalls.length, 0); // nenhum erro marcado — não há o que confirmar de novo
});

Deno.test("P0-1 (achado Codex) — UPDATE de congelamento falhou (erro) -> fail-closed, POST NUNCA acontece depois disso", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  const resultado = await confirmProviderFreezeOrFailClosed(
    supabase,
    doc(),
    "focus:homologacao:loja-x",
    { data: null, error: { message: "connection reset" } },
    c,
  );
  assertEquals(resultado.podeProsseguir, false); // este é o bug do achado: antes seguia para o POST mesmo assim
  assertEquals(supabase.rpcCalls.length, 1);
  assertEquals(supabase.rpcCalls[0].fn, "fiscal_marcar_erro");
  assertEquals(supabase.rpcCalls[0].args.p_transitorio, true); // recuperável — próxima tentativa refaz o freeze
});

Deno.test("P0-1 — UPDATE não devolveu linha nenhuma (documento sumiu?) -> fail-closed", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  const resultado = await confirmProviderFreezeOrFailClosed(
    supabase,
    doc(),
    "focus:homologacao:loja-x",
    { data: null, error: null },
    c,
  );
  assertEquals(resultado.podeProsseguir, false);
  assertEquals(supabase.rpcCalls[0].fn, "fiscal_marcar_erro");
});

Deno.test("P0-1 — valor persistido diverge do pretendido (checagem paranoica) -> fail-closed", async () => {
  const supabase = fakeSupabase();
  const c = counters();
  const resultado = await confirmProviderFreezeOrFailClosed(
    supabase,
    doc(),
    "focus:homologacao:loja-x",
    { data: { provider: "focus:producao:loja-y" }, error: null }, // valor diferente do pretendido
    c,
  );
  assertEquals(resultado.podeProsseguir, false);
});

// ---------------------------------------------------------------------------
// Sprint C2.11 (P0-1) — handleReconciliar também valida identidade.
// ---------------------------------------------------------------------------

Deno.test("P0-1 — reconciliação com identidade divergente marca erro, nenhuma consulta remota (prova composicional: index.ts retorna antes de instanciar provider)", async () => {
  const supabase = fakeSupabase();
  await applyReconciliarIdentityMismatch(supabase, doc(), { frozen: "focus:producao:loja-x", current: "mock" });
  assertEquals(supabase.rpcCalls.length, 1);
  assertEquals(supabase.rpcCalls[0].fn, "fiscal_marcar_erro_normalizado");
  assertEquals(supabase.rpcCalls[0].args.p_error_code, "FISCAL_PROVIDER_IDENTIDADE_DIVERGENTE");
  assertEquals(supabase.rpcCalls[0].args.p_retryable, false);
});
