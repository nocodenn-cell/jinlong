// Missão final (C3) — orquestração da persistência do XML autorizado.
// Extraída do mesmo jeito que fiscal_worker_orchestration.ts (funções puras/
// testáveis com fake do Supabase client), e deliberadamente um módulo
// SEPARADO: a fila de XML (`fiscal_claim_documentos_xml`) e as RPCs que ela
// usa (`fiscal_marcar_xml_*`) nunca tocam `status`/`provider`/`chave_fiscal`/
// `protocolo`/`tentativas` — o invariante absoluto desta feature é
// "autorização -> EMITIDO -> XML" e "falha de XML nunca volta ao fluxo de
// emissão". Misturar esta lógica com fiscal_worker_orchestration.ts
// arriscaria um dia acoplar os dois fluxos sem querer; manter em módulos
// separados torna esse acoplamento impossível de introduzir por acidente.

import type { FiscalXmlResult } from "./fiscal_types.ts";
import type { FiscalProvider, ProviderConfig } from "./fiscal-provider-adapter.ts";

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export const FISCAL_XML_BUCKET = "documentos-fiscais-xml";

export type XmlDoc = {
  id: string;
  venda_id: string;
  tipo_doc: string;
  provider: string | null;
  correlation_id?: string;
};

export type XmlWorkerCounters = {
  armazenados: string[];
  bloqueados: string[];
  comErro: Array<{ id: string; erro: string }>;
};

/** SHA-256 em hex (minúsculo) — usa Web Crypto (disponível no runtime Deno
 * dos Edge Functions, sem dependência externa). */
