// PIN do operador no PDV (P0 do login rápido). Funções puras: derivação, vínculo ao dispositivo e evento de auditoria.
//
// Hash guardado no banco (public.usuario_pin): PBKDF2-SHA256(pin, hex→bytes(salt), iteracoes, 32 bytes) em hex.
// Cache offline enviado ao PDV: NUNCA o hash do banco. Vai `hash_dispositivo` = HMAC-SHA256(sync_secret do
// dispositivo, "pdv-pin-v1:<usuario_id>:<pin_hash>") — inútil fora do computador ativado, e muda se o dispositivo
// for reativado. O PDV refaz PBKDF2 + HMAC localmente para conferir sem rede.

const enc = new TextEncoder();

export const PIN_RE = /^[0-9]{4}$/;
export const CACHE_VALIDADE_DIAS = 7;
export const ERROS_BLOQUEIO_LOCAL = 5;

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(h: string): Uint8Array<ArrayBuffer> {
  if (!/^([0-9a-f]{2})+$/i.test(h)) throw new Error("HEX_INVALIDO");
  const out = new Uint8Array(new ArrayBuffer(h.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function derivarPinHash(pin: string, saltHex: string, iteracoes: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations: iteracoes },
    key,
    256,
  );
  return hex(bits);
}

export async function hashDispositivo(syncSecret: string, usuarioId: string, pinHash: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(syncSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(`pdv-pin-v1:${usuarioId}:${pinHash}`)));
}

export type OperadorDaLoja = {
  usuario_id: string;
  nome: string;
  papel: string;
  idioma: string | null;
  pin_hash: string | null;
  pin_salt: string | null;
  pin_iteracoes: number | null;
  pin_bloqueado_ate: string | null;
};

export type OperadorCache = {
  usuario_id: string;
  nome: string;
  papel: string;
  idioma: string;
  tem_pin: boolean;
  pin_salt: string | null;
  pin_iteracoes: number | null;
  hash_dispositivo: string | null;
  bloqueado_ate: string | null;
};

export async function montarCacheOperadores(rows: OperadorDaLoja[], syncSecret: string): Promise<OperadorCache[]> {
  const out: OperadorCache[] = [];
  for (const r of rows) {
    const tem = !!(r.pin_hash && r.pin_salt && r.pin_iteracoes);
    out.push({
      usuario_id: r.usuario_id,
      nome: r.nome,
      papel: r.papel,
      idioma: r.idioma === "zh" ? "zh" : "pt",
      tem_pin: tem,
      pin_salt: tem ? r.pin_salt : null,
      pin_iteracoes: tem ? r.pin_iteracoes : null,
      hash_dispositivo: tem ? await hashDispositivo(syncSecret, r.usuario_id, r.pin_hash as string) : null,
      bloqueado_ate: r.pin_bloqueado_ate,
    });
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function bloqueadoAgora(bloqueadoAte: string | null, agora = Date.now()): boolean {
  if (!bloqueadoAte) return false;
  if (bloqueadoAte === "infinity") return true;
  const t = Date.parse(bloqueadoAte);
  return Number.isFinite(t) && t > agora;
}

export const TIPOS_EVENTO_OPERADOR = new Set([
  "ENTROU", "SAIU", "BLOQUEIO_AUTO", "PIN_ERRADO", "BLOQUEADO", "OVERRIDE_GERENTE",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OperadorEventoPayload = {
  id: string;
  loja_id: string;
  usuario_id: string | null;
  tipo: string;
  origem: "online" | "offline";
  ocorrido_em: string;
  detalhe: Record<string, unknown>;
};

/** Valida o payload do evento de outbox OPERADOR_EVENTO (sem PIN, só ids/tipo/motivo curto). */
export function parseOperadorEvento(raw: unknown): OperadorEventoPayload {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("PAYLOAD_INVALIDO");
  const p = raw as Record<string, unknown>;
  const id = typeof p.id === "string" ? p.id.trim() : "";
  const loja = typeof p.loja_id === "string" ? p.loja_id.trim() : "";
  if (!UUID.test(id)) throw new Error("OPERADOR_EVENTO_ID_INVALIDO");
  if (!UUID.test(loja)) throw new Error("EVENTO_LOJA_OBRIGATORIA");
  const tipo = typeof p.tipo === "string" ? p.tipo.trim().toUpperCase() : "";
  if (!TIPOS_EVENTO_OPERADOR.has(tipo)) throw new Error("OPERADOR_EVENTO_TIPO_INVALIDO");
  let usuario: string | null = null;
  if (p.usuario_id != null) {
    if (typeof p.usuario_id !== "string" || !UUID.test(p.usuario_id.trim())) throw new Error("OPERADOR_EVENTO_USUARIO_INVALIDO");
    usuario = p.usuario_id.trim();
  }
  const em = typeof p.ocorrido_em === "string" && Number.isFinite(Date.parse(p.ocorrido_em))
    ? new Date(p.ocorrido_em).toISOString()
    : new Date().toISOString();
  const detalhe: Record<string, unknown> = {};
  const d = (typeof p.detalhe === "object" && p.detalhe && !Array.isArray(p.detalhe)) ? p.detalhe as Record<string, unknown> : {};
  // só campos curtos conhecidos — nada de PIN ou texto livre grande
  if (typeof d.acao === "string") detalhe.acao = d.acao.slice(0, 40);
  if (typeof d.motivo === "string") detalhe.motivo = d.motivo.slice(0, 200);
  if (typeof d.gerente_id === "string" && UUID.test(d.gerente_id)) detalhe.gerente_id = d.gerente_id;
  if (typeof d.caixa_id === "string" && UUID.test(d.caixa_id)) detalhe.caixa_id = d.caixa_id;
  return { id, loja_id: loja, usuario_id: usuario, tipo, origem: p.origem === "offline" ? "offline" : "online", ocorrido_em: em, detalhe };
}

/** 10 erros ⇒ 'infinity' no banco ⇒ só o gerente libera (mensagem diferente do bloqueio de 5 min). */
export function erroBloqueio(ate: string | null): string {
  return ate === "infinity" ? "PIN_BLOQUEADO_GERENTE" : "PIN_BLOQUEADO";
}
