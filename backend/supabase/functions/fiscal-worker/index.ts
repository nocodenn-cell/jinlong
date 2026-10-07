import { createClient } from "@supabase/supabase-js";
import { timingSafeEqualSecret } from "../_shared/crypto.ts";
import { classifyFiscalError } from "./fiscal_classify.ts";
import type { FiscalDoc } from "./fiscal_types.ts";
import { isRecord, json } from "./fiscal_http.ts";
import {
  callProvider,
  createFiscalProvider,
  justificativaCancelamentoValida,
  resolveFocusRef,
  type ProviderConfig,
} from "./fiscal-provider-adapter.ts";
import { resolveDeployAmbiente, resolveFocusBaseUrl, resolveFocusCredential } from "./fiscal_credential_resolver.ts";
import {
  applyCredentialResolutionFailure,
  applyFocusRemoteState,
  processarCancelamento,
  resolverEstadoEmissao,
  applyProviderIdentityMismatch,
  applyReconciliarIdentityMismatch,
  computeProviderIdentity,
  confirmProviderFreezeOrFailClosed,
  enforceRetrySafeGate,
  extractLojaId,
  validateProviderIdentity,
  type WorkerCounters,
} from "./fiscal_worker_orchestration.ts";
import {
  parseProviderIdentity,
  processXmlDocumento,
  type XmlArtefato,
  type XmlDoc,
  type XmlWorkerCounters,
} from "./fiscal_xml_orchestration.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const workerKey = Deno.env.get("FISCAL_WORKER_KEY");
  const gotKey = req.headers.get("X-FISCAL-WORKER-KEY")?.trim();
  if (!workerKey?.trim() || !gotKey || !(await timingSafeEqualSecret(workerKey, gotKey))) {
    return json(401, { ok: false, error: "UNAUTHORIZED" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    return json(500, { ok: false, error: "MISSING_SUPABASE_ENV" });
  }
  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  // Achado de revisão (Codex): o corpo de uma Request só pode ser lido uma
  // vez — `req.clone()` lança `TypeError: Body is unusable` se chamado
  // depois que o corpo original já foi consumido (confirmado empiricamente
  // nesta sessão). O código anterior lia `req.json()` aqui para `limit` e
  // só DEPOIS tentava `req.clone()` dentro de `readReconciliarDocumentoId`
  // — o clone sempre lançava, sempre caía no catch, `mode: "reconciliar"`
  // nunca funcionava de verdade (silenciosamente caía no laço normal de
  // claim/emissão). Corrigido: o corpo é lido UMA vez aqui, e o objeto já
  // parseado é reaproveitado tanto para `limit` quanto para a detecção de
  // reconciliação — sem clone nenhum.
  const parsedBody: unknown = await req.json().catch(() => ({}));

  let limit = 20;
  if (isRecord(parsedBody) && typeof parsedBody.limit === "number" && Number.isFinite(parsedBody.limit)) {
    limit = Math.max(1, Math.min(100, Math.floor(parsedBody.limit)));
  }

  const providerType = (Deno.env.get("FISCAL_PROVIDER_TYPE") ?? "mock").toLowerCase() as ProviderConfig["type"];
  const providerUrl = Deno.env.get("FISCAL_PROVIDER_URL") ?? "";
  const providerToken = Deno.env.get("FISCAL_PROVIDER_TOKEN") ?? null;
  const timeoutMsRaw = Number(Deno.env.get("FISCAL_PROVIDER_TIMEOUT_MS") ?? "10000");
  const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
    ? Math.floor(timeoutMsRaw)
    : 10000;

  // Mecanismo legado (mock/http/bling) — inalterado desde antes da C2. Só
  // usado quando o tipo efetivo NÃO é "focus" (ver resolução por documento
  // abaixo, C2.1). FISCAL_PROVIDER_URL/FISCAL_PROVIDER_TOKEN nunca são lidos
  // no caminho "focus" — não há fallback silencioso possível.
  const legacyProviderConfig: ProviderConfig = {
    type: providerType,
    url: providerUrl || undefined,
    token: providerToken || undefined,
    timeout: timeoutMs,
  };

  if (providerType === "http" && !providerUrl.trim()) {
    return json(500, { ok: false, error: "MISSING_PROVIDER_URL" });
  }

  // C2.2 — ambiente é validado ANTES de qualquer claim/HTTP quando o worker
  // opera em modo "focus". URL base nunca vem de env var livre nem de
  // payload/domínio — só da ambiente confirmada aqui (ver resolveFocusBaseUrl).
  let deployAmbiente: "homologacao" | "producao" | null = null;
  if (providerType === "focus") {
    deployAmbiente = resolveDeployAmbiente(Deno.env.get("FISCAL_ENVIRONMENT"));
    if (!deployAmbiente) {
      return json(500, { ok: false, error: "FISCAL_AMBIENTE_INVALIDO" });
    }
  }

  // C2.8 — reconciliação: modo explícito, capacidade separada do laço de
  // claim/emissão abaixo. Não confundir com o reaper (recuperação de
  // processamento local preso, já existente) — aqui é descoberta do estado
  // REMOTO via consulta, aplicada às mesmas RPCs/máquina de estados de sempre.
  const reconciliarId = readReconciliarDocumentoId(parsedBody);
  if (reconciliarId) {
    return await handleReconciliar(supabase, reconciliarId, providerType, deployAmbiente, legacyProviderConfig, timeoutMs);
  }

  // Sprint P0 Focus — cancelamento fiscal: modo explícito, por documento
  // (mesmo padrão da reconciliação). Nunca acionado pelo laço de emissão.
  const cancelar = readCancelarPedido(parsedBody);
  if (cancelar) {
    return await handleCancelar(supabase, cancelar, providerType, deployAmbiente, legacyProviderConfig, timeoutMs);
  }

  const { data: docs, error: claimErr } = await supabase.rpc("fiscal_claim_documentos", {
    p_limit: limit,
  });
  if (claimErr) {
    return json(500, { ok: false, error: `CLAIM_ERROR:${claimErr.message}` });
  }

  const processed: string[] = [];
  const counters: WorkerCounters = { emitted: [], failed: [], retried: [] };

  for (const raw of (docs ?? []) as Array<Record<string, unknown>>) {
    const doc: FiscalDoc = {
      id: String(raw.id),
      venda_id: String(raw.venda_id),
      tipo_doc: String(raw.tipo_doc),
      tentativas: typeof raw.tentativas === "number" ? raw.tentativas : 0,
      // P0-1 (sprint C2.9): sinal durável de "já reclamado antes", nunca
      // resetado por reaper/DLQ/reprocessamento — ver fiscal_types.ts.
      ja_tentou_emissao_antes: raw.ja_tentou_emissao_antes === true,
      correlation_id: typeof raw.correlation_id === "string" ? raw.correlation_id : undefined,
      payload: raw.payload && isRecord(raw.payload) ? raw.payload : null,
    };
    processed.push(doc.id);

    // P0-1 (sprint C2.10, achado Codex) — identidade do provider (empresa +
    // ambiente + provider) é persistida por documento e validada ANTES de
    // qualquer resolução de credencial/HTTP. Um documento com tentativa
    // anterior sob uma identidade diferente da config atual (restart/deploy
    // trocou FISCAL_PROVIDER_TYPE, FISCAL_ENVIRONMENT, ou a config
    // multiempresa da loja) é bloqueado aqui — nunca tenta "coincidentemente
    // funcionar" sob a config nova, nunca cai para outro provider.
    const lojaIdAtual = extractLojaId(doc.payload);
    const identidadeAtual = computeProviderIdentity(providerType, deployAmbiente, lojaIdAtual);
    const frozenProvider = typeof raw.provider === "string" ? raw.provider : null;
    const idCheck = validateProviderIdentity(frozenProvider, identidadeAtual);
    if (!idCheck.ok) {
      await applyProviderIdentityMismatch(supabase, doc, idCheck, counters);
      continue;
    }

    // C2.1 — resolução de credencial multiempresa (só quando o worker está em
    // modo "focus"; mock/http/bling seguem 100% no mecanismo legado abaixo,
    // sem nenhuma mudança de comportamento).
    let cfg: ProviderConfig = legacyProviderConfig;
    if (providerType === "focus") {
      const cred = await resolveFocusCredential(supabase, lojaIdAtual, deployAmbiente);
      if (!cred.ok) {
        // Fail closed: zero HTTP para este documento. Nunca loga o token —
        // só o código de erro (nome, não valor).
        await applyCredentialResolutionFailure(supabase, doc, cred.code, counters);
        continue;
      }
      cfg = { type: "focus", token: cred.token, url: resolveFocusBaseUrl(cred.ambiente), timeout: timeoutMs };
    }

    const provider = createFiscalProvider(cfg);

    // P0-1 (sprint C2.11, achado Codex): congelar a identidade não é
    // suficiente só como "melhor esforço" — é PRÉ-CONDIÇÃO FATAL para o
    // POST. `UPDATE ... .select()` devolve a linha realmente persistida;
    // `confirmProviderFreezeOrFailClosed` LÊ essa confirmação e só libera
    // prosseguir se o valor gravado bate com o pretendido. Antes, uma
    // falha no UPDATE só virava `console.error` e o laço seguia para o
    // POST mesmo assim — exatamente o bug relatado
    // ("congela falha -> só log -> POST"). Só escreve na 1ª vez — a partir
    // daqui o trigger `tg_documentos_fiscais_estado_bu` (migration
    // 20260903120000) rejeita qualquer tentativa de mudar um valor já
    // reconhecido.
    if (idCheck.shouldFreeze) {
      const freezeResult = await supabase
        .from("documentos_fiscais_pendentes")
        .update({ provider: identidadeAtual })
        .eq("id", doc.id)
        .select("provider")
        .maybeSingle();
      const confirm = await confirmProviderFreezeOrFailClosed(supabase, doc, identidadeAtual, freezeResult, counters);
      if (!confirm.podeProsseguir) continue;
    }

    // C2.7 — retry seguro: em qualquer tentativa que não seja a primeira,
    // consultar o estado remoto ANTES de reemitir. Só documentos NÃO
    // encontrados na Focus prosseguem para um novo POST. Extraído para
    // `enforceRetrySafeGate` (sprint de convergência) para ser provado por
    // teste executável, não só por inspeção — comportamento inalterado.
    const gate = await enforceRetrySafeGate(supabase, doc, provider, resolveFocusRef(doc), cfg, counters);
    if (!gate.proceed) continue;

    // C2.6 — NF-e: 3 estados possíveis (201 autorizado / 202 processando /
    // erro). Reaproveita EM_PROCESSAMENTO já existente para "processando" —
    // nenhuma RPC é chamada nesse caso (ver applyFocusRemoteState).
    //
    // Sprint P0 Focus — NFC-e também passa por aqui: o `status` devolvido
    // pela Focus (autorizado/processando_autorizacao/erro_autorizacao/
    // cancelado/denegado) é aplicado sem ser achatado em 2 estados, e
    // `already_processed` é resolvido consultando a MESMA referência.
    if (provider.emitirDocumento) {
      const ref = resolveFocusRef(doc);
      const estadoPost = await provider.emitirDocumento(doc, cfg);
      const estado = await resolverEstadoEmissao(doc, estadoPost, provider, ref, cfg);
      await applyFocusRemoteState(supabase, doc, estado, counters);
      continue;
    }

    // Fluxo existente (NFC-e/STUB via callProvider — 2 estados; mock/http/
    // bling) — inalterado desde antes da C2.
    const result = await callProvider(doc, cfg);

    if (result.ok) {
      // Achado de revisão (Codex): `fiscal_marcar_emitido` faz
      // `payload = COALESCE(p_payload, payload)` (migration 065, anterior
      // ao snapshot fiscal imutável de C1) — passar a resposta do provider
      // aqui SOBRESCREVIA o snapshot congelado (loja_id, itens, pagamentos,
      // emitente, classificação fiscal) com o JSON de resposta da Focus,
      // destruindo justamente o artefato de auditoria que C1 existe para
      // proteger, e quebrando reconciliação futura (que depende da
      // identidade `focus:<ambiente>:<loja>` derivada do snapshot). A
      // resposta do provider já não tem nenhum uso — `chave_fiscal`/
      // `protocolo`/`provider_ref` (as únicas partes realmente relevantes)
      // já têm colunas próprias. Nunca passa payload aqui — o COALESCE
      // preserva o snapshot original.
      const { error } = await supabase.rpc("fiscal_marcar_emitido", {
        p_documento_id: doc.id,
        p_chave_fiscal: result.chave_fiscal,
        p_protocolo: result.protocolo,
        p_provider_ref: result.provider_ref ?? null,
        p_payload: null,
      });
      if (error) {
        counters.failed.push({ id: doc.id, erro: `MARCAR_EMITIDO_ERROR:${error.message}` });
        const { error: retryErr } = await supabase.rpc("fiscal_marcar_erro", {
          p_documento_id: doc.id,
          p_erro: `MARCAR_EMITIDO_ERROR:${error.message}`,
          p_transitorio: true,
        });
        if (retryErr) {
          console.error(
            JSON.stringify({
              scope: "fiscal-worker",
              event: "fiscal_marcar_erro_failed",
              correlation_id: doc.correlation_id ?? null,
              documento_id: doc.id,
              message: retryErr.message,
            }),
          );
        } else {
          const { data: row } = await supabase
            .from("documentos_fiscais_pendentes")
            .select("proxima_tentativa_em")
            .eq("id", doc.id)
            .maybeSingle();
          counters.retried.push({
            id: doc.id,
            proxima_tentativa: row?.proxima_tentativa_em ?? null,
          });
        }
      } else {
        counters.emitted.push(doc.id);
      }
    } else if (result.transitorio) {
      const { error: retryErr } = await supabase.rpc("fiscal_marcar_erro", {
        p_documento_id: doc.id,
        p_erro: result.erro,
        p_transitorio: true,
      });
      if (retryErr) {
        counters.failed.push({ id: doc.id, erro: `MARCAR_ERRO:${retryErr.message}` });
      } else {
        const { data: row } = await supabase
          .from("documentos_fiscais_pendentes")
          .select("proxima_tentativa_em")
          .eq("id", doc.id)
          .maybeSingle();
        counters.retried.push({
          id: doc.id,
          proxima_tentativa: row?.proxima_tentativa_em ?? null,
        });
      }
    } else {
      counters.failed.push({ id: doc.id, erro: result.erro });
      const normalized = classifyFiscalError({
        erro: result.erro,
        transitorio: result.transitorio,
        httpStatus: result.http_status,
        providerCode: result.provider_code,
        providerMessage: result.provider_message,
        payload: result.payload,
      });
      const { error: normErr } = await supabase.rpc("fiscal_marcar_erro_normalizado", {
        p_documento_id: doc.id,
        p_erro: result.erro,
        p_transitorio: false,
        p_error_code: normalized.error_code,
        p_error_category: normalized.error_category,
        p_action_hint: normalized.action_hint,
        p_retryable: false,
        p_next_step_url: normalized.next_step_url,
        p_error_payload: normalized.details,
      });
      if (normErr) {
        console.error(
          JSON.stringify({
            scope: "fiscal-worker",
            event: "fiscal_marcar_erro_normalizado_failed",
            correlation_id: doc.correlation_id ?? null,
            documento_id: doc.id,
            message: normErr.message,
          }),
        );
      }
    }
  }

  // C3 (missão final) — passo de persistência de XML, completamente
  // desacoplado do laço de emissão acima: fila própria
  // (`fiscal_claim_documentos_xml`, só EMITIDO+xml_status PENDENTE/ERRO),
  // RPCs próprias que nunca tocam `status`/`provider`/`chave_fiscal`/
  // `protocolo`/`tentativas`. Roda na mesma invocação por simplicidade
  // operacional (mesmo cron/URL aciona os dois), mas uma falha aqui nunca
  // influencia o resultado/contadores do laço de emissão acima (já
  // retornado a esta altura só faltando incluir no JSON de resposta).
  const xmlCounters: XmlWorkerCounters = { armazenados: [], bloqueados: [], comErro: [], ignoradosPorConcorrencia: [] };
  // Hotfix concorrência (missão final) — claim agora atribui um lease
  // durável (xml_lease_token); toda RPC de confirmação/erro/bloqueio abaixo
  // exige esse token e é ignorada se ele não for mais o vigente (outro
  // worker já resolveu o documento). Ver fiscal_xml_orchestration.ts.
  const xmlFila = await processarFilaXml(supabase, "AUTORIZACAO", limit, xmlCounters, providerUrl, providerToken, timeoutMs);
  // Sprint P0 Focus — XML de cancelamento: fila, colunas e path próprios.
  const xmlCancCounters: XmlWorkerCounters = { armazenados: [], bloqueados: [], comErro: [], ignoradosPorConcorrencia: [] };
  const xmlCancFila = await processarFilaXml(supabase, "CANCELAMENTO", limit, xmlCancCounters, providerUrl, providerToken, timeoutMs);

  return json(200, {
    ok: true,
    provider_type: providerType,
    claimed: (docs ?? []).length,
    processed,
    emitted: counters.emitted,
    failed: counters.failed,
    retried: counters.retried,
    xml: {
      claimed: xmlFila.claimed,
      armazenados: xmlCounters.armazenados,
      bloqueados: xmlCounters.bloqueados,
      com_erro: xmlCounters.comErro,
      ignorados_por_concorrencia: xmlCounters.ignoradosPorConcorrencia,
      // Achado de revisão (Codex): antes, um erro na própria RPC de claim
      // (permissão/schema-cache/transporte) era silenciosamente tratado
      // como "fila vazia" — a resposta continuava `ok:true` com
      // `xml.claimed:0`, indistinguível de "nada a processar". Um monitor
      // externo via essa chamada nunca saberia que o passo de XML parou de
      // funcionar. Superfície explícita do erro, sem afetar `ok`/status do
      // laço de emissão acima (que já terminou e não é afetado por isto).
      claim_error: xmlFila.claimError,
    },
    xml_cancelamento: {
      claimed: xmlCancFila.claimed,
      armazenados: xmlCancCounters.armazenados,
      bloqueados: xmlCancCounters.bloqueados,
      com_erro: xmlCancCounters.comErro,
      ignorados_por_concorrencia: xmlCancCounters.ignoradosPorConcorrencia,
      claim_error: xmlCancFila.claimError,
    },
  });
});

