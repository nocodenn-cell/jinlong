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
//
// Hotfix (achado da auditoria independente do Codex, missão final) —
// concorrência entre workers podia sobrescrever um XML já ARMAZENADO e
// regredir o estado para ERRO. Fechado em duas camadas independentes:
//   1. Posse durável (lease) — `fiscal_claim_documentos_xml` (migration
//      20260903170000) agora faz um UPDATE real com `xml_lease_token`; toda
//      chamada de confirmação/erro/bloqueio EXIGE esse token e é ignorada
//      (não aplicada) se ele não for mais o vigente.
//   2. Storage create-only — upload sempre com `upsert:false` (o default do
//      Storage do Supabase já falha com 409/"Duplicate" se o path existe,
//      confirmado empiricamente contra o stack local). Conflito nunca vira
//      overwrite: baixa o conteúdo existente, compara hash — igual reconcilia
//      idempotentemente, diferente é fail-closed (nunca sobrescreve).
//      Achado adicional (prova de concorrência real,
//      `backend/scripts/test-fiscal-xml-concorrencia.ts`): o Storage local
//      não demonstrou atomicidade perfeita de create-only sob concorrência
//      GENUÍNA (duas requisições realmente simultâneas para um path novo
//      podem ambas reportar sucesso) — por isso, `error === null` do
//      `upload()` NUNCA é tratado como prova de posse exclusiva do blob;
//      toda chamada, tenha o upload "sucedido" ou batido em conflito, lê de
//      volta o que está de fato persistido e só confirma na RPC o hash
//      REAL verificado.

import type { FiscalXmlResult } from "./fiscal_types.ts";
import { isWellFormedXml, type FiscalProvider, type ProviderConfig } from "./fiscal-provider-adapter.ts";

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export const FISCAL_XML_BUCKET = "documentos-fiscais-xml";

export type XmlDoc = {
  id: string;
  venda_id: string;
  tipo_doc: string;
  provider: string | null;
  correlation_id?: string;
  /** Token do lease de processamento (fiscal_claim_documentos_xml) — exigido
   * por toda RPC de confirmação/erro/bloqueio; prova de posse vigente. */
  lease_token: string;
  /** Sprint P0 Focus — referência ORIGINAL devolvida pela Focus
   * (`caminho_xml_nota_fiscal` para AUTORIZACAO, `caminho_xml_cancelamento`
   * para CANCELAMENTO). NULL quando ainda não persistida. */
  focus_xml_path?: string | null;
};

/** Sprint P0 Focus — os dois artefatos XML são distintos e têm fila, colunas
 * e path próprios: o XML de cancelamento nunca sobrescreve o da autorização. */
export type XmlArtefato = "AUTORIZACAO" | "CANCELAMENTO";

const RPCS_XML: Record<XmlArtefato, { armazenado: string; bloqueado: string; erro: string }> = {
  AUTORIZACAO: {
    armazenado: "fiscal_marcar_xml_armazenado",
    bloqueado: "fiscal_marcar_xml_bloqueado",
    erro: "fiscal_marcar_xml_erro",
  },
  CANCELAMENTO: {
    armazenado: "fiscal_marcar_xml_cancelamento_armazenado",
    bloqueado: "fiscal_marcar_xml_cancelamento_bloqueado",
    erro: "fiscal_marcar_xml_cancelamento_erro",
  },
};

