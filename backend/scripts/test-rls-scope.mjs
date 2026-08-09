#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

// Nomes alinhados ao `supabase status -o env` (CLI recente) + aliases usados em docs/CI antigos.
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.API_URL ?? "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.ANON_KEY ?? process.env.PUBLISHABLE_KEY ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? "";
const POSTGRES_URL = process.env.POSTGRES_URL ?? process.env.DB_URL ?? "";

const USERS = [
  { perfil: "OPERADOR", email: process.env.RLS_OPERADOR_EMAIL ?? "test_operador@example.com", password: process.env.RLS_OPERADOR_PASSWORD ?? "Test@123456" },
  { perfil: "GERENTE", email: process.env.RLS_GERENTE_EMAIL ?? "test_gerente@example.com", password: process.env.RLS_GERENTE_PASSWORD ?? "Test@123456" },
  { perfil: "DONO", email: process.env.RLS_DONO_EMAIL ?? "test_dono@example.com", password: process.env.RLS_DONO_PASSWORD ?? "Test@123456" },
  { perfil: "ADMIN", email: process.env.RLS_ADMIN_EMAIL ?? "test_admin@example.com", password: process.env.RLS_ADMIN_PASSWORD ?? "Test@123456" },
];

const IDS = {
  loja: "b0000001-0000-4000-8000-000000000001",
  loja2: "c0000001-0000-4000-8000-000000000001",
  categoria: "b0000002-0000-4000-8000-000000000001",
  produto: "b0000003-0000-4000-8000-000000000001",
  caixaOperador: "b0000004-0000-4000-8000-000000000001",
  caixaGerente: "b0000004-0000-4000-8000-000000000002",
  caixaFilial: "b0000004-0000-4000-8000-000000000003",
  vendaOperador: "b0000005-0000-4000-8000-000000000001",
  vendaGerente: "b0000005-0000-4000-8000-000000000002",
  vendaFilial: "b0000005-0000-4000-8000-000000000003",
  tituloReceber: "b0000006-0000-4000-8000-000000000001",
  clienteReceber: "b0000007-0000-4000-8000-000000000001",
  remessaConferencia: "c0000002-0000-4000-8000-000000000001",
  remessaItem: "c0000002-0000-4000-8000-000000000002",
  pricingVersion: "d0000001-0000-4000-8000-000000000001",
};

function requireEnv(name, value) {
  if (!value) throw new Error(`Env obrigatório ausente: ${name}`);
}

function reportLine(ok, rule, detail = "") {
  const badge = ok ? "PASS" : "FAIL";
  const text = detail ? `${rule} -> ${detail}` : rule;
  console.log(`[${badge}] ${text}`);
}

async function assertRpcOk(client, name, args = {}) {
  const { error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
}

async function assertRpcErrorContains(client, name, args, substring) {
  const { error } = await client.rpc(name, args);
  const msg = error?.message ?? "";
  if (!msg.includes(substring)) {
    throw new Error(`Esperava mensagem contendo "${substring}" em ${name}; obtido: ${msg || "(sem erro)"}`);
  }
}

// Para RPCs privilegiadas (service_role-only): valida que a chamada direta via
// JWT (authenticated) e negada com `permission denied` — propriedade de seguranca.
async function assertRpcDenied(client, name, args = {}) {
  const { error } = await client.rpc(name, args);
  const msg = error?.message ?? "";
  if (!/permission denied/i.test(msg)) {
    throw new Error(`Esperava 'permission denied' em ${name}; obtido: ${msg || "(sem erro)"}`);
  }
}

function monthDateRange() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, d.getMonth() + 1, 0).getDate();
  return { p_de: `${y}-${m}-01`, p_ate: `${y}-${m}-${String(last).padStart(2, "0")}` };
}