export async function sha256Hex(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Path determinístico no bucket privado `documentos-fiscais-xml`:
 * "<identidade_provider_congelada_sanitizada>/<tipo_doc>/<documento_id>.xml".
 * Reaproveita a identidade de provider já imutável (Sprint C2.10/C2.11,
 * coluna `documentos_fiscais_pendentes.provider`) como prefixo — mesmo
 * isolamento loja+ambiente+provider já provado para a emissão, sem
 * introduzir um segundo mecanismo de identidade paralelo. `:` não é um
 * separador válido de path em nenhum backend de Storage S3-compatível,
 * daí a sanitização para `/` (que também deixa o path mais navegável:
 * focus/homologacao/<loja_id>/<tipo_doc>/<documento_id>.xml).
 */
export function computeXmlStoragePath(doc: { id: string; tipo_doc: string }, providerIdentity: string): string {
  const sanitized = providerIdentity.replace(/:/g, "/");
  return `${sanitized}/${doc.tipo_doc}/${doc.id}.xml`;
}

export type ParsedProviderIdentity =
  | { type: "focus"; ambiente: "homologacao" | "producao"; lojaId: string }
  | { type: "mock" | "http" | "bling" };

/** Companheira de `computeProviderIdentity` (fiscal_worker_orchestration.ts)
 * — reconstrói os componentes a partir da identidade congelada de um
 * documento já EMITIDO, para resolver a credencial CORRETA (por documento,
 * não a config global atual do worker) antes de tentar obter o XML. Mesma
 * disciplina do laço principal de emissão (P0-1, C2.10/C2.11): nunca supor
 * que a config atual do deploy é a mesma que processou este documento. */
export function parseProviderIdentity(identity: string | null): ParsedProviderIdentity | null {
  if (!identity) return null;
  if (identity === "mock" || identity === "http" || identity === "bling") {
    return { type: identity };
  }
  const m = /^focus:(homologacao|producao):(.+)$/.exec(identity);
  if (!m) return null;
  return { type: "focus", ambiente: m[1] as "homologacao" | "producao", lojaId: m[2] };
}

/**
 * Processa a obtenção/armazenamento do XML de UM documento já EMITIDO.
 * Nunca chama nenhuma RPC de emissão (`fiscal_marcar_emitido`/
 * `fiscal_marcar_erro*`) — só as 3 RPCs de XML, que por construção não têm
 * `status`/`provider`/`chave_fiscal`/`protocolo`/`tentativas` em seu SET
 * clause (ver migration 20260903150000). Read-only em relação à emissão:
 * `provider.obterXmlAutorizado` é a única chamada externa feita aqui, e seu
 * contrato (fiscal-provider-adapter.ts) é GET-only por construção.
 */
export async function processXmlDocumento(
  supabase: SupabaseLike,
  doc: XmlDoc,
  provider: FiscalProvider,
  ref: string,
  cfg: ProviderConfig,
  counters: XmlWorkerCounters,
): Promise<void> {
  if (!provider.obterXmlAutorizado) {
    await marcarXmlBloqueado(supabase, doc, "PROVIDER_SEM_SUPORTE_XML: este provider não implementa obterXmlAutorizado.", counters);
    return;
  }

  let resultado: FiscalXmlResult;
  try {
    resultado = await provider.obterXmlAutorizado(ref, doc.tipo_doc, cfg);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await marcarXmlErro(supabase, doc, `OBTER_XML_EXCECAO:${msg}`, counters);
    return;
  }

  switch (resultado.kind) {
    case "blocked_external":
      await marcarXmlBloqueado(supabase, doc, resultado.motivo, counters);
      return;
    case "erro_transitorio":
    case "erro_definitivo":
      await marcarXmlErro(supabase, doc, resultado.motivo, counters);
      return;
    case "obtido": {
      if (!doc.provider) {
        // Documento EMITIDO sem identidade de provider congelada (só
        // possível para documentos legados, emitidos antes da Sprint
        // C2.10) — sem identidade não há como montar um path
        // determinístico isolado por loja/ambiente/provider com
        // segurança. Fail-closed permanente (não adianta tentar de novo).
        await marcarXmlBloqueado(supabase, doc, "PROVIDER_IDENTIDADE_DESCONHECIDA_DOCUMENTO_LEGADO", counters);
        return;
      }
      const path = computeXmlStoragePath(doc, doc.provider);
      const hash = await sha256Hex(resultado.xml);
      const { error: uploadErr } = await supabase.storage.from(FISCAL_XML_BUCKET).upload(path, resultado.xml, {
        contentType: "application/xml",
        upsert: true,
      });
      if (uploadErr) {
        await marcarXmlErro(supabase, doc, `UPLOAD_STORAGE_FALHOU:${uploadErr.message}`, counters);
        return;
      }
      const { error: rpcErr } = await supabase.rpc("fiscal_marcar_xml_armazenado", {
        p_documento_id: doc.id,
        p_storage_path: path,
        p_sha256: hash,
      });
      if (rpcErr) {
        // Upload já aconteceu (path determinístico, upsert) — uma próxima
        // tentativa reenvia para o MESMO path (idempotente) e tenta
        // confirmar de novo. Nunca deixa em estado "armazenado sem
        // confirmação": xml_status só some da fila quando a RPC confirma.
        await marcarXmlErro(supabase, doc, `CONFIRMAR_XML_ARMAZENADO_FALHOU:${rpcErr.message}`, counters);
        return;
      }
      counters.armazenados.push(doc.id);
      return;
    }
  }
}

async function marcarXmlBloqueado(supabase: SupabaseLike, doc: XmlDoc, motivo: string, counters: XmlWorkerCounters): Promise<void> {
  const { error } = await supabase.rpc("fiscal_marcar_xml_bloqueado", { p_documento_id: doc.id, p_motivo: motivo });
  if (error) {
    counters.comErro.push({ id: doc.id, erro: `MARCAR_XML_BLOQUEADO_FALHOU:${error.message}` });
  } else {
    counters.bloqueados.push(doc.id);
  }
}

async function marcarXmlErro(supabase: SupabaseLike, doc: XmlDoc, motivo: string, counters: XmlWorkerCounters): Promise<void> {
  const { error } = await supabase.rpc("fiscal_marcar_xml_erro", { p_documento_id: doc.id, p_erro: motivo });
  if (error) {
    counters.comErro.push({ id: doc.id, erro: `MARCAR_XML_ERRO_FALHOU:${error.message}` });
  } else {
    counters.comErro.push({ id: doc.id, erro: motivo });
  }
}
