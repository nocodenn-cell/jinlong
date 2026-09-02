// Onda C2.4/C2.5/C2.6/C2.9 — FocusProvider com fetch fake. Nenhum destes testes
// toca rede real nem Focus real.

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { FiscalDoc } from "./fiscal_types.ts";
import { FocusProvider, resolveFocusRef } from "./fiscal-provider-adapter.ts";

type FakeCall = { url: string; method: string; headers: Record<string, string>; body: string | null };

function installFakeFetch(handler: (call: FakeCall) => { status: number; body: unknown } | "abort") {
  const calls: FakeCall[] = [];
  const original = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).fetch = (input: string | URL, init?: RequestInit) => {
    const call: FakeCall = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers as HeadersInit).entries()),
      body: typeof init?.body === "string" ? init.body : null,
    };
    calls.push(call);
    const outcome = handler(call);
    if (outcome === "abort") {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }
    return Promise.resolve(
      new Response(JSON.stringify(outcome.body), { status: outcome.status, headers: { "Content-Type": "application/json" } }),
    );
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function doc(overrides: Partial<FiscalDoc> = {}): FiscalDoc {
  return {
    id: "doc-1",
    venda_id: "venda-1",
    tipo_doc: "NFCE",
    correlation_id: "corr-1",
    payload: { emitente: { cnpj: "12345678000199" }, data_venda: "2026-09-02T12:00:00Z" },
    ...overrides,
  };
}

const CFG = { type: "focus" as const, url: "https://homologacao.focusnfe.com.br", token: "tok-teste", timeout: 200 };

Deno.test("resolveFocusRef usa doc.id por padrão e é estável entre chamadas (11. mesma ref em retry)", () => {
  const d = doc();
  assertEquals(resolveFocusRef(d), d.id);
  assertEquals(resolveFocusRef(d), resolveFocusRef(d));
});

Deno.test("1. NFC-e autorizada — POST /v2/nfce?ref=, Basic auth, 200 com chave/protocolo", async () => {
  const { calls, restore } = installFakeFetch((call) => {
    return { status: 200, body: { chave_nfe: "35...44digitos", protocolo_autorizacao: "PROTO123" } };
  });
  try {
    const provider = new FocusProvider();
    const result = await provider.callProvider(doc(), CFG);
    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.chave_fiscal, "35...44digitos");
      assertEquals(result.protocolo, "PROTO123");
    }
    assertEquals(calls.length, 1);
    assertEquals(calls[0].method, "POST");
    assertEquals(calls[0].url, "https://homologacao.focusnfe.com.br/v2/nfce?ref=doc-1");
    assertEquals(calls[0].headers["authorization"], `Basic ${btoa("tok-teste:")}`);
  } finally {
    restore();
  }
});

Deno.test("2. NFC-e rejeitada — 200 sem chave/protocolo reconhecível", async () => {
  const { restore } = installFakeFetch(() => ({ status: 200, body: { mensagem: "cadastro invalido" } }));
  try {
    const provider = new FocusProvider();
    const result = await provider.callProvider(doc(), CFG);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.transitorio, false);
  } finally {
    restore();
  }
});

Deno.test("3. NFC-e timeout — POST nunca responde, timeout curto dispara erro transitório", async () => {
  const { calls, restore } = installFakeFetch(() => "abort");
  try {
    const provider = new FocusProvider();
    const result = await provider.callProvider(doc(), { ...CFG, timeout: 10 });
    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.transitorio, true);
      assertEquals(result.provider_code, "FOCUS_PROVIDER_TIMEOUT");
    }
    assertEquals(calls.length, 1); // só 1 tentativa de POST — não reemitiu sozinho
  } finally {
    restore();
  }
});

Deno.test("4. consulta NFC-e autorizada — GET /v2/nfce/{ref}", async () => {
  const { calls, restore } = installFakeFetch(() => ({ status: 200, body: { chave: "35...", protocolo: "P1" } }));
  try {
    const provider = new FocusProvider();
    const estado = await provider.consultarDocumento("ref-abc", "NFCE", CFG);
    assertEquals(estado.kind, "autorizado");
    assertEquals(calls[0].method, "GET");
    assertEquals(calls[0].url, "https://homologacao.focusnfe.com.br/v2/nfce/ref-abc");
  } finally {
    restore();
  }
});

Deno.test("5. consulta NFC-e rejeitada — BLOQUEADO (schema de rejeição via consulta não confirmado)", () => {
  // Registrado, não implementado: a documentação fornecida confirma que a
  // consulta "pode retornar... erro de autorização", mas não o nome/formato
  // do campo que sinaliza isso. classifyFocusConsultaResponse trata qualquer
  // 2xx sem chave/protocolo reconhecível como "processando" (lado seguro —
  // não presumir rejeição sem confirmação), não "rejeitado". Ver
  // fiscal_types.ts (nota sobre schema de resposta não confirmado).
  assertEquals(true, true);
});

