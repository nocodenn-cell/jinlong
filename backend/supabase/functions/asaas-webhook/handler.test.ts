import { assertEquals } from "jsr:@std/assert@1";
import { tratarWebhookAsaas, type AplicarEvento } from "./handler.ts";

function fakeDb() {
  const vistos = new Map<string, string>();
  const chamadas: string[] = [];
  const aplicar: AplicarEvento = (id, ev) => {
    chamadas.push(id);
    if (vistos.has(id)) return Promise.resolve({ duplicado: true, resultado: vistos.get(id)! });
    vistos.set(id, ev);
    return Promise.resolve({ duplicado: false, resultado: ev });
  };
  return { aplicar, chamadas };
}
const body = (o: unknown) => JSON.stringify(o);
const base = { method: "POST", tokenEsperado: "segredo-webhook" };

Deno.test("sem token configurado: 503 fail-closed", async () => {
  const { aplicar, chamadas } = fakeDb();
  const r = await tratarWebhookAsaas({ ...base, tokenEsperado: "", tokenHeader: "x", rawBody: "{}", aplicar });
  assertEquals(r.status, 503);
  assertEquals(chamadas.length, 0);
});

Deno.test("token errado/ausente: 401 e nada aplicado", async () => {
  const { aplicar, chamadas } = fakeDb();
  assertEquals((await tratarWebhookAsaas({ ...base, tokenHeader: "errado", rawBody: "{}", aplicar })).status, 401);
  assertEquals((await tratarWebhookAsaas({ ...base, tokenHeader: null, rawBody: "{}", aplicar })).status, 401);
  assertEquals(chamadas.length, 0);
});

Deno.test("JSON inválido / sem id: 400", async () => {
  const { aplicar } = fakeDb();
  assertEquals((await tratarWebhookAsaas({ ...base, tokenHeader: "segredo-webhook", rawBody: "{", aplicar })).status, 400);
  assertEquals((await tratarWebhookAsaas({ ...base, tokenHeader: "segredo-webhook", rawBody: body({ event: "PAYMENT_RECEIVED" }), aplicar })).status, 400);
});

Deno.test("mesmo evento 2×: segunda resposta é duplicado (idempotente)", async () => {
  const { aplicar } = fakeDb();
  const ev = body({ id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } });
  const r1 = await tratarWebhookAsaas({ ...base, tokenHeader: "segredo-webhook", rawBody: ev, aplicar });
  const r2 = await tratarWebhookAsaas({ ...base, tokenHeader: "segredo-webhook", rawBody: ev, aplicar });
  assertEquals([r1.status, r1.body.duplicado], [200, false]);
  assertEquals([r2.status, r2.body.duplicado], [200, true]);
});

Deno.test("evento não tratado: 200 ignorado sem gravar", async () => {
  const { aplicar, chamadas } = fakeDb();
  const r = await tratarWebhookAsaas({ ...base, tokenHeader: "segredo-webhook", rawBody: body({ id: "e", event: "ACCOUNT_STATUS_UPDATED" }), aplicar });
  assertEquals(r.body.ignorado, true);
  assertEquals(chamadas.length, 0);
});

Deno.test("falha no banco: 500 genérico (Asaas reenvia)", async () => {
  const r = await tratarWebhookAsaas({
    ...base, tokenHeader: "segredo-webhook", rawBody: body({ id: "e", event: "PAYMENT_OVERDUE" }),
    aplicar: () => Promise.reject(new Error("db down: detalhe interno")),
  });
  assertEquals(r.status, 500);
  assertEquals(r.body.error, "FALHA_AO_APLICAR");
});

Deno.test("allowlist de IP opcional: fora da lista ⇒ 403; vazia ⇒ não filtra", async () => {
  const { aplicar } = fakeDb();
  const ev = body({ id: "evt_ip", event: "PAYMENT_RECEIVED" });
  const r1 = await tratarWebhookAsaas({ ...base, tokenHeader: "segredo-webhook", rawBody: ev, aplicar, ipCliente: "1.2.3.4", ipAllowlist: "52.67.12.206, 18.230.8.159" });
  assertEquals(r1.status, 403);
  const r2 = await tratarWebhookAsaas({ ...base, tokenHeader: "segredo-webhook", rawBody: ev, aplicar, ipCliente: "18.230.8.159", ipAllowlist: "52.67.12.206, 18.230.8.159" });
  assertEquals(r2.status, 200);
  const r3 = await tratarWebhookAsaas({ ...base, tokenHeader: "segredo-webhook", rawBody: body({ id: "evt_ip2", event: "PAYMENT_RECEIVED" }), aplicar, ipCliente: "9.9.9.9", ipAllowlist: "" });
  assertEquals(r3.status, 200);
});
