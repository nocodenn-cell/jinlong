// STRICT_MANAGER_DISCOUNT_AUTH no sync-outbox: seguro por padrão, igual ao caixa web
// (pdv-importados/lib/config/caixaSalesRuntimeConfig.ts). Ausente, vazio ou valor inválido = ESTRITO.
// Só um "false" explícito (false/0/no/off) desliga — é a chave de rollback documentada.

export type FlagEstrita = { estrito: boolean; fonte: "env" | "padrao"; invalida: boolean };

export function resolverStrictManagerDiscountAuth(raw: string | undefined | null): FlagEstrita {
  if (raw === undefined || raw === null || raw.trim() === "") return { estrito: true, fonte: "padrao", invalida: false };
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return { estrito: true, fonte: "env", invalida: false };
  if (v === "false" || v === "0" || v === "no" || v === "off") return { estrito: false, fonte: "env", invalida: false };
  return { estrito: true, fonte: "padrao", invalida: true };
}

let avisado = false;
export function strictManagerDiscountAuth(raw: string | undefined | null = Deno.env.get("STRICT_MANAGER_DISCOUNT_AUTH")): boolean {
  const f = resolverStrictManagerDiscountAuth(raw);
  if (!avisado && (f.invalida || !f.estrito)) {
    avisado = true;
    console.warn(f.invalida
      ? "STRICT_MANAGER_DISCOUNT_AUTH com valor inválido: aplicando modo estrito."
      : "STRICT_MANAGER_DISCOUNT_AUTH=false: desconto de gerente sem token/PIN aceito (rollback explícito).");
  }
  return f.estrito;
}

export type InfoDesconto = { token: string | null; temDesconto: boolean; exigeToken: boolean; vendaId: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Lê o desconto de gerente da venda. Token informado é SEMPRE conferido no banco, com ou sem modo estrito. */
export function infoDescontoVenda(tipo: string, payloadJson: string): InfoDesconto {
  const vazio: InfoDesconto = { token: null, temDesconto: false, exigeToken: false, vendaId: null };
  if (tipo !== "VENDA_REGISTRADA") return vazio;
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return vazio;
  }
  if (!p || typeof p !== "object") return vazio;
  const token = typeof p.desconto_gerente_token === "string" && p.desconto_gerente_token.trim() ? p.desconto_gerente_token.trim() : null;
  const pct = Number(p.desconto_gerente_percentual ?? 0);
  const val = Number(p.desconto_gerente_valor ?? 0);
  // NaN (valor não numérico) conta como desconto: não pode passar como "sem desconto".
  const positivoOuInvalido = (n: number) => Number.isNaN(n) || n > 0;
  const temDesconto = positivoOuInvalido(pct) || positivoOuInvalido(val);
  const vendaId = typeof p.venda_id === "string" && UUID.test(p.venda_id.trim()) ? p.venda_id.trim() : null;
  return { token, temDesconto, exigeToken: !!token, vendaId };
}

/** Venda com desconto de gerente sem token nem PIN de gerente, em modo estrito, não pode ser gravada. */
export function descontoSemValidacao(info: InfoDesconto, estrito: boolean, pinGerenteValido: boolean): boolean {
  return estrito && info.temDesconto && !info.token && !pinGerenteValido;
}
