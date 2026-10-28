// Escopo de tenant do sync-outbox (ESPEC_MULTIEMPRESA_V1 §11 / D6).
//
// Dois modos de autenticação:
//  * "dispositivo": PDV ativado por código (tabela pdv_dispositivos). O segredo HMAC é POR DISPOSITIVO
//    e a loja vem do SERVIDOR (pdv_dispositivos.loja_id). Header x-loja-id e loja do payload só podem
//    confirmar essa loja — nunca escolher outra. Obrigatório para o cliente 2 em diante.
//  * "legado": SYNC_KEY / SYNC_DEVICE_KEYS do ambiente (cliente 1). Desligável com SYNC_LEGACY_KEYS_ENABLED=false
//    quando todos os PDVs estiverem ativados. 20261028130000: preso à EMPRESA LEGADA (Empresa 1, configurável em
//    SYNC_LEGACY_EMPRESA_ID): loja do evento/header precisa ser dessa empresa e o operador passa pela mesma
//    validação do modo dispositivo (ativo, vínculo, papel atual). Nenhum atalho do legado contorna isso.

export type DispositivoPdv = {
  id: string;
  loja_id: string;
  empresa_id: string;
  sync_secret: string;
};

export type SyncContext =
  | { mode: "dispositivo"; lojaId: string; empresaId: string; dispositivoId: string }
  | { mode: "legado"; lojaId: string | null; empresaId: string };

/** Empresa 1 (backfill de 20261019120000_multiempresa_fase1_base). */
export const EMPRESA_LEGADO_PADRAO = "e0000001-0000-4000-8000-000000000001";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function empresaLegado(raw: string | undefined | null): string {
  const v = (raw ?? "").trim().toLowerCase();
  return UUID_RE.test(v) ? v : EMPRESA_LEGADO_PADRAO;
}

export const TIPOS_OPERACIONAIS = new Set(["VENDA_REGISTRADA", "CAIXA_ABERTO", "MOVIMENTO_CAIXA", "CAIXA_FECHADO"]);

/** Resultado do escopo: loja efetiva do evento (servidor), caixa e quem operou (payload ou dono do caixa no servidor). */
export type EscopoEvento = { lojaId: string; empresaId: string; caixaId: string | null; operadorId: string | null };

export type ScopeLookups = {
  /** loja_id do caixa no servidor, ou null se o caixa não existe. */
  caixaLoja: (caixaId: string) => Promise<string | null>;
  /** quantos produtos da lista NÃO pertencem à loja. */
  produtosForaDaLoja: (produtoIds: string[], lojaId: string) => Promise<number>;
  /** O operador tem vínculo ativo que cobre a loja (fp_usuario_pode_loja)? */
  operadorPodeLoja: (operadorId: string, lojaId: string) => Promise<boolean>;
  /** empresa_id da loja no servidor, ou null se a loja não existe. */
  lojaEmpresa: (lojaId: string) => Promise<string | null>;
  /** operador_id do caixa no servidor (quem abriu), ou null. */
  caixaOperador: (caixaId: string) => Promise<string | null>;
};

export function legacyKeysEnabled(raw: string | undefined | null): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return !(v === "false" || v === "0" || v === "no");
}

/** Decide a chave esperada e o contexto, ANTES de validar a assinatura. */
export function resolveAuthContext(input: {
  dispositivo: DispositivoPdv | null;
  headerLojaId: string | null;
  legacyEnabled: boolean;
  legacyKey: string | null;
  legacyEmpresaId?: string | null;
}):
  | { ok: true; expectedKey: string; ctx: SyncContext }
  | { ok: false; error: string } {
  const header = input.headerLojaId?.trim() || null;
  if (input.dispositivo) {
    if (header && header !== input.dispositivo.loja_id) {
      return { ok: false, error: "LOJA_DIVERGENTE_DO_DISPOSITIVO" };
    }
    return {
      ok: true,
      expectedKey: input.dispositivo.sync_secret,
      ctx: {
        mode: "dispositivo",
        lojaId: input.dispositivo.loja_id,
        empresaId: input.dispositivo.empresa_id,
        dispositivoId: input.dispositivo.id,
      },
    };
  }
  if (!input.legacyEnabled || !input.legacyKey) return { ok: false, error: "DEVICE_NOT_ALLOWED" };
  return {
    ok: true,
    expectedKey: input.legacyKey,
    ctx: { mode: "legado", lojaId: header, empresaId: empresaLegado(input.legacyEmpresaId) },
  };
}

