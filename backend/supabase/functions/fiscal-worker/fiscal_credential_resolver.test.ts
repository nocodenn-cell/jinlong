// Onda C2.1/C2.2 — testes de resolução de credencial multiempresa. Sem rede,
// sem Focus real: fake do Supabase client controla o que `fiscal_provider_config`
// "responde"; `Deno.env` real controla os secrets simulados.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { resolveDeployAmbiente, resolveFocusBaseUrl, resolveFocusCredential } from "./fiscal_credential_resolver.ts";

type ConfigRow = {
  provider_type: string;
  ambiente: string;
  token_env_var: string;
  habilitado: boolean;
} | null;

/** Fake mínimo — só o que `resolveFocusCredential` chama: `.from('fiscal_provider_config').select().eq().eq().maybeSingle()`. */
function fakeSupabase(rowsByKey: Record<string, ConfigRow>) {
  return {
    from(table: string) {
      if (table !== "fiscal_provider_config") throw new Error(`tabela inesperada: ${table}`);
      let lojaId: string | null = null;
      let ambiente: string | null = null;
      const builder = {
        select(_cols: string) {
          return builder;
        },
        eq(col: string, val: string) {
          if (col === "loja_id") lojaId = val;
          if (col === "ambiente") ambiente = val;
          return builder;
        },
        async maybeSingle() {
          const key = `${lojaId}::${ambiente}`;
          const row = rowsByKey[key] ?? null;
          return { data: row, error: null };
        },
      };
      return builder;
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

async function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void> | void): Promise<void> {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) prev[k] = Deno.env.get(k);
  try {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
    await fn(); // precisa ser aguardado — senão o `finally` restaura o env ANTES do fn() assíncrono rodar
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

Deno.test("resolveDeployAmbiente aceita só homologacao/producao", () => {
  assertEquals(resolveDeployAmbiente("homologacao"), "homologacao");
  assertEquals(resolveDeployAmbiente("PRODUCAO"), "producao");
  assertEquals(resolveDeployAmbiente(""), null);
  assertEquals(resolveDeployAmbiente(undefined), null);
  assertEquals(resolveDeployAmbiente("staging"), null);
});

Deno.test("resolveFocusBaseUrl — URLs fixas confirmadas, não configuráveis", () => {
  assertEquals(resolveFocusBaseUrl("homologacao"), "https://homologacao.focusnfe.com.br");
  assertEquals(resolveFocusBaseUrl("producao"), "https://api.focusnfe.com.br");
});

Deno.test("ambiente inválido -> fail closed sem consultar o banco", async () => {
  const supabase = fakeSupabase({});
  const res = await resolveFocusCredential(supabase, "loja-1", null);
  assertEquals(res, { ok: false, code: "FISCAL_AMBIENTE_INVALIDO" });
});

Deno.test("loja_id ausente -> fail closed", async () => {
  const supabase = fakeSupabase({});
  const res = await resolveFocusCredential(supabase, null, "homologacao");
  assertEquals(res, { ok: false, code: "FISCAL_LOJA_ID_AUSENTE" });
});

Deno.test("15. configuração inexistente -> fail closed", async () => {
  const supabase = fakeSupabase({}); // nenhuma linha para nenhuma chave
  const res = await resolveFocusCredential(supabase, "loja-1", "homologacao");
  assertEquals(res, { ok: false, code: "FISCAL_CONFIG_AUSENTE" });
});

Deno.test("16. configuração desabilitada -> fail closed", async () => {
  const supabase = fakeSupabase({
    "loja-1::homologacao": { provider_type: "focus", ambiente: "homologacao", token_env_var: "FISCAL_TOKEN_FOCUS_LOJA1_HOMOLOGACAO", habilitado: false },
  });
  const res = await resolveFocusCredential(supabase, "loja-1", "homologacao");
  assertEquals(res, { ok: false, code: "FISCAL_CONFIG_DESABILITADA" });
});

Deno.test("provider incompatível -> fail closed (config diz mock, não focus)", async () => {
  const supabase = fakeSupabase({
    "loja-1::homologacao": { provider_type: "mock", ambiente: "homologacao", token_env_var: "FISCAL_TOKEN_MOCK_LOJA1_HOMOLOGACAO", habilitado: true },
  });
  const res = await resolveFocusCredential(supabase, "loja-1", "homologacao");
  assertEquals(res, { ok: false, code: "FISCAL_PROVIDER_INCOMPATIVEL" });
});

Deno.test("17. secret inexistente -> fail closed", async () => {
  const supabase = fakeSupabase({
    "loja-1::homologacao": { provider_type: "focus", ambiente: "homologacao", token_env_var: "FISCAL_TOKEN_FOCUS_LOJA1_INEXISTENTE", habilitado: true },
  });
  await withEnv({ FISCAL_TOKEN_FOCUS_LOJA1_INEXISTENTE: undefined }, async () => {
    const res = await resolveFocusCredential(supabase, "loja-1", "homologacao");
    assertEquals(res, { ok: false, code: "FISCAL_SECRET_AUSENTE" });
  });
});

Deno.test("secret vazio -> fail closed", async () => {
  const supabase = fakeSupabase({
    "loja-1::homologacao": { provider_type: "focus", ambiente: "homologacao", token_env_var: "FISCAL_TOKEN_FOCUS_LOJA1_VAZIO", habilitado: true },
  });
  await withEnv({ FISCAL_TOKEN_FOCUS_LOJA1_VAZIO: "   " }, async () => {
    const res = await resolveFocusCredential(supabase, "loja-1", "homologacao");
    assertEquals(res, { ok: false, code: "FISCAL_SECRET_VAZIO" });
  });
});

Deno.test("18. ambiente divergente -> fail closed (config só existe para o outro ambiente)", async () => {
  // Loja tem config de homologacao; worker está declarado como producao.
  const supabase = fakeSupabase({
    "loja-1::homologacao": { provider_type: "focus", ambiente: "homologacao", token_env_var: "FISCAL_TOKEN_FOCUS_LOJA1_HOMOLOGACAO", habilitado: true },
  });
  const res = await resolveFocusCredential(supabase, "loja-1", "producao");
  assertEquals(res, { ok: false, code: "FISCAL_CONFIG_AUSENTE" }); // a query nem encontra a linha do outro ambiente
});

Deno.test("12/13/14. Loja A usa secret A, Loja B usa secret B, nunca cruzam", async () => {
  const supabase = fakeSupabase({
    "loja-A::homologacao": { provider_type: "focus", ambiente: "homologacao", token_env_var: "FISCAL_TOKEN_FOCUS_LOJAA_HOMOLOGACAO", habilitado: true },
    "loja-B::homologacao": { provider_type: "focus", ambiente: "homologacao", token_env_var: "FISCAL_TOKEN_FOCUS_LOJAB_HOMOLOGACAO", habilitado: true },
  });
  await withEnv(
    { FISCAL_TOKEN_FOCUS_LOJAA_HOMOLOGACAO: "token-secreto-A", FISCAL_TOKEN_FOCUS_LOJAB_HOMOLOGACAO: "token-secreto-B" },
    async () => {
      const resA = await resolveFocusCredential(supabase, "loja-A", "homologacao");
      const resB = await resolveFocusCredential(supabase, "loja-B", "homologacao");
      assertEquals(resA, { ok: true, token: "token-secreto-A", ambiente: "homologacao" });
      assertEquals(resB, { ok: true, token: "token-secreto-B", ambiente: "homologacao" });
      // Loja A nunca recebe o token de B nem vice-versa.
      if (resA.ok) assertEquals(resA.token === "token-secreto-B", false);
      if (resB.ok) assertEquals(resB.token === "token-secreto-A", false);
    },
  );
});
