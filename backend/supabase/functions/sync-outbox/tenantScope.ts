// Escopo de tenant do sync-outbox (ESPEC_MULTIEMPRESA_V1 §11 / D6).
//
// Dois modos de autenticação:
//  * "dispositivo": PDV ativado por código (tabela pdv_dispositivos). O segredo HMAC é POR DISPOSITIVO
//    e a loja vem do SERVIDOR (pdv_dispositivos.loja_id). Header x-loja-id e loja do payload só podem
//    confirmar essa loja — nunca escolher outra. Obrigatório para o cliente 2 em diante.
//  * "legado": SYNC_KEY / SYNC_DEVICE_KEYS do ambiente (cliente 1, comportamento inalterado — D10).
//    Desligável com SYNC_LEGACY_KEYS_ENABLED=false quando todos os PDVs estiverem ativados.

export type DispositivoPdv = {
  id: string;
  loja_id: string;
  empresa_id: string;
  sync_secret: string;
};

export type SyncContext =
  | { mode: "dispositivo"; lojaId: string; empresaId: string; dispositivoId: string }
  | { mode: "legado"; lojaId: string | null };

export type ScopeLookups = {
  /** loja_id do caixa no servidor, ou null se o caixa não existe. */
  caixaLoja: (caixaId: string) => Promise<string | null>;
  /** quantos produtos da lista NÃO pertencem à loja. */
  produtosForaDaLoja: (produtoIds: string[], lojaId: string) => Promise<number>;
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
  return { ok: true, expectedKey: input.legacyKey, ctx: { mode: "legado", lojaId: header } };
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
 * Garante que um evento da outbox (inclusive REPLAY offline de eventos antigos) só toca dados da loja
 * do dispositivo. Modo legado: no-op (comportamento atual do cliente 1).
 * Lança Error com código estável; o evento vai para `failed` e nada é escrito.
 */
export async function assertEventoNoEscopo(
  ev: { tipo: string; payload_json: string },
  ctx: SyncContext,
  lookups: ScopeLookups,
): Promise<void> {
  if (ctx.mode !== "dispositivo") return;
  const loja = ctx.lojaId;
  const p = parsePayload(ev.payload_json);

  const lojaPayload = str(p.loja_id);
  if (lojaPayload && lojaPayload !== loja) throw new Error("EVENTO_LOJA_FORA_DO_DISPOSITIVO");

  const caixaId = ev.tipo === "CAIXA_ABERTO" || ev.tipo === "CAIXA_FECHADO" ? str(p.id) : str(p.caixa_id);

  if (ev.tipo === "CAIXA_ABERTO") {
    if (!lojaPayload) throw new Error("EVENTO_LOJA_OBRIGATORIA");
    if (caixaId) {
      const existente = await lookups.caixaLoja(caixaId);
      if (existente !== null && existente !== loja) throw new Error("EVENTO_CAIXA_DE_OUTRA_LOJA");
    }
    return;
  }

  if (ev.tipo === "CAIXA_FECHADO" || ev.tipo === "MOVIMENTO_CAIXA" || ev.tipo === "VENDA_REGISTRADA") {
    if (!caixaId) throw new Error("EVENTO_CAIXA_OBRIGATORIO");
    const lojaCaixa = await lookups.caixaLoja(caixaId);
    // VENDA_REGISTRADA pode criar o caixa (ensureCaixaPdv) — só aceita se o caixa ainda não existe
    // E a loja do payload é a do dispositivo.
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
    return;
  }
  throw new Error(`TIPO_DESCONHECIDO: ${ev.tipo}`);
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