/**
 * Passo de XML (C3) — fila desacoplada da emissão. Sprint P0 Focus: mesma
 * rotina para os dois artefatos (AUTORIZACAO e CANCELAMENTO), cada um com sua
 * fila/RPCs/colunas; credencial resolvida POR DOCUMENTO a partir da
 * identidade congelada. O download do link Focus não usa a credencial (link
 * sem autenticação); ela só é usada se for preciso consultar a referência.
 */
async function processarFilaXml(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  artefato: XmlArtefato,
  limit: number,
  xmlCounters: XmlWorkerCounters,
  providerUrl: string,
  providerToken: string | null,
  timeoutMs: number,
): Promise<{ claimed: number; claimError: string | null }> {
  const claimRpc = artefato === "CANCELAMENTO" ? "fiscal_claim_documentos_xml_cancelamento" : "fiscal_claim_documentos_xml";
  const bloqueadoRpc = artefato === "CANCELAMENTO" ? "fiscal_marcar_xml_cancelamento_bloqueado" : "fiscal_marcar_xml_bloqueado";
  const erroRpc = artefato === "CANCELAMENTO" ? "fiscal_marcar_xml_cancelamento_erro" : "fiscal_marcar_xml_erro";
  const { data: xmlDocs, error: xmlClaimErr } = await supabase.rpc(claimRpc, { p_limit: limit });
  if (xmlClaimErr) return { claimed: 0, claimError: xmlClaimErr.message };

  for (const raw of (xmlDocs ?? []) as Array<Record<string, unknown>>) {
    const leaseRaw = artefato === "CANCELAMENTO" ? raw.xml_cancelamento_lease_token : raw.xml_lease_token;
    const caminhoRaw = artefato === "CANCELAMENTO" ? raw.focus_xml_cancelamento_path : raw.focus_xml_path;
    const xmlDoc: XmlDoc = {
      id: String(raw.id),
      venda_id: String(raw.venda_id),
      tipo_doc: String(raw.tipo_doc),
      provider: typeof raw.provider === "string" ? raw.provider : null,
      correlation_id: typeof raw.correlation_id === "string" ? raw.correlation_id : undefined,
      lease_token: String(leaseRaw),
      focus_xml_path: typeof caminhoRaw === "string" ? caminhoRaw : null,
    };
    const parsed = parseProviderIdentity(xmlDoc.provider);
    if (!parsed) {
      const { data: aplicado, error } = await supabase.rpc(bloqueadoRpc, {
        p_documento_id: xmlDoc.id,
        p_motivo: "PROVIDER_IDENTIDADE_NAO_RECONHECIDA_DOCUMENTO_LEGADO",
        p_lease_token: xmlDoc.lease_token,
      });
      if (error) xmlCounters.comErro.push({ id: xmlDoc.id, erro: `MARCAR_XML_BLOQUEADO_FALHOU:${error.message}` });
      else if (aplicado) xmlCounters.bloqueados.push(xmlDoc.id);
      else xmlCounters.ignoradosPorConcorrencia.push(xmlDoc.id);
      continue;
    }

    let xmlCfg: ProviderConfig;
    if (parsed.type === "focus") {
      const cred = await resolveFocusCredential(supabase, parsed.lojaId, parsed.ambiente);
      if (!cred.ok) {
        const { data: aplicado, error } = await supabase.rpc(erroRpc, {
          p_documento_id: xmlDoc.id,
          p_erro: `CREDENCIAL_INDISPONIVEL:${cred.code}`,
          p_lease_token: xmlDoc.lease_token,
        });
        if (error) xmlCounters.comErro.push({ id: xmlDoc.id, erro: `MARCAR_XML_ERRO_FALHOU:${error.message}` });
        else if (aplicado) xmlCounters.comErro.push({ id: xmlDoc.id, erro: `CREDENCIAL_INDISPONIVEL:${cred.code}` });
        else xmlCounters.ignoradosPorConcorrencia.push(xmlDoc.id);
        continue;
      }
      xmlCfg = { type: "focus", token: cred.token, url: resolveFocusBaseUrl(cred.ambiente), timeout: timeoutMs };
    } else {
      xmlCfg = { type: parsed.type, url: providerUrl || undefined, token: providerToken || undefined, timeout: timeoutMs };
    }

    const xmlProvider = createFiscalProvider(xmlCfg);
    await processXmlDocumento(supabase, xmlDoc, xmlProvider, resolveFocusRef(xmlDoc), xmlCfg, xmlCounters, artefato);
  }
  return { claimed: (xmlDocs ?? []).length, claimError: null };
}

