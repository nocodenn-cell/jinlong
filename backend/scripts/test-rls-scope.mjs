#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const POSTGRES_URL = process.env.POSTGRES_URL ?? "";

const USERS = [
  { perfil: "OPERADOR", email: process.env.RLS_OPERADOR_EMAIL ?? "test_operador@example.com", password: process.env.RLS_OPERADOR_PASSWORD ?? "Test@123456" },
  { perfil: "GERENTE", email: process.env.RLS_GERENTE_EMAIL ?? "test_gerente@example.com", password: process.env.RLS_GERENTE_PASSWORD ?? "Test@123456" },
  { perfil: "DONO", email: process.env.RLS_DONO_EMAIL ?? "test_dono@example.com", password: process.env.RLS_DONO_PASSWORD ?? "Test@123456" },
  { perfil: "ADMIN", email: process.env.RLS_ADMIN_EMAIL ?? "test_admin@example.com", password: process.env.RLS_ADMIN_PASSWORD ?? "Test@123456" },
];

const IDS = {
  loja: "b0000001-0000-4000-8000-000000000001",
  categoria: "b0000002-0000-4000-8000-000000000001",
  produto: "b0000003-0000-4000-8000-000000000001",
  caixaOperador: "b0000004-0000-4000-8000-000000000001",
  caixaGerente: "b0000004-0000-4000-8000-000000000002",
  vendaOperador: "b0000005-0000-4000-8000-000000000001",
  vendaGerente: "b0000005-0000-4000-8000-000000000002",
};

function requireEnv(name, value) {
  if (!value) throw new Error(`Env obrigatório ausente: ${name}`);
}

function reportLine(ok, rule, detail = "") {
  const badge = ok ? "PASS" : "FAIL";
  const text = detail ? `${rule} -> ${detail}` : rule;
  console.log(`[${badge}] ${text}`);
}

async function ensureUsersAndSeed() {
  requireEnv("SUPABASE_URL", SUPABASE_URL);
  requireEnv("SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);
  requireEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);
  requireEnv("POSTGRES_URL", POSTGRES_URL);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const authByPerfil = {};
  for (const u of USERS) {
    const createRes = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { perfil: u.perfil },
    });
    if (createRes.error && !String(createRes.error.message).toLowerCase().includes("already")) {
      throw new Error(`Falha ao criar user ${u.perfil}: ${createRes.error.message}`);
    }
    let userId = createRes.data.user?.id ?? null;
    if (!userId) {
      const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (list.error) throw new Error(`Falha listUsers: ${list.error.message}`);
      userId = list.data.users.find((x) => x.email?.toLowerCase() === u.email.toLowerCase())?.id ?? null;
    }
    if (!userId) throw new Error(`User id não encontrado para ${u.email}`);
    authByPerfil[u.perfil] = userId;
  }

  const sql = `
DO $$
BEGIN
  INSERT INTO public.lojas (id, nome, codigo, ativo)
  VALUES ('${IDS.loja}'::uuid, 'Loja Teste RLS', 'LOJA-RLS', true)
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, codigo = EXCLUDED.codigo, ativo = true;

  INSERT INTO public.categorias (id, nome)
  VALUES ('${IDS.categoria}'::uuid, 'Categoria RLS')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo)
  VALUES ('${IDS.produto}'::uuid, '7890000000001', 'Produto RLS', '${IDS.categoria}'::uuid, 10.00, 'china_manual', false, true)
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, preco_varejo = EXCLUDED.preco_varejo, ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, idioma_preferido, ativo, loja_id)
  VALUES
    ('${authByPerfil.OPERADOR}'::uuid, 'Operador RLS', 'OPERADOR', 'pt', true, '${IDS.loja}'::uuid),
    ('${authByPerfil.GERENTE}'::uuid,  'Gerente RLS',  'GERENTE',  'pt', true, '${IDS.loja}'::uuid),
    ('${authByPerfil.DONO}'::uuid,     'Dono RLS',     'DONO',     'pt', true, '${IDS.loja}'::uuid),
    ('${authByPerfil.ADMIN}'::uuid,    'Admin RLS',    'ADMIN',    'pt', true, '${IDS.loja}'::uuid)
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    perfil = EXCLUDED.perfil,
    ativo = true,
    loja_id = EXCLUDED.loja_id;

  INSERT INTO public.estoque (produto_id, quantidade_atual, estoque_minimo, loja_id)
  VALUES ('${IDS.produto}'::uuid, 100, 5, '${IDS.loja}'::uuid)
  ON CONFLICT (loja_id, produto_id) DO UPDATE SET quantidade_atual = EXCLUDED.quantidade_atual, estoque_minimo = EXCLUDED.estoque_minimo;

  INSERT INTO public.caixas (id, operador_id, valor_inicial, status, loja_id)
  VALUES
    ('${IDS.caixaOperador}'::uuid, '${authByPerfil.OPERADOR}'::uuid, 100, 'ABERTO', '${IDS.loja}'::uuid),
    ('${IDS.caixaGerente}'::uuid, '${authByPerfil.GERENTE}'::uuid, 100, 'ABERTO', '${IDS.loja}'::uuid)
  ON CONFLICT (id) DO UPDATE SET operador_id = EXCLUDED.operador_id, loja_id = EXCLUDED.loja_id, status = 'ABERTO';

  INSERT INTO public.vendas (id, caixa_id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
  VALUES
    ('${IDS.vendaOperador}'::uuid, '${IDS.caixaOperador}'::uuid, '${authByPerfil.OPERADOR}'::uuid, 50, 0, 50, 'PIX', 'CONCLUIDA'),
    ('${IDS.vendaGerente}'::uuid, '${IDS.caixaGerente}'::uuid, '${authByPerfil.GERENTE}'::uuid, 70, 0, 70, 'PIX', 'CONCLUIDA')
  ON CONFLICT (id) DO UPDATE SET operador_id = EXCLUDED.operador_id, caixa_id = EXCLUDED.caixa_id;
END$$;
`;
  execSync(`psql "${POSTGRES_URL}" -v ON_ERROR_STOP=1 -c "${sql.replace(/\n/g, " ")}"`, { stdio: "inherit" });
  return authByPerfil;
}

