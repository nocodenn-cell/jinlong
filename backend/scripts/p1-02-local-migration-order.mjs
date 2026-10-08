#!/usr/bin/env node
/**
 * P1-02 — validação local isolada da ordem das migrations de reconciliação.
 *
 * - Postgres local sintético (sem dados reais / PII).
 * - Aplica a cadeia com stubs mínimos das pré-condições.
 * - EXCLUI 20261007163100 (bloqueada até validação fiscal/comercial).
 * - NÃO toca remoto; NÃO usa db push.
 *
 * Uso:
 *   DATABASE_URL=postgresql://fp_rollout:fp_rollout_local@127.0.0.1:5432/fp_rollout_p0 \
 *     node backend/scripts/p1-02-local-migration-order.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");
const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://fp_rollout:fp_rollout_local@127.0.0.1:5432/fp_rollout_p0";

/** Ordem canônica sem 163100 (NO-GO comercial). */
const ORDER = [
  "20261007161220_fiscal_cancelado_ssot.sql",
  "20261007163000_ssot_001_002_painel_ec_cache.sql",
  // "20261007163100_ssot_003_nfe_obrigacao_duplicata.sql" — BLOQUEADA
  "20261007163200_ssot_004_revoke_insert_documentos_fiscais.sql",
  "20261007170000_ssot_002_mov_ar_ec_cache.sql",
  "20261007171000_ssot_002_cancel_guard_antes_devolucao.sql",
  "20261007180000_calcular_valor_sistema_por_forma_caixa.sql",
  "20261007190000_caixas_fechamento_formas_snapshot.sql",
  "20261008140000_formas_pagamento_conta_financeira_id.sql",
  "20261008140100_financeiro_comando_v1_wrapper.sql",
];