async function ensureUsersAndSeed() {
  requireEnv("SUPABASE_URL ou API_URL", SUPABASE_URL);
  requireEnv("SUPABASE_ANON_KEY ou ANON_KEY ou PUBLISHABLE_KEY", SUPABASE_ANON_KEY);
  requireEnv("SUPABASE_SERVICE_ROLE_KEY ou SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);
  requireEnv("POSTGRES_URL ou DB_URL", POSTGRES_URL);

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

  // SQL puro (sem bloco `DO $$ ... $$`): a string é passada ao psql via `-c "..."`
  // dentro de aspas duplas, e no shell do runner Linux (/bin/sh) `$$` expandiria
  // para o PID do processo (gerando `syntax error at or near "<pid>"`). Como o seed
  // não usa nenhum recurso plpgsql, rodamos as instruções como script SQL simples.
  const sql = `
  INSERT INTO public.lojas (id, nome, codigo, ativo)
  VALUES ('${IDS.loja}'::uuid, 'Loja Teste RLS', 'LOJA-RLS', true)
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, codigo = EXCLUDED.codigo, ativo = true;

  INSERT INTO public.lojas (id, nome, codigo, ativo)
  VALUES ('${IDS.loja2}'::uuid, 'Loja Teste RLS Filial', 'LOJA-RLS-B', true)
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
  ON CONFLICT (loja_id, produto_id) DO UPDATE SET quantidade_atual = 100, estoque_minimo = EXCLUDED.estoque_minimo;

  INSERT INTO public.estoque (produto_id, quantidade_atual, estoque_minimo, loja_id)
  VALUES ('${IDS.produto}'::uuid, 20, 1, '${IDS.loja2}'::uuid)
  ON CONFLICT (loja_id, produto_id) DO UPDATE SET quantidade_atual = 20, estoque_minimo = EXCLUDED.estoque_minimo;

  DELETE FROM public.estoque_baixas
  WHERE venda_id IN ('${IDS.vendaOperador}'::uuid, '${IDS.vendaGerente}'::uuid, '${IDS.vendaFilial}'::uuid)
    AND produto_id = '${IDS.produto}'::uuid;

  DELETE FROM public.movimentos_estoque_log WHERE remessa_id = '${IDS.remessaConferencia}'::uuid;
  DELETE FROM public.remessa_itens WHERE remessa_id = '${IDS.remessaConferencia}'::uuid;
  DELETE FROM public.remessas WHERE id = '${IDS.remessaConferencia}'::uuid;

  INSERT INTO public.remessas (id, loja_id, origem_descricao, status, created_by)
  VALUES (
    '${IDS.remessaConferencia}'::uuid,
    '${IDS.loja2}'::uuid,
    'Seed remessa RLS (conferência)',
    'EM_CONFERENCIA',
    '${authByPerfil.GERENTE}'::uuid
  );

  INSERT INTO public.remessa_itens (id, remessa_id, produto_id, quantidade_esperada, quantidade_conferida)
  VALUES (
    '${IDS.remessaItem}'::uuid,
    '${IDS.remessaConferencia}'::uuid,
    '${IDS.produto}'::uuid,
    3,
    3
  );

  INSERT INTO public.caixas (id, operador_id, valor_inicial, status, loja_id)
  VALUES
    ('${IDS.caixaOperador}'::uuid, '${authByPerfil.OPERADOR}'::uuid, 100, 'ABERTO', '${IDS.loja}'::uuid),
    ('${IDS.caixaGerente}'::uuid, '${authByPerfil.GERENTE}'::uuid, 100, 'ABERTO', '${IDS.loja}'::uuid),
    ('${IDS.caixaFilial}'::uuid, '${authByPerfil.OPERADOR}'::uuid, 100, 'ABERTO', '${IDS.loja2}'::uuid)
  ON CONFLICT (id) DO UPDATE SET operador_id = EXCLUDED.operador_id, loja_id = EXCLUDED.loja_id, status = 'ABERTO';

  UPDATE public.pricing_config_versions
     SET is_active = false
   WHERE id <> '${IDS.pricingVersion}'::uuid;

  INSERT INTO public.pricing_config_versions (id, label, description, created_by, is_active, activated_at, activated_by)
  VALUES (
    '${IDS.pricingVersion}'::uuid,
    'Smoke RLS pricing version',
    'Versao ativa para validar escopo de registrar_pricing_version_venda',
    '${authByPerfil.GERENTE}'::uuid,
    true,
    now(),
    '${authByPerfil.GERENTE}'::uuid
  )
  ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    is_active = true,
    activated_at = EXCLUDED.activated_at,
    activated_by = EXCLUDED.activated_by;

  INSERT INTO public.vendas (id, caixa_id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
  VALUES
    ('${IDS.vendaOperador}'::uuid, '${IDS.caixaOperador}'::uuid, '${authByPerfil.OPERADOR}'::uuid, 50, 0, 50, 'PIX', 'CONCLUIDA'),
    ('${IDS.vendaGerente}'::uuid, '${IDS.caixaGerente}'::uuid, '${authByPerfil.GERENTE}'::uuid, 70, 0, 70, 'PIX', 'CONCLUIDA'),
    ('${IDS.vendaFilial}'::uuid, '${IDS.caixaFilial}'::uuid, '${authByPerfil.OPERADOR}'::uuid, 30, 0, 30, 'PIX', 'CONCLUIDA')
  ON CONFLICT (id) DO UPDATE SET
    operador_id = EXCLUDED.operador_id,
    caixa_id = EXCLUDED.caixa_id,
    pricing_version_id = NULL;

  INSERT INTO public.clientes (id, nome, documento, loja_id)
  VALUES ('${IDS.clienteReceber}'::uuid, 'Cliente RLS Fiado', '00000000000', '${IDS.loja}'::uuid)
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, loja_id = EXCLUDED.loja_id;

  INSERT INTO public.contas_receber (id, cliente_id, descricao, valor_total, valor_aberto, status, loja_id)
  VALUES (
    '${IDS.tituloReceber}'::uuid,
    '${IDS.clienteReceber}'::uuid,
    'Título seed RLS',
    999.99,
    999.99,
    'ABERTO',
    '${IDS.loja}'::uuid
  )
  ON CONFLICT (id) DO UPDATE SET
    valor_aberto = EXCLUDED.valor_aberto,
    valor_total = EXCLUDED.valor_total,
    status = 'ABERTO',
    loja_id = EXCLUDED.loja_id;
`;
  const sqlOneLine = sql.replace(/\n/g, " ");
  const psqlCmd = process.env.PSQL_CMD?.trim();
  const execLine = psqlCmd
    ? `${psqlCmd} -v ON_ERROR_STOP=1 -c "${sqlOneLine}"`
    : process.platform === "win32"
      ? `docker exec -i supabase_db_fastproduct psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "${sqlOneLine}"`
      : `psql "${POSTGRES_URL}" -v ON_ERROR_STOP=1 -c "${sqlOneLine}"`;
  execSync(execLine, { stdio: "inherit", shell: true });
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

  const dr = monthDateRange();
  const tz = "America/Sao_Paulo";

  await run("RPC relatorio_tz_validado", async () => {
    await assertRpcOk(operador, "relatorio_tz_validado", { p_tz: tz });
  });

  await run("RPC obter_limite_sangria_sem_gerente", async () => {
    await assertRpcOk(operador, "obter_limite_sangria_sem_gerente");
  });

  await run("RPC pdv_config_para_caixa_web", async () => {
    await assertRpcOk(operador, "pdv_config_para_caixa_web");
  });

  await run("RPC calcular_valor_sistema_dinheiro_caixa", async () => {
    await assertRpcOk(operador, "calcular_valor_sistema_dinheiro_caixa", { p_caixa_id: IDS.caixaOperador });
  });

  // Migration 123 revogou a v2 de `authenticated` para fechar o bypass de
  // revalidacao de preco (clientes JWT devem passar pela v4). Validamos que a
  // chamada direta a v2 e negada — a defesa em camadas que a auditoria pediu.
  await run("RPC finalizar_venda_transacional_canonica_v2 negada a authenticated (bypass fechado)", async () => {
    await assertRpcDenied(operador, "finalizar_venda_transacional_canonica_v2", {
      p_venda_id: IDS.vendaOperador,
      p_caixa_id: IDS.caixaOperador,
    });
  });

  // Migration 289: wrapper de escopo — loja divergente deve falhar ANTES de
  // qualquer escrita (preço/estoque/caixa). Assinatura 21 args (pós-272/274).
  await run("RPC finalizar v4 bloqueia loja divergente da sessão", async () => {
    await assertRpcErrorContains(operador, "finalizar_venda_transacional_canonica_v4", {
      p_venda_id: randomUUID(),
      p_caixa_id: IDS.caixaOperador,
      p_operador_id: authByPerfil.OPERADOR,
      p_loja_id: IDS.loja2,
      p_itens: [],
    }, "FINALIZAR_VENDA_CANONICA_LOJA_INVALIDA");
  });

  await run("RPC finalizar v4 preserva validação após escopo autorizado", async () => {
    await assertRpcErrorContains(operador, "finalizar_venda_transacional_canonica_v4", {
      p_venda_id: randomUUID(),
      p_caixa_id: IDS.caixaOperador,
      p_operador_id: authByPerfil.OPERADOR,
      p_loja_id: IDS.loja,
      p_itens: [],
    }, "FINALIZAR_VENDA_CANONICA_ITENS_INVALIDOS");
  });

  await run("RPC registrar_pricing_version_venda permite venda propria", async () => {
    await assertRpcOk(operador, "registrar_pricing_version_venda", {
      p_venda_id: IDS.vendaOperador,
      p_version_id: IDS.pricingVersion,
    });

    const { data, error } = await operador
      .from("vendas")
      .select("pricing_version_id")
      .eq("id", IDS.vendaOperador)
      .single();
    if (error) throw new Error(error.message);
    if (data?.pricing_version_id !== IDS.pricingVersion) {
      throw new Error(`pricing_version_id nao registrado: ${data?.pricing_version_id ?? "NULL"}`);
    }
  });

  await run("RPC registrar_pricing_version_venda bloqueia venda de outra loja", async () => {
    await assertRpcErrorContains(operador, "registrar_pricing_version_venda", {
      p_venda_id: IDS.vendaFilial,
      p_version_id: IDS.pricingVersion,
    }, "PRICING_VERSION_VENDA_SEM_PERMISSAO");
  });

  await run("RPC finalizar_venda_transacional (itens inválidos)", async () => {
    await assertRpcErrorContains(operador, "finalizar_venda_transacional", {
      p_venda_id: IDS.vendaOperador,
      p_caixa_id: IDS.caixaOperador,
      p_forma_pagamento: "PIX",
      p_total_bruto: 1,
      p_total_desconto: 0,
      p_total_liquido: 1,
      p_itens: [],
    }, "FINALIZAR_VENDA_ITENS_INVALIDOS");
  });

  await run("RPC fiscal_enfileirar_documento_venda", async () => {
    // Passa p_loja_id para desambiguar entre as sobrecargas de 3 e 4 args
    // (sem isso o PostgREST nao escolhe a melhor candidata).
    await assertRpcOk(operador, "fiscal_enfileirar_documento_venda", {
      p_venda_id: IDS.vendaOperador,
      p_tipo_doc: "NFC_E_STUB",
      p_payload: {},
      p_loja_id: IDS.loja,
    });
  });

  await run("RPC decrementar_estoque_seguro", async () => {
    const { data, error } = await operador.rpc("decrementar_estoque_seguro", {
      p_produto_id: IDS.produto,
      p_quantidade: 0.01,
      p_venda_id: IDS.vendaOperador,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row.sucesso !== true) {
      throw new Error(`decrementar_estoque_seguro inesperado: ${JSON.stringify(data)}`);
    }
  });

  await run("RPC recalcular_saldo_caixa", async () => {
    await assertRpcOk(gerente, "recalcular_saldo_caixa", { p_caixa_id: IDS.caixaGerente });
  });

  await run("RPC registrar_movimentacao (suprimento)", async () => {
    await assertRpcOk(operador, "registrar_movimentacao", {
      p_caixa_id: IDS.caixaOperador,
      p_tipo: "suprimento",
      p_forma_pagamento: "dinheiro",
      p_valor: 0.01,
      p_motivo: "Smoke RLS",
      p_idempotency_key: `rls-supr-${randomUUID()}`,
    });
  });

  await run("RPC cancelar_movimentacao (uuid inexistente)", async () => {
    await assertRpcErrorContains(gerente, "cancelar_movimentacao", {
      p_movimentacao_id: randomUUID(),
      p_motivo_cancelamento: "smoke",
    }, "NAO_ENCONTRADA");
  });

  // aprovar_movimentacao e service_role-only: o server action caixaMovimentacoes.impl.ts
  // a chama via admin client. Chamada direta por authenticated deve ser negada.
  await run("RPC aprovar_movimentacao negada a authenticated (service_role-only)", async () => {
    await assertRpcDenied(gerente, "aprovar_movimentacao", {
      p_movimentacao_id: randomUUID(),
    });
  });

  await run("RPC estornar_movimentacao (origem inexistente)", async () => {
    await assertRpcErrorContains(operador, "estornar_movimentacao", {
      p_movimentacao_origem_id: randomUUID(),
      p_motivo: "smoke",
      p_idempotency_key: `rls-est-${randomUUID()}`,
    }, "NAO_ENCONTRADA");
  });

  await run("RPC cancelar_venda_transacional negado a OPERADOR", async () => {
    await assertRpcErrorContains(operador, "cancelar_venda_transacional", {
      p_venda_id: IDS.vendaGerente,
      p_motivo: "smoke rls",
    }, "SEM_PERMISSAO");
  });

  await run("RPC relatorio_vendas_por_dia_periodo", async () => {
    await assertRpcOk(gerente, "relatorio_vendas_por_dia_periodo", { ...dr, p_tz: tz });
  });

  await run("RPC relatorio_top_produtos_periodo", async () => {
    await assertRpcOk(gerente, "relatorio_top_produtos_periodo", {
      ...dr,
      p_limite: 10,
      p_tz: tz,
    });
  });

  await run("RPC relatorio_resumo_executivo_periodo", async () => {
    await assertRpcOk(dono, "relatorio_resumo_executivo_periodo", { ...dr, p_tz: tz });
  });

  await run("RPC registrar_liquidacao_receber (GERENTE)", async () => {
    await assertRpcOk(gerente, "registrar_liquidacao_receber", {
      p_titulo_id: IDS.tituloReceber,
      p_valor: 0.01,
      p_forma_pagamento: "PIX",
      p_observacao: "smoke rls",
    });
  });

  await run("RPC registrar_liquidacao_receber negado a OPERADOR", async () => {
    await assertRpcErrorContains(operador, "registrar_liquidacao_receber", {
      p_titulo_id: IDS.tituloReceber,
      p_valor: 0.01,
      p_forma_pagamento: "PIX",
    }, "LIQUIDACAO_PERFIL");
  });

  // ajustar_estoque_manual e service_role-only: o server action gerente/estoque/actions.ts
  // a chama via admin client. Nenhuma role JWT (OPERADOR/ADMIN/GERENTE) pode chama-la direto.
  await run("RPC ajustar_estoque_manual negado a OPERADOR", async () => {
    await assertRpcDenied(operador, "ajustar_estoque_manual", {
      p_produto_id: IDS.produto,
      p_loja_id: IDS.loja,
      p_quantidade_atual: 100,
      p_estoque_minimo: 5,
      p_motivo_codigo: "ACERTO_INVENTARIO",
    });
  });

  await run("RPC ajustar_estoque_manual negado a ADMIN", async () => {
    await assertRpcDenied(admin, "ajustar_estoque_manual", {
      p_produto_id: IDS.produto,
      p_loja_id: IDS.loja,
      p_quantidade_atual: 100,
      p_estoque_minimo: 5,
      p_motivo_codigo: "ACERTO_INVENTARIO",
    });
  });

  await run("RPC ajustar_estoque_manual negado a GERENTE direto (usa service_role)", async () => {
    await assertRpcDenied(gerente, "ajustar_estoque_manual", {
      p_produto_id: IDS.produto,
      p_loja_id: IDS.loja,
      p_quantidade_atual: 100,
      p_estoque_minimo: 5,
      p_motivo_codigo: "ACERTO_INVENTARIO",
    });
  });

  await run("RPC confirmar_remessa_entrada negado a OPERADOR", async () => {
    await assertRpcErrorContains(operador, "confirmar_remessa_entrada", {
      p_remessa_id: randomUUID(),
    }, "REMESSA_PERFIL");
  });

  await run("RPC confirmar_remessa_entrada (status inválido / id inexistente)", async () => {
    await assertRpcErrorContains(admin, "confirmar_remessa_entrada", {
      p_remessa_id: randomUUID(),
    }, "REMESSA_STATUS_INVALIDO");
  });

  await run("RPC confirmar_remessa_entrada (sucesso)", async () => {
    const remessaQtd = 3;
    const { data: r0, error: er0 } = await dono.from("remessas").select("status").eq("id", IDS.remessaConferencia).single();
    if (er0) throw new Error(er0.message);
    if (r0?.status !== "EM_CONFERENCIA") {
      throw new Error(`remessa seed: esperado EM_CONFERENCIA, veio ${r0?.status}`);
    }
    const { data: e0, error: ee0 } = await dono
      .from("estoque")
      .select("quantidade_atual")
      .eq("loja_id", IDS.loja2)
      .eq("produto_id", IDS.produto)
      .single();
    if (ee0) throw new Error(ee0.message);
    const qAntes = Number(e0.quantidade_atual);

    await assertRpcOk(admin, "confirmar_remessa_entrada", { p_remessa_id: IDS.remessaConferencia });

    const { data: r1, error: er1 } = await dono.from("remessas").select("status").eq("id", IDS.remessaConferencia).single();
    if (er1) throw new Error(er1.message);
    if (r1?.status !== "CONCLUIDA") {
      throw new Error(`após confirmar, esperado CONCLUIDA, veio ${r1?.status}`);
    }
    const { data: e1, error: ee1 } = await dono
      .from("estoque")
      .select("quantidade_atual")
      .eq("loja_id", IDS.loja2)
      .eq("produto_id", IDS.produto)
      .single();
    if (ee1) throw new Error(ee1.message);
    const delta = Number(e1.quantidade_atual) - qAntes;
    if (Math.abs(delta - remessaQtd) > 0.0001) {
      throw new Error(`estoque filial esperado +${remessaQtd}, delta=${delta}`);
    }
  });

  await run("RPC transferir_estoque_entre_lojas (lojas iguais)", async () => {
    await assertRpcErrorContains(admin, "transferir_estoque_entre_lojas", {
      p_loja_origem: IDS.loja,
      p_loja_destino: IDS.loja,
      p_produto_id: IDS.produto,
      p_quantidade: 1,
    }, "LOJA_IGUAL");
  });

  await run("RPC transferir_estoque_entre_lojas negado a OPERADOR", async () => {
    await assertRpcErrorContains(operador, "transferir_estoque_entre_lojas", {
      p_loja_origem: IDS.loja,
      p_loja_destino: IDS.loja2,
      p_produto_id: IDS.produto,
      p_quantidade: 1,
    }, "TRANSFERENCIA_PERFIL");
  });

  await run("RPC transferir_estoque_entre_lojas (sucesso)", async () => {
    const readQtd = async (lojaId) => {
      const { data, error } = await dono
        .from("estoque")
        .select("quantidade_atual")
        .eq("loja_id", lojaId)
        .eq("produto_id", IDS.produto)
        .single();
      if (error) throw new Error(error.message);
      return Number(data.quantidade_atual);
    };
    const origAntes = await readQtd(IDS.loja);
    const dstAntes = await readQtd(IDS.loja2);
    await assertRpcOk(gerente, "transferir_estoque_entre_lojas", {
      p_loja_origem: IDS.loja,
      p_loja_destino: IDS.loja2,
      p_produto_id: IDS.produto,
      p_quantidade: 1,
      p_observacao: "smoke rls transferência",
    });
    const origDepois = await readQtd(IDS.loja);
    const dstDepois = await readQtd(IDS.loja2);
    if (Math.abs(origAntes - origDepois - 1) > 0.0001) {
      throw new Error(`origem esperada -1 unidade (${origAntes} -> ${origDepois})`);
    }
    if (Math.abs(dstDepois - dstAntes - 1) > 0.0001) {
      throw new Error(`destino esperado +1 unidade (${dstAntes} -> ${dstDepois})`);
    }
  });

  await run("RPC fiscal_reprocessar_documento (documento inexistente)", async () => {
    await assertRpcErrorContains(gerente, "fiscal_reprocessar_documento", {
      p_documento_id: randomUUID(),
    }, "FISCAL_DOCUMENTO_NAO_ENCONTRADO");
  });

  // registrar_venda_com_itens nao e exposta a authenticated (revogada no hardening
  // 115; o fluxo de venda atual usa a v3). Chamada direta por JWT deve ser negada.
  await run("RPC registrar_venda_com_itens negada a authenticated", async () => {
    await assertRpcDenied(operador, "registrar_venda_com_itens", {
      p_venda_id: randomUUID(),
      p_caixa_id: IDS.caixaOperador,
      p_operador_id: authByPerfil.OPERADOR,
      p_forma_pagamento: "PIX",
      p_total_bruto: 10,
      p_total_desconto: 0,
      p_total_liquido: 10,
      p_itens: [],
    });
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
