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
async function enviar(events: unknown[], disp: boolean, header: string | null = LOJA) {
  const FPX = disp ? FP : "fp-build-b-sem-dispositivo";
  const body = JSON.stringify({ events }); const ts = String(Math.floor(Date.now() / 1000)); const nonce = crypto.randomUUID();
  const k = disp ? DEV_SECRET : KEY;
  const r = await handler!(new Request("http://edge.local/functions/v1/sync-outbox", { method: "POST", body, headers: {
    "content-type": "application/json", "X-SYNC-KEY": k, "X-SYNC-TS": ts, "X-SYNC-NONCE": nonce, "x-device-fingerprint": FPX,
    "X-SYNC-SIGNATURE": await hmac(k, `${ts}.${nonce}.${FPX}.${body}`), ...(header ? { "x-loja-id": header } : {}) } }));
  return { status: r.status, json: await r.json() };
}
let OPX = OP; 
const OUTRA = Deno.env.get("OUTRA_LOJA") ?? "c9539f7e-1272-40e9-b0a3-17d819b6449f";
const OPS = (Deno.env.get("OPS") ?? OP).split(","); let oi = 0; const nextOp = () => OPS[oi++];
const ev = (tipo: string, p: unknown) => ({ id: crypto.randomUUID(), tipo, payload_json: JSON.stringify(p), created_at: new Date().toISOString() });
const cx = (op: string, loja?: string) => ({ id: crypto.randomUUID(), operador_id: op, data_abertura: new Date().toISOString(), valor_inicial: 50, status: "ABERTO", ...(loja ? { loja_id: loja } : {}) });
const venda = (caixaId: string, op: string, loja?: string) => ({ venda_id: crypto.randomUUID(), caixa_id: caixaId, operador_id: op, troco_inicial_caixa: 50, forma_pagamento: "DINHEIRO",
  total_bruto: 10, total_desconto: 0, total_liquido: 10, desconto_gerente_percentual: null, desconto_gerente_valor: null, gerente_id: null, desconto_gerente_token: null,
  ...(loja ? { loja_id: loja } : {}), itens: [{ item_id: crypto.randomUUID(), produto_id: PROD, nome: "x", quantidade: 1, preco_original: 10, preco_unitario: 10 }] });
const fmt = (r: { status: number; json: any }) => `HTTP ${r.status} ${(r.json.processed ?? []).length}ok` + ((r.json.failed ?? []).length ? " " + JSON.stringify((r.json.failed ?? []).map((x: any) => String(x.error).slice(0, 60))) : "") + (r.json.ok === false ? " AUTH:" + r.json.error : "");
async function par(nome: string, cLoja: string | undefined, vLoja: string | undefined, disp: boolean, header: string | null = LOJA) {
  const op = nextOp(); const c = cx(op, cLoja);
  const r0 = await enviar([ev("CAIXA_ABERTO", c)], disp, header); const r1 = await enviar([ev("VENDA_REGISTRADA", venda(c.id, op, vLoja))], disp, header);
  console.log(`${VERSAO}|${ROT}|${nome}|caixa ${fmt(r0)}|venda ${fmt(r1)}`); return c;
}
await par("Build B (chave, loja_id)", LOJA, LOJA, false);
await par("Build C (dispositivo, loja_id)", LOJA, LOJA, true);
await par("Build A (sem loja_id, sem header)", undefined, undefined, false, null);
await par("Build A (sem loja_id, header da loja)", undefined, undefined, false);
// conflitos
{ const op = nextOp(); const c = cx(op, LOJA); const r0 = await enviar([ev("CAIXA_ABERTO", c)], false);
  const r1 = await enviar([ev("VENDA_REGISTRADA", venda(c.id, op))], false, null);
  const r2 = await enviar([ev("VENDA_REGISTRADA", venda(c.id, op, OUTRA))], false, null);
  console.log(`${VERSAO}|${ROT}|conflito: caixa B + venda A (sem loja) + venda com OUTRA loja|caixa ${fmt(r0)}|vendaA ${fmt(r1)}|venda-outra ${fmt(r2)}`); }
await par("conflito: Build A com header de OUTRA loja", undefined, undefined, false, OUTRA);
