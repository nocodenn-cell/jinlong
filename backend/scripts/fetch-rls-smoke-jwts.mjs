#!/usr/bin/env node
/**
 * Obtém access_tokens para smoke RLS REST (gerente + operador) via Auth password.
 * Uso em CI local após `seed-dev-users.mjs`.
 *
 * Imprime linhas exportáveis:
 *   RLS_SMOKE_JWT_PAINEL=...
 *   RLS_SMOKE_JWT_CAIXA=...
 */
import { createClient } from "@supabase/supabase-js";

const url = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ""
).replace(/\/+$/, "");
const anonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "";

const password =
  process.env.SEED_DEV_PASSWORD?.trim() ||
  process.env.PLAYWRIGHT_TEST_PASSWORD?.trim() ||
  process.env.CI_RLS_SMOKE_SEED_PASSWORD?.trim() ||
  "";

const gerenteEmail =
  process.env.SEED_GERENTE_EMAIL?.trim() || "e2e-gerente@localhost.test";
const operadorEmail =
  process.env.SEED_OPERADOR_EMAIL?.trim() ||
  process.env.PLAYWRIGHT_CAIXA_TEST_EMAIL?.trim() ||
  "e2e-operador@localhost.test";

async function signIn(email) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session?.access_token) {
    throw new Error(`Login falhou (${email}): ${error?.message || "sem token"}`);
  }
  return data.session.access_token;
}

async function main() {
  if (!url || !anonKey) {
    console.error("Defina SUPABASE_URL e SUPABASE_ANON_KEY (ou NEXT_PUBLIC_*).");
    process.exit(2);
  }
  if (!password) {
    console.error(
      "Defina SEED_DEV_PASSWORD, PLAYWRIGHT_TEST_PASSWORD ou CI_RLS_SMOKE_SEED_PASSWORD.",
    );
    process.exit(2);
  }

  const [painel, caixa] = await Promise.all([
    signIn(gerenteEmail),
    signIn(operadorEmail),
  ]);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ RLS_SMOKE_JWT_PAINEL: painel, RLS_SMOKE_JWT_CAIXA: caixa }));
    return;
  }

  console.log(`RLS_SMOKE_JWT_PAINEL=${painel}`);
  console.log(`RLS_SMOKE_JWT_CAIXA=${caixa}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