type PedidoCancelamento = { documento_id: string; justificativa: string };

/** Sprint P0 Focus — `{ mode: "cancelar", documento_id, justificativa }`. */
function readCancelarPedido(body: unknown): PedidoCancelamento | null {
  if (
    isRecord(body) && body.mode === "cancelar" &&
    typeof body.documento_id === "string" && body.documento_id.trim() !== "" &&
    typeof body.justificativa === "string"
  ) {
    return { documento_id: body.documento_id, justificativa: body.justificativa };
  }
  return null;
}

/**
 * Sprint P0 Focus — cancelamento de UM documento EMITIDO. Sequência:
 * identidade congelada validada -> credencial da loja -> lease
 * (`fiscal_iniciar_cancelamento`: no máximo um pedido em andamento) ->
 * consulta prévia se já houve tentativa -> DELETE pela mesma referência ->
 * `cancelado` confirma (CANCELADO + XML de cancelamento enfileirado); qualquer
 * outra resposta mantém EMITIDO e registra o erro. O XML da autorização não é
 * tocado.
 */
async function handleCancelar(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  pedido: PedidoCancelamento,
  providerType: ProviderConfig["type"],
  deployAmbiente: "homologacao" | "producao" | null,
  legacyProviderConfig: ProviderConfig,
  timeoutMs: number,
): Promise<Response> {
  if (!justificativaCancelamentoValida(pedido.justificativa)) {
    return json(400, { ok: false, error: "JUSTIFICATIVA_INVALIDA" });
  }
  const { data: raw, error: fetchErr } = await supabase
    .from("documentos_fiscais_pendentes")
    .select("id, venda_id, tipo_doc, payload, status, provider")
    .eq("id", pedido.documento_id)
    .maybeSingle();
  if (fetchErr || !raw) {
    return json(404, { ok: false, error: "DOCUMENTO_NAO_ENCONTRADO" });
  }

  const lojaId = extractLojaId(raw.payload && isRecord(raw.payload) ? raw.payload : null);
  const identidadeAtual = computeProviderIdentity(providerType, deployAmbiente, lojaId);
  const frozenProvider = typeof raw.provider === "string" ? raw.provider : null;
  const idCheck = validateProviderIdentity(frozenProvider, identidadeAtual);
  if (!idCheck.ok || idCheck.shouldFreeze) {
    // Cancelar exige identidade já congelada e igual à atual (o documento foi
    // emitido por ESTA empresa/ambiente/provider) — nunca congela aqui.
    return json(409, { ok: false, error: "IDENTIDADE_PROVIDER_DIVERGENTE_OU_AUSENTE" });
  }

  let cfg: ProviderConfig = legacyProviderConfig;
  if (providerType === "focus") {
    const cred = await resolveFocusCredential(supabase, lojaId, deployAmbiente);
    if (!cred.ok) return json(200, { ok: true, documento_id: raw.id, resultado: "erro_credencial", detalhe: cred.code });
    cfg = { type: "focus", token: cred.token, url: resolveFocusBaseUrl(cred.ambiente), timeout: timeoutMs };
  }

  const { data: inicio, error: iniErr } = await supabase.rpc("fiscal_iniciar_cancelamento", {
    p_documento_id: raw.id,
    p_justificativa: pedido.justificativa,
  });
  if (iniErr) return json(409, { ok: false, error: `CANCELAMENTO_RECUSADO:${iniErr.message}` });
  const linha = Array.isArray(inicio) ? inicio[0] : inicio;
  if (!linha || linha.resultado === "JA_CANCELADO") {
    return json(200, { ok: true, documento_id: raw.id, resultado: "ja_cancelado" });
  }
  if (linha.resultado !== "INICIADO" || !linha.cancelamento_lease_token) {
    return json(200, { ok: true, documento_id: raw.id, resultado: "em_andamento" });
  }

  const provider = createFiscalProvider(cfg);
  const ref = resolveFocusRef({ id: String(raw.id), venda_id: String(raw.venda_id) });
  const r = await processarCancelamento(
    supabase,
    {
      id: String(raw.id),
      venda_id: String(raw.venda_id),
      tipo_doc: String(raw.tipo_doc),
      lease_token: String(linha.cancelamento_lease_token),
      tentativas_anteriores: Number(linha.cancelamento_tentativas_anteriores ?? 0),
    },
    provider,
    ref,
    pedido.justificativa,
    cfg,
  );
  return json(200, { ok: true, documento_id: raw.id, resultado: r.resultado, erro: r.erro ?? null });
}