async function login(email, password) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Falha login ${email}: ${error?.message ?? "sem sessão"}`);
  return client;
}

async function main() {
  const authByPerfil = await ensureUsersAndSeed();
  const results = [];
  const run = async (rule, fn) => {
    try {
      await fn();
      results.push({ rule, ok: true });
      reportLine(true, rule);
    } catch (e) {
      results.push({ rule, ok: false, detail: e.message });
      reportLine(false, rule, e.message);
    }
  };

  const operador = await login(USERS[0].email, USERS[0].password);
  const gerente = await login(USERS[1].email, USERS[1].password);
  const dono = await login(USERS[2].email, USERS[2].password);
  const admin = await login(USERS[3].email, USERS[3].password);

  await run("OPERADOR only_own em vendas", async () => {
    const { data, error } = await operador.from("vendas").select("id,operador_id").limit(20);
    if (error) throw new Error(error.message);
    const bad = (data ?? []).filter((r) => r.operador_id !== authByPerfil.OPERADOR);
    if (bad.length > 0) throw new Error(`${bad.length} venda(s) fora do escopo do operador`);
  });

  await run("OPERADOR não pode UPDATE em produtos", async () => {
    const { data, error } = await operador
      .from("produtos")
      .update({ nome: "Produto RLS X" })
      .eq("id", IDS.produto)
      .select("id");
    if (!error && Array.isArray(data) && data.length > 0) {
      throw new Error("UPDATE de produto foi permitido para OPERADOR");
    }
  });

  await run("GERENTE pode SELECT vendas da loja", async () => {
    const { data, error } = await gerente.from("vendas").select("id").limit(20);
    if (error) throw new Error(error.message);
    if (!Array.isArray(data) || data.length < 2) {
      throw new Error("GERENTE não enxergou vendas esperadas da loja");
    }
  });

  await run("ADMIN pode SELECT vendas da loja", async () => {
    const { data, error } = await admin.from("vendas").select("id").limit(20);
    if (error) throw new Error(error.message);
    if (!Array.isArray(data) || data.length < 2) {
      throw new Error("ADMIN não enxergou vendas esperadas da loja");
    }
  });

  await run("DONO pode SELECT macro de estoque/vendas", async () => {
    const [estoque, vendas] = await Promise.all([
      dono.from("estoque").select("id").limit(20),
      dono.from("vendas").select("id").limit(20),
    ]);
    if (estoque.error) throw new Error(`estoque: ${estoque.error.message}`);
    if (vendas.error) throw new Error(`vendas: ${vendas.error.message}`);
    if ((estoque.data ?? []).length === 0 || (vendas.data ?? []).length === 0) {
      throw new Error("DONO sem visibilidade esperada");
    }
  });

  await run("OPERADOR não acessa documentos_fiscais_eventos", async () => {
    const { data, error } = await operador.from("documentos_fiscais_eventos").select("id").limit(5);
    if (error) throw new Error(error.message);
    if (Array.isArray(data) && data.length > 0) {
      throw new Error("OPERADOR recebeu registros de documentos_fiscais_eventos");
    }
  });

  await run("GERENTE acessa v_estoque_baixo", async () => {
    const { error } = await gerente.from("v_estoque_baixo").select("id,loja_id").limit(5);
    if (error) throw new Error(error.message);
  });

  await run("OPERADOR bloqueado em contas_receber", async () => {
    const { data, error } = await operador.from("contas_receber").select("id").limit(5);
    if (error) throw new Error(error.message);
    if (Array.isArray(data) && data.length > 0) {
      throw new Error("OPERADOR recebeu registros de contas_receber");
    }
  });

  await Promise.all([
    operador.auth.signOut(),
    gerente.auth.signOut(),
    dono.auth.signOut(),
    admin.auth.signOut(),
  ]);

  const failed = results.filter((r) => !r.ok);
  console.log(`\nResumo: ${results.length - failed.length}/${results.length} regras passaram.`);
  if (failed.length > 0) {
    console.error("Falhas:");
    for (const f of failed) console.error(`- ${f.rule}: ${f.detail}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