function parsePayload(raw: string): Record<string, unknown> {
  const p = JSON.parse(raw);
  if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error("PAYLOAD_INVALIDO");
  return p as Record<string, unknown>;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Garante que um evento da outbox (inclusive REPLAY offline de eventos antigos) só toca dados da loja certa:
 *  - dispositivo: a loja do dispositivo (servidor);
 *  - legado (20261028130000): a loja do evento (payload ou caixa no servidor), que precisa ser da empresa legada e
 *    bater com o header x-loja-id quando ele vier.
 * Devolve a loja efetiva, o caixa e o operador (payload ou, se ausente, o operador do caixa no servidor) para a
 * validação de operador (public.sync_avaliar_evento). OPERADOR_EVENTO: checa aqui e devolve null.
 * Lança Error com código estável; o evento vai para `failed` e nada é escrito.
 */
export async function assertEventoNoEscopo(
  ev: { tipo: string; payload_json: string },
  ctx: SyncContext,
  lookups: ScopeLookups,
): Promise<EscopoEvento | null> {
  const p = parsePayload(ev.payload_json);
  const lojaPayload = str(p.loja_id);

  // Auditoria de login por PIN: só existe em dispositivo ativado (legado descarta em processOperadorEvento).
  if (ev.tipo === "OPERADOR_EVENTO") {
    if (ctx.mode !== "dispositivo") return null;
    if (lojaPayload && lojaPayload !== ctx.lojaId) throw new Error("EVENTO_LOJA_FORA_DO_DISPOSITIVO");
    if (!lojaPayload) throw new Error("EVENTO_LOJA_OBRIGATORIA");
    const usuario = str(p.usuario_id);
    if (usuario && !(await lookups.operadorPodeLoja(usuario, ctx.lojaId))) throw new Error("EVENTO_OPERADOR_SEM_VINCULO");
    return null;
  }
  if (!TIPOS_OPERACIONAIS.has(ev.tipo)) throw new Error(`TIPO_DESCONHECIDO: ${ev.tipo}`);

  const caixaId = ev.tipo === "CAIXA_ABERTO" || ev.tipo === "CAIXA_FECHADO" ? str(p.id) : str(p.caixa_id);
  const lojaCaixa = caixaId ? await lookups.caixaLoja(caixaId) : null;

  let loja: string;
  let empresa: string;
  if (ctx.mode === "dispositivo") {
    loja = ctx.lojaId;
    empresa = ctx.empresaId;
    if (lojaPayload && lojaPayload !== loja) throw new Error("EVENTO_LOJA_FORA_DO_DISPOSITIVO");
  } else {
    const candidata = lojaPayload ?? lojaCaixa;
    if (!candidata) throw new Error(caixaId ? "EVENTO_CAIXA_DESCONHECIDO" : "EVENTO_LOJA_OBRIGATORIA");
    if (ctx.lojaId && ctx.lojaId !== candidata) throw new Error("LOJA_LEGADO_DIVERGENTE_DO_HEADER");
    const emp = await lookups.lojaEmpresa(candidata);
    if (!emp || emp.toLowerCase() !== ctx.empresaId.toLowerCase()) throw new Error("EVENTO_LOJA_FORA_DA_EMPRESA_LEGADO");
    loja = candidata;
    empresa = ctx.empresaId;
  }

  if (ev.tipo === "CAIXA_ABERTO") {
    if (!lojaPayload) throw new Error("EVENTO_LOJA_OBRIGATORIA");
    if (lojaCaixa !== null && lojaCaixa !== loja) throw new Error("EVENTO_CAIXA_DE_OUTRA_LOJA");
  } else {
    if (!caixaId) throw new Error("EVENTO_CAIXA_OBRIGATORIO");
    // VENDA_REGISTRADA pode criar o caixa (ensureCaixaPdv) — só aceita se o caixa ainda não existe
    // E a loja do payload é a loja efetiva.
    if (lojaCaixa === null) {
      if (ev.tipo !== "VENDA_REGISTRADA" || lojaPayload !== loja) throw new Error("EVENTO_CAIXA_DESCONHECIDO");
    } else if (lojaCaixa !== loja) {
      throw new Error("EVENTO_CAIXA_DE_OUTRA_LOJA");
    }
    if (ev.tipo === "VENDA_REGISTRADA") {
      const itens = Array.isArray(p.itens) ? p.itens : [];
      const ids = [...new Set(itens.map((i) => str((i as Record<string, unknown>)?.produto_id)).filter((x): x is string => !!x))];
      if (ids.length > 0 && (await lookups.produtosForaDaLoja(ids, loja)) > 0) {
        throw new Error("EVENTO_PRODUTO_DE_OUTRA_LOJA");
      }
    }
  }

  // Quem operou: o payload, ou (fechamento/movimento do PDV desktop, que não mandam operador) o dono do caixa.
  let operador = str(p.operador_id);
  if (!operador && caixaId && lojaCaixa !== null) operador = await lookups.caixaOperador(caixaId);
  return { lojaId: loja, empresaId: empresa, caixaId, operadorId: operador };
}

const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I/L

/** Forma canônica do código (igual à do banco): só [A-Z0-9] maiúsculo; hífens/espaços ignorados. */
export function normalizarCodigoAtivacao(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  if (!/^[A-Z0-9\s-]+$/.test(t)) return null;
  const c = t.replace(/[^A-Z0-9]/g, "");
  if (c.length < 8 || c.length > 32) return null;
  return c;
}

export { ALFABETO as ALFABETO_CODIGO_ATIVACAO };