Deno.test("6. NF-e 201 — autorizada imediatamente", async () => {
  const { calls, restore } = installFakeFetch(() => ({ status: 201, body: { chave_nfe: "chave-nfe-1", protocolo_nfe: "proto-nfe-1" } }));
  try {
    const provider = new FocusProvider();
    const estado = await provider.emitirNfe!(doc({ tipo_doc: "NFE" }), CFG);
    assertEquals(estado.kind, "autorizado");
    assertEquals(calls[0].url, "https://homologacao.focusnfe.com.br/v2/nfe?ref=doc-1");
  } finally {
    restore();
  }
});

Deno.test("7. NF-e 202 — processando, NÃO é erro", async () => {
  const { restore } = installFakeFetch(() => ({ status: 202, body: { status: "processando_autorizacao" } }));
  try {
    const provider = new FocusProvider();
    const estado = await provider.emitirNfe!(doc({ tipo_doc: "NFE" }), CFG);
    assertEquals(estado.kind, "processando");
  } finally {
    restore();
  }
});

Deno.test("8. consulta posterior de NF-e 202 -> autorizada", async () => {
  const { restore } = installFakeFetch(() => ({ status: 200, body: { chave_nfe: "chave-final", protocolo_nfe: "proto-final" } }));
  try {
    const provider = new FocusProvider();
    const estado = await provider.consultarDocumento("doc-1", "NFE", CFG);
    assertEquals(estado.kind, "autorizado");
    if (estado.kind === "autorizado") {
      assertEquals(estado.chave_fiscal, "chave-final");
      assertEquals(estado.protocolo, "proto-final");
    }
  } finally {
    restore();
  }
});

Deno.test("19. resposta Focus inválida (200, corpo sem chave/protocolo e sem indício de erro)", async () => {
  const { restore } = installFakeFetch(() => ({ status: 200, body: { alguma_coisa: "irrelevante" } }));
  try {
    const provider = new FocusProvider();
    const result = await provider.callProvider(doc(), CFG);
    assertEquals(result.ok, false);
  } finally {
    restore();
  }
});

Deno.test("20. HTTP 429 -> erro transitório (retryable)", async () => {
  const { restore } = installFakeFetch(() => ({ status: 429, body: { mensagem: "muitas requisicoes" } }));
  try {
    const provider = new FocusProvider();
    const result = await provider.callProvider(doc(), CFG);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.transitorio, true);
  } finally {
    restore();
  }
});

Deno.test("21. HTTP 5xx -> erro transitório", async () => {
  const { restore } = installFakeFetch(() => ({ status: 503, body: {} }));
  try {
    const provider = new FocusProvider();
    const result = await provider.callProvider(doc(), CFG);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.transitorio, true);
  } finally {
    restore();
  }
});

Deno.test("22. HTTP 4xx definitivo (400) -> não transitório", async () => {
  const { restore } = installFakeFetch(() => ({ status: 400, body: { codigo: "requisicao_invalida" } }));
  try {
    const provider = new FocusProvider();
    const result = await provider.callProvider(doc(), CFG);
    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.transitorio, false);
      assertEquals(result.provider_code, "requisicao_invalida");
    }
  } finally {
    restore();
  }
});

Deno.test("23. token nunca aparece em logs — captura console.error durante uma chamada e confirma ausência", async () => {
  const { restore } = installFakeFetch(() => ({ status: 500, body: { mensagem: "erro interno" } }));
  const originalError = console.error;
  const logged: string[] = [];
  console.error = (...args: unknown[]) => { logged.push(args.map(String).join(" ")); };
  try {
    const provider = new FocusProvider();
    await provider.callProvider(doc(), CFG);
    for (const line of logged) {
      assertEquals(line.includes(CFG.token), false, "token vazou para console.error");
      assertEquals(line.includes(`Basic ${btoa(CFG.token + ":")}`), false, "Authorization vazou para console.error");
    }
  } finally {
    console.error = originalError;
    restore();
  }
});

Deno.test("24. Authorization real nunca aparece no corpo enviado (só no header)", async () => {
  const { calls, restore } = installFakeFetch(() => ({ status: 200, body: { chave: "c", protocolo: "p" } }));
  try {
    const provider = new FocusProvider();
    await provider.callProvider(doc(), CFG);
    assertExists(calls[0].body);
    assertEquals(calls[0].body!.includes(CFG.token), false);
  } finally {
    restore();
  }
});
