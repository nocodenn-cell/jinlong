#!/usr/bin/env node
/**
 * Smoke de autenticação por perfil para testes de RLS.
 *
 * Ponto crítico corrigido:
 * - createClient usa SUPABASE_URL + SUPABASE_ANON_KEY.
 * - login é feito com auth.signInWithPassword({ email, password }).
 *
 * Env obrigatórios:
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *
 * Env opcionais (se faltar qualquer um, o script pula com exit 0):
 *   RLS_OPERADOR_EMAIL / RLS_OPERADOR_PASSWORD
 *   RLS_GERENTE_EMAIL / RLS_GERENTE_PASSWORD
 *   RLS_DONO_EMAIL / RLS_DONO_PASSWORD
 *   RLS_ADMIN_EMAIL / RLS_ADMIN_PASSWORD
 */

import { createClient } from "@supabase/supabase-js";
import { lookup } from "node:dns/promises";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? "";
const probeProdutoId = process.env.RLS_TEST_PRODUTO_ID ?? "";
const operadorScopeColumn = process.env.RLS_OPERADOR_SCOPE_COLUMN ?? "operador_id";
const operadorScopeLimit = Number.parseInt(process.env.RLS_OPERADOR_SCOPE_LIMIT ?? "20", 10);

const perfis = [
  {
    perfil: "OPERADOR",
    email: process.env.RLS_OPERADOR_EMAIL ?? "",
    password: process.env.RLS_OPERADOR_PASSWORD ?? "",
  },
  {
    perfil: "GERENTE",
    email: process.env.RLS_GERENTE_EMAIL ?? "",
    password: process.env.RLS_GERENTE_PASSWORD ?? "",
  },
  {
    perfil: "DONO",
    email: process.env.RLS_DONO_EMAIL ?? "",
    password: process.env.RLS_DONO_PASSWORD ?? "",
  },
  {
    perfil: "ADMIN",
    email: process.env.RLS_ADMIN_EMAIL ?? "",
    password: process.env.RLS_ADMIN_PASSWORD ?? "",
  },
];

function hasCreds(p) {
  return p.email.trim().length > 0 && p.password.trim().length > 0;
}

function isDnsNotFoundError(err) {
  const causeCode = err?.cause?.code;
  const directCode = err?.code;
  return causeCode === "ENOTFOUND" || directCode === "ENOTFOUND";
}

async function preflightSupabaseDns(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    console.error(`SUPABASE_URL inválida: "${url}"`);
    process.exit(2);
  }

  try {
    await lookup(host);
  } catch (err) {
    if (isDnsNotFoundError(err)) {
      console.error(`Host não resolvido no DNS: ${host}`);
      console.error("Revise o Project URL em Supabase Dashboard > Settings > API.");
      process.exit(2);
    }
    throw err;
  }
}

async function smokeLoginPerfil({ perfil, email, password }) {
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let loginData;
  let loginError;
  try {
    const loginRes = await client.auth.signInWithPassword({ email, password });
    loginData = loginRes.data;
    loginError = loginRes.error;
  } catch (err) {
    if (isDnsNotFoundError(err)) {
      return { perfil, ok: false, etapa: "dns", detalhe: "host Supabase não encontrado (ENOTFOUND)" };
    }
    throw err;
  }

  if (loginError || !loginData?.session) {
    return { perfil, ok: false, etapa: "login", detalhe: loginError?.message ?? "sem sessão" };
  }
  const authUserId = loginData.session.user?.id ?? "";
  if (!authUserId) {
    return { perfil, ok: false, etapa: "login", detalhe: "sessão sem user.id" };
  }

  const { error: selectError } = await client.from("vendas").select("id").limit(1);
  if (selectError) {
    return { perfil, ok: false, etapa: "select_vendas", detalhe: selectError.message };
  }

  if (perfil === "OPERADOR") {
    const selectCols = `id,${operadorScopeColumn}`;
    const { data: scopedRows, error: scopedError } = await client
      .from("vendas")
      .select(selectCols)
      .limit(Number.isFinite(operadorScopeLimit) ? operadorScopeLimit : 20);
    if (scopedError) {
      return {
        perfil,
        ok: false,
        etapa: "scope_vendas_operador",
        detalhe: scopedError.message,
      };
    }
    if (!Array.isArray(scopedRows)) {
      return {
        perfil,
        ok: false,
        etapa: "scope_vendas_operador",
        detalhe: "resposta inesperada ao validar escopo de vendas",
      };
    }

    const outOfScope = scopedRows.filter((row) => row?.[operadorScopeColumn] !== authUserId);
    if (outOfScope.length > 0) {
      return {
        perfil,
        ok: false,
        etapa: "scope_vendas_operador",
        detalhe: `${outOfScope.length} linha(s) de vendas fora do escopo (${operadorScopeColumn} != auth.uid())`,
      };
    }
  }

  if (probeProdutoId && perfil === "OPERADOR") {
    const { data: existingProduto, error: existingProdutoError } = await client
      .from("produtos")
      .select("id,nome")
      .eq("id", probeProdutoId)
      .maybeSingle();
    if (existingProdutoError) {
      return {
        perfil,
        ok: false,
        etapa: "precheck_produto_existente",
        detalhe: existingProdutoError.message,
      };
    }
    if (!existingProduto) {
      return {
        perfil,
        ok: false,
        etapa: "precheck_produto_existente",
        detalhe: `produto ${probeProdutoId} não encontrado/visível para o perfil OPERADOR`,
      };
    }

    // Atualiza para o mesmo valor para evitar mutação acidental de dado real.
    const { data: updateData, error: updateError } = await client
      .from("produtos")
      .update({ nome: existingProduto.nome })
      .eq("id", probeProdutoId)
      .select("id")
      .limit(1);

    const denied = Boolean(updateError) || !Array.isArray(updateData) || updateData.length === 0;
    if (!denied) {
      return {
        perfil,
        ok: false,
        etapa: "update_produto_operador",
        detalhe: `UPDATE inesperadamente permitido no produto ${probeProdutoId}`,
      };
    }
  }

  await client.auth.signOut();
  return {
    perfil,
    ok: true,
    etapa: "ok",
    detalhe: (() => {
      if (probeProdutoId && perfil === "OPERADOR") {
        return "login + escopo vendas OK + UPDATE operador bloqueado em produto existente"
      }
      if (perfil === "OPERADOR") {
        return "login + escopo vendas OK"
      }
      return "login + SELECT vendas OK"
    })(),
  };
}

async function main() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Defina SUPABASE_URL e SUPABASE_ANON_KEY.");
    process.exit(2);
  }
  await preflightSupabaseDns(supabaseUrl);

  const ativos = perfis.filter(hasCreds);
  if (ativos.length === 0) {
    console.log("Smoke RLS login pulado (0 perfis configurados).");
    process.exit(0);
  }

  let failed = false;
  for (const p of ativos) {
    const res = await smokeLoginPerfil(p);
    if (!res.ok) {
      failed = true;
      console.error(`[${res.perfil}] FAIL ${res.etapa}: ${res.detalhe}`);
    } else {
      console.log(`[${res.perfil}] OK ${res.detalhe}`);
    }
  }

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