function psql(sql, { file = false } = {}) {
  const args = [DB_URL, "-v", "ON_ERROR_STOP=1", "-q"];
  if (file) args.push("-f", sql);
  else args.push("-c", sql);
  return execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function bootstrap() {
  psql(`
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS internal CASCADE;
DROP SCHEMA IF EXISTS auth CASCADE;
CREATE SCHEMA public;
CREATE SCHEMA internal;
CREATE SCHEMA auth;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$roles$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.lojas (id uuid PRIMARY KEY, nome text);
CREATE TABLE public.usuarios (
  id uuid PRIMARY KEY, loja_id uuid REFERENCES public.lojas(id),
  perfil text, ativo boolean DEFAULT true, nome text
);
CREATE TABLE public.clientes (id uuid PRIMARY KEY, loja_id uuid, nome text);
CREATE TABLE public.fornecedores (id uuid PRIMARY KEY, loja_id uuid, nome text);
CREATE TABLE public.produtos (id uuid PRIMARY KEY, loja_id uuid, nome text, ativo boolean DEFAULT true);
CREATE TABLE public.caixas (
  id uuid PRIMARY KEY, loja_id uuid, saldo_atual numeric DEFAULT 0,
  status text DEFAULT 'ABERTO', data_abertura timestamptz DEFAULT now(),
  data_fechamento timestamptz, valor_fechamento numeric, fechamento_diferenca numeric,
  operador_id uuid, conta_financeira_id uuid
);
CREATE TABLE public.vendas (
  id uuid PRIMARY KEY, caixa_id uuid, loja_id uuid, status text,
  total_liquido numeric, forma_pagamento text, data timestamptz DEFAULT now(),
  operador_id uuid
);
CREATE TABLE public.vendas_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), venda_id uuid, valor numeric, forma_pagamento text
);
CREATE TABLE public.devolucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), venda_id uuid, valor numeric,
  forma_pagamento text, operacao_id uuid, caixa_desembolso_id uuid
);
CREATE TABLE public.venda_pos_venda_operacoes (id uuid PRIMARY KEY, forma_estorno text, caixa_id uuid);
CREATE TABLE public.itens_venda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), venda_id uuid, produto_id uuid,
  quantidade numeric, custo_unitario_snap numeric, preco_unitario numeric
);
CREATE TABLE public.movimentacoes_caixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), caixa_id uuid, tipo text, valor numeric,
  status text, deleted_at timestamptz, forma_pagamento text, created_at timestamptz DEFAULT now(),
  movimentacao_origem_id uuid
);
CREATE TABLE public.documentos_fiscais_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid, venda_id uuid,
  status text DEFAULT 'pendente', payload jsonb DEFAULT '{}'::jsonb,
  tentativas int DEFAULT 0, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.formas_pagamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid NOT NULL,
  codigo text NOT NULL, nome text NOT NULL, ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  UNIQUE (loja_id, codigo)
);
CREATE TABLE public.contas_financeiras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid, nome text,
  tipo text, ativo boolean DEFAULT true
);
CREATE TABLE public.financeiro_comandos (
  id uuid PRIMARY KEY, loja_id uuid, usuario_id uuid, tipo text,
  dados jsonb, resultado jsonb, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.financeiro_recebiveis_venda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid, venda_id uuid,
  pagamento_id uuid, forma text, bruto numeric, previsao date,
  conta_financeira_id uuid, taxa numeric, status text DEFAULT 'PENDENTE',
  parcela int DEFAULT 1, recebimento_atual_id uuid
);
CREATE TABLE public.movimentos_financeiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid, conta_financeira_id uuid,
  valor numeric, data date, descricao text, origem text, origem_id uuid,
  categoria_id uuid, criado_por uuid, created_at timestamptz DEFAULT now(), estorno_de uuid
);
CREATE TABLE public.contas_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid, cliente_id uuid,
  valor_total numeric, valor_aberto numeric, status text DEFAULT 'ABERTO'
);
CREATE TABLE public.liquidacoes_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), titulo_id uuid, valor numeric,
  forma_pagamento text, loja_id uuid, caixa_id uuid, created_by uuid,
  idempotency_key text, origem text
);
CREATE TABLE public.contas_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid, fornecedor_id uuid,
  nfe_importacao_id uuid, valor_total numeric, valor_pago numeric DEFAULT 0, status text
);
CREATE TABLE public.nfe_importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid, status text,
  payload jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE public.estoque (
  produto_id uuid, loja_id uuid, quantidade numeric DEFAULT 0, PRIMARY KEY (produto_id, loja_id)
);
CREATE TABLE public.movimentos_estoque_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid, produto_id uuid,
  quantidade numeric, tipo text, created_at timestamptz DEFAULT now()
);

-- Stubs de RPCs que as migrations SSOT substituem / estendem.
CREATE OR REPLACE FUNCTION public.round_abnt(numeric, integer) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$ SELECT round($1, $2) $$;

CREATE OR REPLACE FUNCTION internal.valor_sistema_dinheiro(p_caixa_id uuid) RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT saldo_atual FROM public.caixas WHERE id = p_caixa_id), 0)
$$;

CREATE OR REPLACE FUNCTION internal.sincronizar_saldo_cache(p_caixa_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.caixas
  SET saldo_atual = internal.valor_sistema_dinheiro(p_caixa_id)
  WHERE id = p_caixa_id AND status = 'ABERTO';
END $$;

CREATE OR REPLACE FUNCTION internal.financeiro_loja() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT loja_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
$$;

-- Já em E(c): caminho NOTICE do SSOT-001 (sem exigir patch string-exact).
CREATE OR REPLACE FUNCTION public.financeiro_painel(p_de date, p_ate date, p_page integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l uuid := internal.financeiro_loja();
  pdv numeric;
  v_resultado jsonb := '{}'::jsonb;
BEGIN
  SELECT coalesce((
    SELECT sum(internal.valor_sistema_dinheiro(c.id))
    FROM public.caixas c WHERE c.loja_id = l AND c.status = 'ABERTO'
  ), 0) INTO pdv;
  RETURN v_resultado || jsonb_build_object('saldo_pdv', pdv);
END $$;

CREATE OR REPLACE FUNCTION public.registrar_venda_evento(
  p_tipo text, p_venda_id uuid, p_source text, p_caixa_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;

CREATE OR REPLACE FUNCTION public.financeiro_comando(p_tipo text, p_dados jsonb, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN jsonb_build_object('ok', true, 'stub', true, 'tipo', p_tipo);
END $$;

CREATE OR REPLACE FUNCTION public.confirmar_importacao_nfe(p_importacao_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN jsonb_build_object('ok', true, 'stub', true);
END $$;

CREATE OR REPLACE FUNCTION public.fiscal_enfileirar_documento_venda(
  p_venda_id uuid, p_tipo text, p_payload jsonb, p_loja_id uuid
) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT gen_random_uuid()
$$;

-- Dropar stubs de assinatura frágil — as migrations recriam as RPCs canônicas.
DROP FUNCTION IF EXISTS public.fiscal_marcar_emitido(uuid, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.fiscal_marcar_cancelado(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.fiscal_cancelar_documento(uuid, text);
DROP FUNCTION IF EXISTS public.cancelar_venda_transacional(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.registrar_movimentacao(
  uuid, text, text, numeric, text, text, text, uuid, text, inet, text, text, text, uuid, uuid
);
DROP FUNCTION IF EXISTS public.aprovar_movimentacao(uuid, inet, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.registrar_liquidacao_receber(uuid, numeric, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.estornar_liquidacao_receber(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.fechar_caixa_atomico(uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.trg_creditar_saldo_caixa_venda_dinheiro()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;

GRANT USAGE ON SCHEMA public, internal, auth TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
REVOKE INSERT ON public.documentos_fiscais_pendentes FROM authenticated, anon;
`);
}

function postconditions() {
  const out = psql(`
SELECT json_build_object(
  'has_fiscal_marcar_cancelado', to_regprocedure('public.fiscal_marcar_cancelado(uuid,text,jsonb)') IS NOT NULL,
  'has_calc_forma', to_regprocedure('public.calcular_valor_sistema_por_forma_caixa(uuid)') IS NOT NULL,
  'has_fechamento_formas', to_regclass('public.caixas_fechamento_formas') IS NOT NULL,
  'has_fp_conta', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='formas_pagamento' AND column_name='conta_financeira_id'
  ),
  'has_fin_cmd_v1', to_regprocedure('public.financeiro_comando_v1(text,jsonb,uuid)') IS NOT NULL,
  'has_fin_cmd', to_regprocedure('public.financeiro_comando(text,jsonb,uuid)') IS NOT NULL,
  'has_confirmar_nfe', to_regprocedure('public.confirmar_importacao_nfe(uuid)') IS NOT NULL,
  'insert_docs_authenticated', has_table_privilege('authenticated','public.documentos_fiscais_pendentes','INSERT')
) AS j;
`);
  const m = out.match(/\{.*\}/s);
  if (!m) throw new Error(`Falha ao ler pós-condições: ${out}`);
  return JSON.parse(m[0]);
}

function main() {
  console.log("P1-02 local order validation");
  console.log(`DB: ${DB_URL.replace(/:[^:@/]+@/, ":***@")}`);
  console.log(`Migrations: ${ORDER.length} (163100 excluída)`);

  bootstrap();
  const applied = [];
  for (const file of ORDER) {
    const full = path.join(MIGRATIONS, file);
    if (!fs.existsSync(full)) throw new Error(`Arquivo ausente: ${file}`);
    process.stdout.write(`APPLY ${file} ... `);
    try {
      psql(full, { file: true });
      console.log("OK");
      applied.push({ file, status: "OK" });
    } catch (e) {
      const err = e.stderr?.toString?.() || e.message;
      console.log("FAIL");
      console.error(err);
      process.exit(1);
    }
  }

  console.log("\nReaplicar (idempotência operacional)...");
  for (const file of ORDER) {
    const full = path.join(MIGRATIONS, file);
    process.stdout.write(`REAPPLY ${file} ... `);
    try {
      psql(full, { file: true });
      console.log("OK");
    } catch (e) {
      const err = e.stderr?.toString?.() || e.message;
      console.log("FAIL");
      console.error(err);
      process.exit(1);
    }
  }

  const pc = postconditions();
  console.log("\nPós-condições:", JSON.stringify(pc, null, 2));
  const required = [
    "has_fiscal_marcar_cancelado",
    "has_calc_forma",
    "has_fechamento_formas",
    "has_fp_conta",
    "has_fin_cmd_v1",
    "has_fin_cmd",
  ];
  for (const k of required) {
    if (!pc[k]) {
      console.error(`Pós-condição falhou: ${k}`);
      process.exit(1);
    }
  }
  if (pc.insert_docs_authenticated === true) {
    console.error("SSOT-004 falhou: authenticated ainda pode INSERT em documentos_fiscais_pendentes");
    process.exit(1);
  }

  // Smoke financeiro sintético do wrapper
  const loja = "11111111-1111-1111-1111-111111111111";
  const user = "22222222-2222-2222-2222-222222222222";
  const conta = "33333333-3333-3333-3333-333333333333";
  psql(`
INSERT INTO public.lojas(id,nome) VALUES ('${loja}','Loja sintética') ON CONFLICT DO NOTHING;
INSERT INTO public.usuarios(id,loja_id,perfil,ativo,nome) VALUES ('${user}','${loja}','DONO',true,'Synth') ON CONFLICT DO NOTHING;
INSERT INTO public.contas_financeiras(id,loja_id,nome,tipo,ativo) VALUES ('${conta}','${loja}','Caixa','RESERVA',true) ON CONFLICT DO NOTHING;
INSERT INTO public.formas_pagamento(loja_id,codigo,nome,ativo) VALUES ('${loja}','DINHEIRO','Dinheiro',true)
  ON CONFLICT (loja_id,codigo) DO NOTHING;
SELECT set_config('request.jwt.claim.sub','${user}',false);
SELECT public.financeiro_comando(
  'VINCULAR_FORMA_PAGAMENTO',
  jsonb_build_object('codigo','DINHEIRO','conta_id','${conta}'),
  '44444444-4444-4444-4444-444444444444'::uuid
) AS r;
`);
  console.log("Smoke VINCULAR_FORMA_PAGAMENTO: OK");

  const report = {
    ok: true,
    excluded: ["20261007163100_ssot_003_nfe_obrigacao_duplicata.sql"],
    applied,
    postconditions: pc,
    note: "Clone sintético local; não representa volume/prod; 163100 permanece NO-GO.",
  };
  const outPath = "/opt/cursor/artifacts/p1-02-local-order-report.json";
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nRelatório: ${outPath}`);
}

main();