/** Recebe o corpo JÁ PARSEADO (uma Request só pode ter o corpo lido uma
 * vez — ver comentário no chamador) — nunca lê a Request diretamente. */
function readReconciliarDocumentoId(body: unknown): string | null {
  if (isRecord(body) && body.mode === "reconciliar" && typeof body.documento_id === "string" && body.documento_id.trim() !== "") {
    return body.documento_id;
  }
  return null;
}

/**
 * C2.8 — reconciliação explícita, por documento, sob demanda (chamada
 * separada do laço de claim/emissão). Fluxo: DocumentoFiscal local ->
 * referência -> FiscalProvider (consulta, nunca emite) -> resultado canônico
 * -> mesma RPC/máquina de estados já usada em todo o resto do worker -> mesma
 * auditoria automática (triggers de documentos_fiscais_eventos, já
 * existentes). Não agenda nada — é chamada explícita (painel/gerente, ou uma
 * automação externa a definir fora desta onda).
 */
async function handleReconciliar(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  documentoId: string,
  providerType: ProviderConfig["type"],
  deployAmbiente: "homologacao" | "producao" | null,
  legacyProviderConfig: ProviderConfig,
  timeoutMs: number,
): Promise<Response> {
  const { data: raw, error: fetchErr } = await supabase
    .from("documentos_fiscais_pendentes")
    .select("id, venda_id, tipo_doc, tentativas, correlation_id, payload, status, provider")
    .eq("id", documentoId)
    .maybeSingle();
  if (fetchErr || !raw) {
    return json(404, { ok: false, error: "DOCUMENTO_NAO_ENCONTRADO" });
  }

  const doc: FiscalDoc = {
    id: String(raw.id),
    venda_id: String(raw.venda_id),
    tipo_doc: String(raw.tipo_doc),
    tentativas: typeof raw.tentativas === "number" ? raw.tentativas : 0,
    correlation_id: typeof raw.correlation_id === "string" ? raw.correlation_id : undefined,
    payload: raw.payload && isRecord(raw.payload) ? raw.payload : null,
  };

  // P0-1 (sprint C2.11, achado Codex): reconciliação nunca pode consultar
  // sob empresa/ambiente/provider diferentes da identidade já congelada do
  // documento usando só a configuração atual — mesma checagem do laço
  // principal (`validateProviderIdentity`), aplicada aqui antes de
  // qualquer resolução de credencial/consulta remota.
  const lojaId = extractLojaId(doc.payload);
  const identidadeAtual = computeProviderIdentity(providerType, deployAmbiente, lojaId);
  const frozenProvider = typeof raw.provider === "string" ? raw.provider : null;
  const idCheck = validateProviderIdentity(frozenProvider, identidadeAtual);
  if (!idCheck.ok) {
    await applyReconciliarIdentityMismatch(supabase, doc, idCheck);
    return json(200, { ok: true, documento_id: doc.id, resultado: "erro_identidade_divergente", detalhe: idCheck });
  }

  let cfg: ProviderConfig = legacyProviderConfig;
  if (providerType === "focus") {
    const cred = await resolveFocusCredential(supabase, lojaId, deployAmbiente);
    if (!cred.ok) {
      const counters: WorkerCounters = { emitted: [], failed: [], retried: [] };
      await applyCredentialResolutionFailure(supabase, doc, cred.code, counters);
      return json(200, { ok: true, documento_id: doc.id, resultado: "erro_credencial", detalhe: cred.code });
    }
    cfg = { type: "focus", token: cred.token, url: resolveFocusBaseUrl(cred.ambiente), timeout: timeoutMs };
  }

  const provider = createFiscalProvider(cfg);
  if (!provider.consultarDocumento) {
    return json(400, { ok: false, error: "PROVIDER_SEM_CONSULTA" });
  }

  const ref = resolveFocusRef(doc);
  const estado = await provider.consultarDocumento(ref, doc.tipo_doc, cfg);
  const counters: WorkerCounters = { emitted: [], failed: [], retried: [] };
  await applyFocusRemoteState(supabase, doc, estado, counters);

  return json(200, { ok: true, documento_id: doc.id, resultado: estado.kind });
}
