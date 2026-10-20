// Lógica pura do webhook Asaas (testável sem rede/banco).
//
// Segurança: o Asaas envia o "Token de autenticação" configurado no painel do webhook no header
// `asaas-access-token`. Comparamos em tempo constante com ASAAS_WEBHOOK_TOKEN. Sem token configurado
// ⇒ 503 (fail-closed: nunca aceitar evento sem validação).
// Idempotência: o Asaas reenvia eventos (at-least-once). `id` do evento é a chave em
// cobranca_webhook_eventos (RPC cobranca_aplicar_evento); reenvio responde 200 com duplicado=true.
import { timingSafeEqualSecret } from "../_shared/crypto.ts";

export type AplicarEvento = (
  eventoId: string,
  evento: string,
  payload: Record<string, unknown>,
) => Promise<{ duplicado: boolean; resultado: string | null }>;

export const EVENTOS_TRATADOS = new Set([
  "PAYMENT_CREATED", "PAYMENT_UPDATED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_RECEIVED_IN_CASH",
  "PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED",
  "SUBSCRIPTION_DELETED",
]);

export type WebhookResposta = { status: number; body: Record<string, unknown> };

export async function tratarWebhookAsaas(input: {
  method: string;
  tokenHeader: string | null;
  tokenEsperado: string | null | undefined;
  rawBody: string;
  aplicar: AplicarEvento;
}): Promise<WebhookResposta> {
  if (input.method !== "POST") return { status: 405, body: { ok: false, error: "METHOD_NOT_ALLOWED" } };
  const esperado = (input.tokenEsperado ?? "").trim();
  if (!esperado) return { status: 503, body: { ok: false, error: "WEBHOOK_TOKEN_NAO_CONFIGURADO" } };
  const recebido = (input.tokenHeader ?? "").trim();
  if (!recebido || !(await timingSafeEqualSecret(recebido, esperado))) {
    return { status: 401, body: { ok: false, error: "TOKEN_INVALIDO" } };
  }
  if (input.rawBody.length > 256 * 1024) return { status: 413, body: { ok: false, error: "PAYLOAD_GRANDE" } };

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(input.rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not object");
    payload = parsed as Record<string, unknown>;
  } catch {
    return { status: 400, body: { ok: false, error: "JSON_INVALIDO" } };
  }
  const evento = typeof payload.event === "string" ? payload.event : "";
  const eventoId = typeof payload.id === "string" ? payload.id : "";
  if (!evento || !eventoId) return { status: 400, body: { ok: false, error: "EVENTO_SEM_ID" } };

  // Evento que não tratamos: 200 para o Asaas não pausar a fila, sem gravar nada.
  if (!EVENTOS_TRATADOS.has(evento)) return { status: 200, body: { ok: true, ignorado: true } };

  try {
    const r = await input.aplicar(eventoId, evento, payload);
    return { status: 200, body: { ok: true, duplicado: r.duplicado, resultado: r.resultado } };
  } catch (_e) {
    // 500 ⇒ Asaas reenvia depois (idempotente). Não ecoa detalhes internos.
    return { status: 500, body: { ok: false, error: "FALHA_AO_APLICAR" } };
  }
}