export type XmlWorkerCounters = {
  armazenados: string[];
  bloqueados: string[];
  comErro: Array<{ id: string; erro: string }>;
  /** Hotfix concorrência — chamadas cujo lease já estava obsoleto (outro
   * worker resolveu o documento primeiro) ou que caíram sobre um estado já
   * terminal. Nada foi corrompido; só não foi ESTA chamada que decidiu o
   * resultado final. Contado separado para não confundir com falha real. */
  ignoradosPorConcorrencia: string[];
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
export function computeXmlStoragePath(
  doc: { id: string; tipo_doc: string },
  providerIdentity: string,
  artefato: XmlArtefato = "AUTORIZACAO",
): string {
  const sanitized = providerIdentity.replace(/:/g, "/");
  const sufixo = artefato === "CANCELAMENTO" ? "-cancelamento" : "";
  return `${sanitized}/${doc.tipo_doc}/${doc.id}${sufixo}.xml`;
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

/** Detecta o conflito "já existe" do Storage do Supabase (upload com
 * `upsert:false` sobre um path ocupado) — confirmado empiricamente contra o
 * stack local: `{statusCode:"409", error:"Duplicate", message:"The resource
 * already exists"}`. Checa `statusCode` (mais estável) com fallback na
 * mensagem, caso a forma exata do erro varie entre versões do client. */
function isStorageDuplicateConflict(error: { message?: string; statusCode?: string | number } | null): boolean {
  if (!error) return false;
  if (String(error.statusCode) === "409") return true;
  return /already exists|duplicate/i.test(error.message ?? "");
}

/**
 * Processa a obtenção/armazenamento do XML de UM documento já EMITIDO.
 * Nunca chama nenhuma RPC de emissão (`fiscal_marcar_emitido`/
 * `fiscal_marcar_erro*`) — só as 3 RPCs de XML, que por construção não têm
 * `status`/`provider`/`chave_fiscal`/`protocolo`/`tentativas` em seu SET
 * clause (ver migration 20260903150000/20260903170000). Read-only em
 * relação à emissão: `provider.obterXmlAutorizado` é a única chamada
 * externa feita aqui, e seu contrato (fiscal-provider-adapter.ts) é
 * GET-only por construção.
 */
export async function processXmlDocumento(
  supabase: SupabaseLike,
  doc: XmlDoc,
  provider: FiscalProvider,
  ref: string,
  cfg: ProviderConfig,
  counters: XmlWorkerCounters,
  artefato: XmlArtefato = "AUTORIZACAO",
): Promise<void> {
  const marcarBloqueado = (motivo: string) => marcarXmlBloqueado(supabase, doc, motivo, counters, artefato);
  const marcarErro = (motivo: string) => marcarXmlErro(supabase, doc, motivo, counters, artefato);

  const obter = artefato === "CANCELAMENTO"
    ? (provider.obterXmlCancelamento
      ? () => provider.obterXmlCancelamento!(doc.focus_xml_path ?? null, ref, doc.tipo_doc, cfg)
      : null)
    : (provider.obterXmlAutorizado
      ? () => provider.obterXmlAutorizado!(ref, doc.tipo_doc, cfg, doc.focus_xml_path ?? null)
      : null);
  if (!obter) {
    await marcarBloqueado(`PROVIDER_SEM_SUPORTE_XML: este provider não obtém o XML de ${artefato}.`);
    return;
  }

  let resultado: FiscalXmlResult;
  try {
    resultado = await obter();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await marcarErro(`OBTER_XML_EXCECAO:${msg}`);
    return;
  }

  switch (resultado.kind) {
    case "blocked_external":
      await marcarBloqueado(resultado.motivo);
      return;
    case "erro_transitorio":
    case "erro_definitivo":
      await marcarErro(resultado.motivo);
      return;
    case "obtido": {
      // Sprint P0 Focus: o conteúdo precisa ser XML bem formado (não só
      // "começar com <") antes de qualquer upload — um HTML de erro, JSON ou
      // corpo truncado nunca vira ARMAZENADO.
      const conteudo = resultado.xml.trim();
      if (!conteudo || !isWellFormedXml(conteudo)) {
        await marcarErro("XML_OBTIDO_VAZIO_OU_INVALIDO");
        return;
      }
      // Referência recuperada por consulta (documento emitido antes de a
      // referência ser persistida): grava o valor original da Focus antes
      // de armazenar, para que a auditoria aponte sempre a origem do XML.
      if (artefato === "AUTORIZACAO" && resultado.caminho_recuperado && !doc.focus_xml_path) {
        const { error: refErr } = await supabase.rpc("fiscal_registrar_referencias_focus", {
          p_documento_id: doc.id,
          p_focus_xml_path: resultado.caminho_recuperado,
          p_focus_danfe_path: resultado.artefatos?.danfe_path ?? null,
          p_focus_qrcode_url: resultado.artefatos?.qrcode_url ?? null,
        });
        if (refErr) {
          await marcarErro(`REGISTRAR_REFERENCIA_FOCUS_FALHOU:${refErr.message}`);
          return;
        }
      }
      if (!doc.provider) {
        // Documento EMITIDO sem identidade de provider congelada (só
        // possível para documentos legados, emitidos antes da Sprint
        // C2.10) — sem identidade não há como montar um path
        // determinístico isolado por loja/ambiente/provider com
        // segurança. Fail-closed permanente (não adianta tentar de novo).
        await marcarBloqueado("PROVIDER_IDENTIDADE_DESCONHECIDA_DOCUMENTO_LEGADO");
        return;
      }
      const path = computeXmlStoragePath(doc, doc.provider, artefato);
      const hash = await sha256Hex(resultado.xml);

      // Hotfix concorrência: create-only. NUNCA upsert — se o path já
      // existe (upload anterior deste worker que não confirmou, ou outro
      // worker que ganhou a corrida), a escrita é recusada pelo próprio
      // Storage (409/"Duplicate") antes de qualquer byte ser sobrescrito.
      const { error: uploadErr } = await supabase.storage.from(FISCAL_XML_BUCKET).upload(path, resultado.xml, {
        contentType: "application/xml",
        upsert: false,
      });

      if (uploadErr && !isStorageDuplicateConflict(uploadErr)) {
        await marcarErro(`UPLOAD_STORAGE_FALHOU:${uploadErr.message}`);
        return;
      }

      // Hotfix concorrência — achado empírico desta própria auditoria: o
      // Storage local do Supabase NÃO demonstrou atomicidade perfeita de
      // create-only sob concorrência genuína (duas requisições realmente
      // simultâneas para um path NOVO podem ambas reportar sucesso — não
      // basta `error === null` como prova de posse exclusiva do blob).
      // Por isso, seja o upload tendo "sucedido" ou tendo batido em
      // conflito (409), a ÚNICA fonte confiável do que está de fato
      // persistido é ler de volta e comparar hash — nunca confiar
      // cegamente no retorno do `upload()`. Isso fecha o buraco onde um
      // worker poderia confirmar (na RPC) um hash que não corresponde ao
      // blob realmente armazenado.
      const { data: existente, error: downloadErr } = await supabase.storage.from(FISCAL_XML_BUCKET).download(path);
      if (downloadErr || !existente) {
        await marcarErro(`VERIFICACAO_POS_UPLOAD_FALHOU:${downloadErr?.message ?? "sem dados"}`);
        return;
      }
      const conteudoReal = await existente.text();
      const hashReal = await sha256Hex(conteudoReal);
      if (hashReal !== hash) {
        // O blob que está de fato no path não é o que esta chamada
        // escreveu/esperava — outra escrita concorrente pousou por cima
        // (conflito real) ou já havia um XML diferente ali. Nunca
        // confirma um hash que não corresponde à realidade; fail-closed,
        // nunca sobrescreve.
        await marcarErro("XML_DIVERGENTE_DE_BLOB_JA_EXISTENTE_NO_PATH");
        return;
      }

      const { data: aplicado, error: rpcErr } = await supabase.rpc(RPCS_XML[artefato].armazenado, {
        p_documento_id: doc.id,
        p_storage_path: path,
        p_sha256: hashReal,
        p_lease_token: doc.lease_token,
      });
      if (rpcErr) {
        // Upload (ou reconciliação) já aconteceu com sucesso — uma próxima
        // tentativa reencontra o MESMO path com o MESMO conteúdo
        // (create-only não deixa isso divergir) e confirma de novo.
        await marcarErro(`CONFIRMAR_XML_ARMAZENADO_FALHOU:${rpcErr.message}`);
        return;
      }
      if (aplicado) {
        counters.armazenados.push(doc.id);
      } else {
        // Lease obsoleto — outro worker já tinha resolvido este documento
        // por outro caminho antes desta chamada confirmar. O blob que ESTA
        // chamada escreveu (só se o path realmente era novo — se era um
        // conflito reconciliado, nem chegou a escrever nada) fica órfão,
        // mas nunca substitui o resultado real do dono do lease vigente.
        counters.ignoradosPorConcorrencia.push(doc.id);
      }
      return;
    }
  }
}

async function marcarXmlBloqueado(
  supabase: SupabaseLike,
  doc: XmlDoc,
  motivo: string,
  counters: XmlWorkerCounters,
  artefato: XmlArtefato,
): Promise<void> {
  const { data: aplicado, error } = await supabase.rpc(RPCS_XML[artefato].bloqueado, {
    p_documento_id: doc.id,
    p_motivo: motivo,
    p_lease_token: doc.lease_token,
  });
  if (error) {
    counters.comErro.push({ id: doc.id, erro: `MARCAR_XML_BLOQUEADO_FALHOU:${error.message}` });
  } else if (aplicado) {
    counters.bloqueados.push(doc.id);
  } else {
    counters.ignoradosPorConcorrencia.push(doc.id);
  }
}

async function marcarXmlErro(
  supabase: SupabaseLike,
  doc: XmlDoc,
  motivo: string,
  counters: XmlWorkerCounters,
  artefato: XmlArtefato,
): Promise<void> {
  const { data: aplicado, error } = await supabase.rpc(RPCS_XML[artefato].erro, {
    p_documento_id: doc.id,
    p_erro: motivo,
    p_lease_token: doc.lease_token,
  });
  if (error) {
    counters.comErro.push({ id: doc.id, erro: `MARCAR_XML_ERRO_FALHOU:${error.message}` });
  } else if (aplicado) {
    counters.comErro.push({ id: doc.id, erro: motivo });
  } else {
    // Hotfix concorrência (achado do Codex): esta é EXATAMENTE a chamada
    // que antes regredia ARMAZENADO->ERRO quando feita por um worker
    // atrasado. Agora a RPC ignora e devolve false — nunca marcada como
    // erro real.
    counters.ignoradosPorConcorrencia.push(doc.id);
  }
}
