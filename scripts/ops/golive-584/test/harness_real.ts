// Harness contra a RÉPLICA real (PostgREST local -> PG17 local). Sem prod, sem rede além do esm.sh.
const VERSAO = Deno.args[0]; const PORT = Deno.args[1]; const ROT = Deno.args[2];
const LOJA = "a0000001-0000-4000-8000-000000000001";
const KEY = "chave-legada-de-teste-0123456789", DEV_SECRET = Deno.env.get("DEV_SECRET")!, FP = "fp-harness-real-1";
const OP = "33333333-3333-4333-8333-333333333333", PROD = "d1c0d200-0001-4000-8000-000000000001";
Deno.env.set("SUPABASE_URL", "http://pg.local"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", Deno.env.get("JWT")!);
Deno.env.set("SYNC_KEY", KEY); Deno.env.set("SYNC_OUTBOX_EXPOSE_INTERNAL_ERRORS", "true");
const realFetch = globalThis.fetch;
globalThis.fetch = async (input: Request | URL | string, init?: RequestInit) => {
  const req = input instanceof Request ? input : new Request(String(input), init);
  const u = new URL(req.url);
  if (u.host !== "pg.local") return realFetch(input as Request, init);
  if (u.pathname.includes("registrar_venda_com_itens") && Deno.env.get("DBG")) { const b = await req.clone().text(); console.error("RPC", b.slice(0, 600)); }
  const nu = `http://localhost:${PORT}${u.pathname.replace(/^\/rest\/v1/, "")}${u.search}`;
  return realFetch(new Request(nu, req));
};
let handler: ((r: Request) => Promise<Response>) | null = null;
(Deno as unknown as { serve: unknown }).serve = (h: unknown) => { handler = (typeof h === "function" ? h : (h as { handler: unknown }).handler) as typeof handler; return {}; };
await import(`./${VERSAO}/functions/sync-outbox/index.ts`);
async function hmac(k: string, m: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(k), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(m)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function enviar(events: unknown[], disp: boolean) {
  const FPX = disp ? FP : "fp-build-b-sem-dispositivo";
  const body = JSON.stringify({ events }); const ts = String(Math.floor(Date.now() / 1000)); const nonce = crypto.randomUUID();
  const k = disp ? DEV_SECRET : KEY;
  const r = await handler!(new Request("http://edge.local/functions/v1/sync-outbox", { method: "POST", body, headers: {
    "content-type": "application/json", "X-SYNC-KEY": k, "X-SYNC-TS": ts, "X-SYNC-NONCE": nonce, "x-device-fingerprint": FPX,
    "X-SYNC-SIGNATURE": await hmac(k, `${ts}.${nonce}.${FPX}.${body}`), "x-loja-id": LOJA } }));
  return { status: r.status, json: await r.json() };
}
let OPX = OP; const cx = (comLoja: boolean) => ({ id: crypto.randomUUID(), operador_id: OPX, data_abertura: new Date().toISOString(), valor_inicial: 50, status: "ABERTO", ...(comLoja ? { loja_id: LOJA } : {}) });
const venda = (caixaId: string, comLoja: boolean) => ({ venda_id: crypto.randomUUID(), caixa_id: caixaId, operador_id: OPX, troco_inicial_caixa: 50, forma_pagamento: "DINHEIRO",
  total_bruto: 10, total_desconto: 0, total_liquido: 10, desconto_gerente_percentual: null, desconto_gerente_valor: null, gerente_id: null, desconto_gerente_token: null,
  ...(comLoja ? { loja_id: LOJA } : {}), itens: [{ item_id: crypto.randomUUID(), produto_id: PROD, nome: "x", quantidade: 1, preco_original: 10, preco_unitario: 10 }] });
const ev = (tipo: string, p: unknown) => ({ id: crypto.randomUUID(), tipo, payload_json: JSON.stringify(p), created_at: new Date().toISOString() });
const casos: [string, boolean, boolean][] = [["Build B (SYNC_KEY, com loja_id)", true, false], ["Build C (dispositivo, com loja_id)", true, true], ["controle Build A (sem loja_id)", false, false]];
const OPS = (Deno.env.get("OPS") ?? OP).split(","); let i = 0;
for (const [nome, comLoja, disp] of casos) {
  OPX = OPS[i++ % OPS.length];
  const c = cx(comLoja);
  const r0 = await enviar([ev("CAIXA_ABERTO", c)], disp);
  const r = await enviar([ev("VENDA_REGISTRADA", venda(c.id, comLoja))], disp);
  const res = "caixa: " + (r0.json.processed ?? []).length + " ok " + JSON.stringify((r0.json.failed ?? []).map((x: { error: string }) => String(x.error).slice(0, 60))) + (r0.json.ok === false ? " AUTH:" + r0.json.error : "") + " | venda: " + (r.json.processed ?? []).length + " ok / falhas " + JSON.stringify((r.json.failed ?? []).map((x: { error: string }) => String(x.error).slice(0, 90))) + (r.json.ok === false ? " AUTH:" + r.json.error : "");
  console.log(`${VERSAO}|${ROT}|${nome}|HTTP ${r.status}|${res}`);
}
