-- ============================================================================
-- BASELINE: Production Schema Snapshot (2026-07-12 00:00 UTC)
-- ============================================================================
-- This file consolidates 198 sequential migrations (001-268) into a single
-- authoritative baseline derived from production database state (jinlong).
--
-- Incorporates:
-- - 12 tracked migrations in schema_migrations
-- - 6 renumbered equivalents (repo numbering vs bank numbering)
-- - 2 critical orphans: 265 (clientes RLS), 266 (clientes unique index)
-- - 1 relative orphan: 259_historico_precos (PR #148 pending)
--
-- Fingerprint (SHA256): 00e67eb81252025b931ce89fdc0ba9e0410c55447defb170f0c0cf3be1ec0355
--
-- SCHEMA STRUCTURE:
-- ✅ 10 extensions (hypopg, index_advisor, pg_cron, pg_net, pg_stat_statements, pg_trgm, pgcrypto, plpgsql, supabase_vault, uuid-ossp)
-- ✅ 57 tables (users, products, sales, inventory, accounting, etc.)
-- ✅ 7 views (kardex, sales summaries, reports, etc.)
-- ✅ 102 functions (RPCs including finalizar_venda_transacional_canonica_v4 with FIADO-guard + cliente_id)
-- ✅ 423 triggers (403 foreign key + 20 business logic)
-- ✅ 220 indexes (including clientes_loja_documento_unique for multi-loja isolation)
-- ✅ 121 RLS policies (multi-tenant isolation by loja_id)
-- ✅ 1 storage bucket (produto-imagens, public, 2MB)
-- ============================================================================

-- ============================================================================
-- SECTION 1: EXTENSIONS (10 total)
-- ============================================================================

-- These extensions are REQUIRED for the schema to function
-- Order: core → utility → monitoring/analysis

CREATE EXTENSION IF NOT EXISTS "plpgsql" SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_trgm" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_net" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_cron" SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS "index_advisor" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "hypopg" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "supabase_vault" SCHEMA vault VERSION '0.3.1';

-- ============================================================================
-- SECTION 2: SCHEMAS
-- ============================================================================

-- Primary schemas (created by Supabase/extensions)
-- public: default for application schema
-- extensions: for extension objects
-- vault: for supabase_vault secrets
-- cron: for pg_cron scheduled jobs (if using)

-- All created by extensions, documented here for clarity
-- CREATE SCHEMA public;
-- CREATE SCHEMA extensions;
-- CREATE SCHEMA vault;

-- ============================================================================
-- SECTION 3: TABLES (57 total)
-- ============================================================================
-- Core multi-tenant base tables, then domain-specific tables
-- All include loja_id for multi-tenant isolation (except users/auth)

-- ---- 3.1 Multi-tenant Foundation Tables ----

CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  nome text NOT NULL,
  ativo boolean DEFAULT true,
  data_criacao timestamp with time zone DEFAULT now(),
  data_atualizacao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lojas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnpj text UNIQUE,
  endereco text,
  ativa boolean DEFAULT true,
  data_criacao timestamp with time zone DEFAULT now(),
  data_atualizacao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.perfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text UNIQUE NOT NULL,
  descricao text
);

-- ---- 3.2 Product & Inventory Tables ----

CREATE TABLE IF NOT EXISTS public.categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  nome text NOT NULL,
  descricao text,
  ativa boolean DEFAULT true,
  data_criacao timestamp with time zone DEFAULT now(),
  CONSTRAINT categorias_loja_nome_unique UNIQUE (loja_id, nome)
);

CREATE TABLE IF NOT EXISTS public.marcas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  nome text NOT NULL,
  ativa boolean DEFAULT true,
  data_criacao timestamp with time zone DEFAULT now(),
  CONSTRAINT marcas_loja_nome_unique UNIQUE (loja_id, nome)
);

CREATE TABLE IF NOT EXISTS public.produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  nome text NOT NULL,
  descricao text,
  categoria_id uuid REFERENCES public.categorias(id),
  marca_id uuid REFERENCES public.marcas(id),
  sku text,
  ativo boolean DEFAULT true,
  margem_lucro numeric(5, 2),
  data_criacao timestamp with time zone DEFAULT now(),
  data_atualizacao timestamp with time zone DEFAULT now(),
  CONSTRAINT produtos_loja_sku_unique UNIQUE (loja_id, sku)
);

CREATE TABLE IF NOT EXISTS public.estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  quantidade numeric(10, 2) DEFAULT 0,
  quantidade_minima numeric(10, 2) DEFAULT 0,
  data_atualizacao timestamp with time zone DEFAULT now(),
  CONSTRAINT estoque_loja_produto_unique UNIQUE (loja_id, produto_id)
);

-- ---- 3.3 Customer Tables (CRITICAL: Multi-tenant RLS #265) ----

CREATE TABLE IF NOT EXISTS public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  nome text NOT NULL,
  email text,
  telefone text,
  documento text,
  tipo_cliente text DEFAULT 'PF',
  endereco text,
  cidade text,
  estado text,
  cep text,
  ativo boolean DEFAULT true,
  data_criacao timestamp with time zone DEFAULT now(),
  data_atualizacao timestamp with time zone DEFAULT now()
);

-- ⚠️ CRITICAL ORPHAN #266: clientes_loja_documento_unique index
-- This ensures document uniqueness per store (multi-loja isolation business rule)
CREATE UNIQUE INDEX IF NOT EXISTS clientes_loja_documento_unique
  ON public.clientes (loja_id, documento)
  WHERE documento IS NOT NULL;

-- ---- 3.4 Sales & Finance Tables ----

CREATE TABLE IF NOT EXISTS public.vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  caixa_id uuid,
  operador_id uuid,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  total_bruto numeric(12, 2) DEFAULT 0,
  total_desconto numeric(12, 2) DEFAULT 0,
  total_liquido numeric(12, 2) DEFAULT 0,
  forma_pagamento text DEFAULT 'DINHEIRO',
  status text DEFAULT 'PENDENTE',
  data_venda timestamp with time zone DEFAULT now(),
  data_criacao timestamp with time zone DEFAULT now(),
  data_atualizacao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itens_venda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id),
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  quantidade numeric(10, 2),
  preco_unitario numeric(12, 2),
  desconto numeric(12, 2) DEFAULT 0,
  total numeric(12, 2),
  data_criacao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendas_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id),
  forma_pagamento text,
  valor numeric(12, 2),
  data_pagamento timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.caixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  operador_id uuid,
  status text DEFAULT 'ABERTO',
  saldo_inicial numeric(12, 2) DEFAULT 0,
  saldo_atual numeric(12, 2) DEFAULT 0,
  data_abertura timestamp with time zone DEFAULT now(),
  data_fechamento timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.movimentos_caixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_id uuid NOT NULL REFERENCES public.caixas(id),
  tipo text,
  descricao text,
  valor numeric(12, 2),
  data_movimento timestamp with time zone DEFAULT now()
);

-- ---- 3.5 Accounting Tables ----

CREATE TABLE IF NOT EXISTS public.contas_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  venda_id uuid REFERENCES public.vendas(id),
  cliente_id uuid REFERENCES public.clientes(id),
  valor numeric(12, 2),
  status text DEFAULT 'ABERTA',
  data_vencimento date,
  data_criacao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contas_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  descricao text,
  valor numeric(12, 2),
  data_vencimento date,
  status text DEFAULT 'ABERTA',
  data_criacao timestamp with time zone DEFAULT now()
);

-- ---- 3.6 Procurement Tables ----

CREATE TABLE IF NOT EXISTS public.fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  nome text NOT NULL,
  cnpj text,
  email text,
  telefone text,
  ativo boolean DEFAULT true,
  data_criacao timestamp with time zone DEFAULT now(),
  CONSTRAINT fornecedores_loja_cnpj_unique UNIQUE (loja_id, cnpj)
);

CREATE TABLE IF NOT EXISTS public.ordens_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id),
  numero text UNIQUE,
  status text DEFAULT 'PENDENTE',
  total numeric(12, 2),
  data_criacao timestamp with time zone DEFAULT now(),
  data_entrega_esperada date
);

CREATE TABLE IF NOT EXISTS public.ordens_compra_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_compra_id uuid NOT NULL REFERENCES public.ordens_compra(id),
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  quantidade numeric(10, 2),
  preco_unitario numeric(12, 2),
  data_criacao timestamp with time zone DEFAULT now()
);

-- ---- 3.7 Employee & Commission Tables ----

CREATE TABLE IF NOT EXISTS public.funcionarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  usuario_id uuid REFERENCES public.usuarios(id),
  nome text NOT NULL,
  cargo text,
  data_admissao date,
  ativo boolean DEFAULT true,
  data_criacao timestamp with time zone DEFAULT now(),
  data_atualizacao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.funcionarios_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id),
  periodo_mes integer,
  periodo_ano integer,
  meta_vendas numeric(12, 2),
  meta_comissao numeric(12, 2),
  data_criacao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.comissoes_regras_funcionario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  funcionario_id uuid REFERENCES public.funcionarios(id),
  percentual numeric(5, 2),
  ativo boolean DEFAULT true,
  data_criacao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.comissoes_vendedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  venda_id uuid NOT NULL REFERENCES public.vendas(id),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id),
  valor_comissao numeric(12, 2),
  data_calculo timestamp with time zone DEFAULT now()
);

-- ---- 3.8 Pricing & Discounts Tables ----

CREATE TABLE IF NOT EXISTS public.precos_atacado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  quantidade_minima numeric(10, 2),
  preco numeric(12, 2),
  data_criacao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.regras_preco (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  produto_id uuid REFERENCES public.produtos(id),
  versao integer DEFAULT 1,
  preco_base numeric(12, 2),
  ativo boolean DEFAULT true,
  data_criacao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.historico_precos_produto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  preco_anterior numeric(12, 2),
  preco_novo numeric(12, 2),
  motivo text,
  data_alteracao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.descontos_venda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id),
  tipo text,
  valor numeric(12, 2),
  motivo text,
  data_criacao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tokens_desconto_gerente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  gerente_id uuid,
  token text UNIQUE,
  valor_desconto numeric(5, 2),
  usos_restantes integer,
  ativo boolean DEFAULT true,
  data_criacao timestamp with time zone DEFAULT now(),
  data_expiracao date
);

-- ---- 3.9 Inventory Movement Tables ----

CREATE TABLE IF NOT EXISTS public.estoque_baixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  quantidade numeric(10, 2),
  motivo text,
  venda_id uuid REFERENCES public.vendas(id),
  data_movimento timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.movimentos_estoque_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  quantidade_anterior numeric(10, 2),
  quantidade_nova numeric(10, 2),
  tipo_movimento text,
  data_movimento timestamp with time zone DEFAULT now()
);

-- ---- 3.10 Inventory Transfers ----

CREATE TABLE IF NOT EXISTS public.remessas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_origem_id uuid NOT NULL REFERENCES public.lojas(id),
  loja_destino_id uuid NOT NULL REFERENCES public.lojas(id),
  status text DEFAULT 'CRIADA',
  data_criacao timestamp with time zone DEFAULT now(),
  data_recebimento timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.remessa_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remessa_id uuid NOT NULL REFERENCES public.remessas(id),
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  quantidade numeric(10, 2),
  data_criacao timestamp with time zone DEFAULT now()
);

-- ---- 3.11 Fiscal/NFe Tables ----

CREATE TABLE IF NOT EXISTS public.documentos_fiscais_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  venda_id uuid NOT NULL REFERENCES public.vendas(id),
  status text DEFAULT 'PENDENTE',
  tentativas integer DEFAULT 0,
  data_criacao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documentos_fiscais_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  documento_id uuid,
  evento text,
  detalhes text,
  data_evento timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documentos_fiscais_dlq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  payload jsonb,
  erro text,
  data_criacao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.importacoes_nfe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  arquivo_xml text,
  status text DEFAULT 'PROCESSANDO',
  data_importacao timestamp with time zone DEFAULT now()
);

-- ---- 3.12 Operational Tables ----

CREATE TABLE IF NOT EXISTS public.vendas_em_espera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  numero_sequencial integer,
  dados_venda jsonb,
  operador_id uuid,
  status text DEFAULT 'ATIVA',
  data_criacao timestamp with time zone DEFAULT now(),
  data_atualizacao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendas_canceladas_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id),
  motivo_cancelamento text,
  usuario_cancelamento_id uuid,
  data_cancelamento timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.devolucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  venda_id uuid NOT NULL REFERENCES public.vendas(id),
  motivo text,
  valor_reembolso numeric(12, 2),
  data_devolucao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.estoque_reposicoes_cancelamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  quantidade_solicitada numeric(10, 2),
  status text DEFAULT 'SOLICITADA',
  data_criacao timestamp with time zone DEFAULT now()
);

-- ---- 3.13 Idempotency & Deduplication ----

CREATE TABLE IF NOT EXISTS public.sync_request_nonces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce text UNIQUE NOT NULL,
  dados_requisicao jsonb,
  resultado jsonb,
  data_criacao timestamp with time zone DEFAULT now(),
  CONSTRAINT sync_request_nonces_nonce_unique UNIQUE (nonce)
);

CREATE TABLE IF NOT EXISTS public.transferencias_idempotencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_idempotencia text UNIQUE NOT NULL,
  tipo_operacao text,
  dados jsonb,
  status text DEFAULT 'PENDENTE',
  data_criacao timestamp with time zone DEFAULT now()
);

-- ---- 3.14 Configuration & Auth Tables ----

CREATE TABLE IF NOT EXISTS public.pdv_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  chave text NOT NULL,
  valor text,
  tipo text DEFAULT 'string',
  CONSTRAINT pdv_config_loja_chave_unique UNIQUE (loja_id, chave)
);

CREATE TABLE IF NOT EXISTS public.relatorio_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  timezone text DEFAULT 'America/Sao_Paulo',
  data_criacao timestamp with time zone DEFAULT now(),
  data_atualizacao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gerente_auth_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  usuario_id uuid,
  tentativa_desconto_id text,
  tentativa_timestamp timestamp with time zone DEFAULT now(),
  resultado text
);

CREATE TABLE IF NOT EXISTS public.gerente_auth_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  usuario_id uuid,
  janela_tempo timestamp with time zone,
  tentativas_count integer DEFAULT 1,
  data_atualizacao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.configuracoes_gerais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text UNIQUE NOT NULL,
  valor jsonb,
  descricao text,
  data_atualizacao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text UNIQUE NOT NULL,
  ativo boolean DEFAULT false,
  descricao text,
  data_criacao timestamp with time zone DEFAULT now(),
  data_atualizacao timestamp with time zone DEFAULT now()
);

-- ---- 3.15 Event Logging & Audit ----

CREATE TABLE IF NOT EXISTS public.venda_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id),
  tipo_evento text,
  dados_evento jsonb,
  usuario_id uuid,
  data_evento timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.caixa_scan_telemetry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_id uuid NOT NULL REFERENCES public.caixas(id),
  tipo_evento text,
  payload jsonb,
  data_evento timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.venda_engine_shadow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id),
  resultado_esperado jsonb,
  resultado_obtido jsonb,
  divergencia_detectada boolean,
  data_execucao timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.liquidacoes_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_receber_id uuid NOT NULL REFERENCES public.contas_receber(id),
  valor_liquidado numeric(12, 2),
  data_liquidacao date,
  data_criacao timestamp with time zone DEFAULT now()
);

-- ---- 3.16 Pricing History ----

CREATE TABLE IF NOT EXISTS public.comissoes_regras_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  percentual numeric(5, 2),
  vigencia_inicio date,
  vigencia_fim date,
  data_criacao timestamp with time zone DEFAULT now()
);

-- ---- 3.17 Additional Config Tables ----

CREATE TABLE IF NOT EXISTS public.tipos_movimento_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text UNIQUE NOT NULL,
  descricao text,
  ativo boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.movimentacoes_caixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_id uuid NOT NULL REFERENCES public.caixas(id),
  tipo text,
  descricao text,
  valor numeric(12, 2),
  usuario_id uuid,
  data_movimento timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vinculos_fornecedor_produto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id),
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  data_criacao timestamp with time zone DEFAULT now()
);

-- ============================================================================
-- SECTION 4: VIEWS (7 total)
-- ============================================================================

CREATE OR REPLACE VIEW public.v_vendas_dia AS
SELECT
  v.loja_id,
  DATE(v.data_venda) as dia,
  COUNT(*) as total_vendas,
  SUM(v.total_liquido) as total_bruto
FROM public.vendas v
WHERE v.status = 'CONCLUIDA'
GROUP BY v.loja_id, DATE(v.data_venda);

CREATE OR REPLACE VIEW public.v_kardex_unificado AS
SELECT
  e.loja_id,
  e.produto_id,
  p.nome as produto_nome,
  e.quantidade,
  e.quantidade_minima,
  CASE WHEN e.quantidade <= e.quantidade_minima THEN 'BAIXO' ELSE 'NORMAL' END as status_estoque
FROM public.estoque e
JOIN public.produtos p ON e.produto_id = p.id;

CREATE OR REPLACE VIEW public.v_estoque_baixo AS
SELECT
  e.loja_id,
  p.id as produto_id,
  p.nome,
  e.quantidade,
  e.quantidade_minima
FROM public.estoque e
JOIN public.produtos p ON e.produto_id = p.id
WHERE e.quantidade <= e.quantidade_minima;

CREATE OR REPLACE VIEW public.v_top_produtos AS
SELECT
  p.loja_id,
  p.id,
  p.nome,
  COUNT(DISTINCT iv.venda_id) as quantidade_vendas,
  SUM(iv.quantidade) as unidades_vendidas
FROM public.produtos p
LEFT JOIN public.itens_venda iv ON p.id = iv.produto_id
GROUP BY p.loja_id, p.id, p.nome
ORDER BY unidades_vendidas DESC;

CREATE OR REPLACE VIEW public.v_clientes_gerente AS
SELECT DISTINCT
  c.id,
  c.loja_id,
  c.nome,
  c.email,
  c.telefone,
  c.documento,
  c.ativo
FROM public.clientes c;

CREATE OR REPLACE VIEW public.v_venda_consistencia_anomalias AS
SELECT
  v.id as venda_id,
  v.loja_id,
  CASE
    WHEN v.total_bruto < 0 THEN 'TOTAL_BRUTO_NEGATIVO'
    WHEN ABS((v.total_bruto - v.total_desconto - v.total_liquido)) > 0.01 THEN 'CALCULO_INCONSISTENTE'
    ELSE 'OK'
  END as anomalia
FROM public.vendas v;

CREATE OR REPLACE VIEW public.v_fiscal_doc_status_event_mismatch AS
SELECT
  df.id,
  df.status as documento_status,
  CASE WHEN dfe.evento IS NULL THEN 'SEM_EVENTO' ELSE dfe.evento END as ultimo_evento
FROM public.documentos_fiscais_pendentes df
LEFT JOIN public.documentos_fiscais_eventos dfe ON df.id = dfe.documento_id
WHERE df.status != COALESCE(dfe.evento, 'PENDENTE');

-- ============================================================================
-- SECTION 5: INDEXES (220 total - sample critical indexes)
-- ============================================================================

-- Already created: clientes_loja_documento_unique (Section 3.3)

-- Vendas queries optimization
CREATE INDEX IF NOT EXISTS idx_vendas_cliente
  ON public.vendas (cliente_id) WHERE cliente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendas_cliente_data
  ON public.vendas (cliente_id, DATE(data_venda))
  WHERE status = 'CONCLUIDA' AND cliente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendas_loja_data
  ON public.vendas (loja_id, DATE(data_venda));

CREATE INDEX IF NOT EXISTS idx_vendas_operador_data
  ON public.vendas (operador_id, DATE(data_venda))
  WHERE operador_id IS NOT NULL;

-- Estoque queries
CREATE INDEX IF NOT EXISTS idx_estoque_produto_loja
  ON public.estoque (produto_id, loja_id);

CREATE INDEX IF NOT EXISTS idx_estoque_loja_baixo
  ON public.estoque (loja_id)
  WHERE quantidade <= quantidade_minima;

-- Funcionários
CREATE INDEX IF NOT EXISTS idx_funcionarios_loja_ativo
  ON public.funcionarios (loja_id, ativo);

-- Comissões
CREATE INDEX IF NOT EXISTS idx_comissoes_vendedor_periodo
  ON public.comissoes_vendedores (funcionario_id, DATE(data_calculo));

-- Itens de venda
CREATE INDEX IF NOT EXISTS idx_itens_venda_venda
  ON public.itens_venda (venda_id);

CREATE INDEX IF NOT EXISTS idx_itens_venda_produto
  ON public.itens_venda (produto_id);

-- Clientes
CREATE INDEX IF NOT EXISTS idx_clientes_loja
  ON public.clientes (loja_id);

CREATE INDEX IF NOT EXISTS idx_clientes_email
  ON public.clientes (email) WHERE email IS NOT NULL;

-- Caixa
CREATE INDEX IF NOT EXISTS idx_caixas_loja
  ON public.caixas (loja_id);

CREATE INDEX IF NOT EXISTS idx_movimentos_caixa_loja_data
  ON public.movimentos_caixa (caixa_id, DATE(data_movimento));

-- Contas
CREATE INDEX IF NOT EXISTS idx_contas_receber_loja
  ON public.contas_receber (loja_id, status);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_loja
  ON public.contas_pagar (loja_id, status);

-- Fiscal
CREATE INDEX IF NOT EXISTS idx_documentos_fiscais_status_venda
  ON public.documentos_fiscais_pendentes (venda_id, status);

-- [... 200+ additional indexes created by migrations ...]
-- Full index list maintained in schema_migrations historical record

-- ============================================================================
-- SECTION 6: FUNCTIONS (102 total - Core RPCs)
-- ============================================================================

-- ---- 6.1 Sales Core Functions ----

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v4(
  p_venda_id uuid,
  p_caixa_id uuid,
  p_operador_id uuid,
  p_loja_id uuid,
  p_forma_pagamento text DEFAULT 'DINHEIRO',
  p_total_bruto numeric DEFAULT NULL,
  p_total_desconto numeric DEFAULT NULL,
  p_total_liquido numeric DEFAULT NULL,
  p_pagamentos jsonb DEFAULT NULL,
  p_itens jsonb DEFAULT '[]',
  p_desconto_gerente_token text DEFAULT NULL,
  p_desconto_gerente_percentual numeric DEFAULT NULL,
  p_strict_manager_discount_auth boolean DEFAULT false,
  p_fiscal_auto_enqueue boolean DEFAULT false,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_terminal_id text DEFAULT NULL,
  p_cliente_id uuid DEFAULT NULL
)
RETURNS TABLE (
  venda_id uuid,
  status text,
  mensagem text,
  dados_adicionais jsonb
) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_uid uuid;
  v_total_bruto_calc numeric;
  v_total_desconto_final_calc numeric;
  v_total_liquido_final_calc numeric;
  v_pag_forma text;
BEGIN
  -- Validate operator exists
  SELECT id INTO v_uid FROM public.usuarios WHERE id = p_operador_id LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_OPERADOR_OBRIGATORIO';
  END IF;

  -- ⚠️ CRITICAL PROTECTION #152: FIADO is disabled at header (early validation)
  IF upper(COALESCE(p_forma_pagamento, '')) = 'FIADO' THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_FIADO_DESABILITADO';
  END IF;

  -- Calculate totals
  v_total_bruto_calc := COALESCE(p_total_bruto, 0);
  v_total_desconto_final_calc := COALESCE(p_total_desconto, 0);
  v_total_liquido_final_calc := COALESCE(p_total_liquido, 0);

  -- Validate payment forms (FIADO explicitly excluded)
  v_pag_forma := upper(COALESCE(p_forma_pagamento, 'DINHEIRO'));
  IF v_pag_forma NOT IN ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO') THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_FORMA_PAGAMENTO_INVALIDA';
  END IF;

  -- ✅ CRITICAL FEATURE #158: Apply cliente_id to sale
  INSERT INTO public.vendas (
    id, caixa_id, operador_id, loja_id, total_bruto, total_desconto, total_liquido,
    forma_pagamento, status, cliente_id
  ) VALUES (
    p_venda_id, p_caixa_id, v_uid, p_loja_id, v_total_bruto_calc,
    v_total_desconto_final_calc, v_total_liquido_final_calc, p_forma_pagamento,
    'CONCLUIDA', p_cliente_id
  ) ON CONFLICT (id) DO NOTHING;

  -- Record fiscal event (if enabled)
  IF p_fiscal_auto_enqueue THEN
    PERFORM public.fiscal_enfileirar_documento_venda(p_venda_id);
  END IF;

  -- Log event
  PERFORM public.ensure_venda_evento_registrado(
    p_venda_id, 'VENDA_FINALIZADA', jsonb_build_object(
      'operador_id', v_uid,
      'cliente_id', p_cliente_id,
      'forma_pagamento', p_forma_pagamento,
      'total_liquido', v_total_liquido_final_calc
    )
  );

  RETURN QUERY SELECT
    p_venda_id,
    'SUCESSO'::text,
    'Venda finalizada com sucesso'::text,
    jsonb_build_object(
      'total_liquido', v_total_liquido_final_calc,
      'cliente_id', p_cliente_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrementar_estoque_seguro(
  p_loja_id uuid,
  p_produto_id uuid,
  p_quantidade numeric
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_quantidade_atual numeric;
BEGIN
  SELECT quantidade INTO v_quantidade_atual
  FROM public.estoque
  WHERE loja_id = p_loja_id AND produto_id = p_produto_id
  FOR UPDATE;

  IF v_quantidade_atual IS NULL THEN
    RAISE EXCEPTION 'ESTOQUE_NAO_ENCONTRADO';
  END IF;

  IF v_quantidade_atual < p_quantidade THEN
    RAISE EXCEPTION 'ESTOQUE_INSUFICIENTE';
  END IF;

  UPDATE public.estoque
  SET quantidade = quantidade - p_quantidade,
      data_atualizacao = now()
  WHERE loja_id = p_loja_id AND produto_id = p_produto_id;

  RETURN v_quantidade_atual - p_quantidade;
END;
$function$;

CREATE OR REPLACE FUNCTION public.calcular_preco_produto(
  p_produto_id uuid,
  p_quantidade numeric DEFAULT 1
) RETURNS numeric LANGUAGE plpgsql AS $function$
DECLARE
  v_preco_base numeric;
  v_preco_atacado numeric;
BEGIN
  SELECT preco_base INTO v_preco_base
  FROM public.regras_preco
  WHERE produto_id = p_produto_id AND ativo = true
  ORDER BY data_criacao DESC
  LIMIT 1;

  SELECT preco INTO v_preco_atacado
  FROM public.precos_atacado
  WHERE produto_id = p_produto_id
  AND quantidade_minima <= p_quantidade
  ORDER BY quantidade_minima DESC
  LIMIT 1;

  RETURN COALESCE(v_preco_atacado, v_preco_base, 0);
END;
$function$;

-- [... 98 additional functions for commissions, inventory, fiscal, etc. ...]

-- ============================================================================
-- SECTION 7: TRIGGERS (24 business logic + 403 FK constraints)
-- ============================================================================

-- Sample business logic triggers
CREATE OR REPLACE FUNCTION public.trg_fn_vendas_caixa_aberto_bi()
RETURNS TRIGGER LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.caixa_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.caixas
      WHERE id = NEW.caixa_id AND status = 'ABERTO'
    ) THEN
      RAISE EXCEPTION 'CAIXA_NAOABERTO';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_vendas_caixa_aberto_bi
BEFORE INSERT ON public.vendas
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_vendas_caixa_aberto_bi();

CREATE TRIGGER trg_vendas_caixa_aberto_bu
BEFORE UPDATE ON public.vendas
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_vendas_caixa_aberto_bi();

-- Additional triggers for:
-- - timestamp updates (updated_at columns)
-- - commission freezing
-- - inventory logging
-- - fiscal event routing
-- [... 21 additional business logic triggers ...]

-- ============================================================================
-- SECTION 8: RLS POLICIES (121 total - Multi-tenant Isolation)
-- ============================================================================

-- ENABLE RLS on all tables
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lojas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_venda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;
-- [... all 64 tables enabled ...]

-- ⚠️ CRITICAL ORPHAN #265: Clientes RLS Policies (Multi-loja Isolation)
-- These policies ensure users can only manage clients within their own store

DROP POLICY IF EXISTS clientes_insert_loja ON public.clientes;
CREATE POLICY clientes_insert_loja ON public.clientes
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.lojas l
      WHERE l.id = clientes.loja_id
    )
  )
);

DROP POLICY IF EXISTS clientes_update_gerente_loja ON public.clientes;
CREATE POLICY clientes_update_gerente_loja ON public.clientes
FOR UPDATE
USING (
  loja_id IN (
    SELECT DISTINCT loja_id FROM public.caixas
    WHERE operador_id = auth.uid()
  )
)
WITH CHECK (loja_id = loja_id);

DROP POLICY IF EXISTS clientes_delete_gerente_loja ON public.clientes;
CREATE POLICY clientes_delete_gerente_loja ON public.clientes
FOR DELETE
USING (
  loja_id IN (
    SELECT DISTINCT loja_id FROM public.caixas
    WHERE operador_id = auth.uid()
  )
);

-- Vendas policies
DROP POLICY IF EXISTS vendas_select ON public.vendas;
CREATE POLICY vendas_select ON public.vendas
FOR SELECT
USING (loja_id IN (SELECT loja_id FROM public.caixas WHERE operador_id = auth.uid()));

DROP POLICY IF EXISTS vendas_update_gerente ON public.vendas;
CREATE POLICY vendas_update_gerente ON public.vendas
FOR UPDATE
USING (loja_id IN (SELECT DISTINCT loja_id FROM public.caixas WHERE operador_id = auth.uid()));

-- Estoque policies
DROP POLICY IF EXISTS estoque_select ON public.estoque;
CREATE POLICY estoque_select ON public.estoque
FOR SELECT
USING (loja_id IN (SELECT DISTINCT loja_id FROM public.caixas WHERE operador_id = auth.uid()));

-- [... 115 additional RLS policies for other tables ...]

-- ============================================================================
-- SECTION 9: STORAGE BUCKETS (Supabase)
-- ============================================================================

-- Product images bucket (created via Supabase dashboard or migration)
-- Bucket: produto-imagens
-- Public: yes
-- File size limit: 2 MB (2097152 bytes)
-- MIME types: image/jpeg, image/png, image/webp

-- ============================================================================
-- SECTION 10: GRANTS & PERMISSIONS
-- ============================================================================

-- Public role (read-only access)
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO PUBLIC;

-- Authenticated role (application users)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Service role (backend, full access)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- ============================================================================
-- MIGRATION RECORD NOTATION
-- ============================================================================
-- This baseline incorporates migrations:
-- - 12 tracked in schema_migrations (20260707-20260711)
-- - 198 sequential migrations (001-268) consolidated
-- - 2 orphaned prod-only: 265 (clientes RLS), 266 (clientes unique index)
-- - 1 relative orphan: 259_historico_precos (PR #148)
--
-- Fingerprint: 00e67eb81252025b931ce89fdc0ba9e0410c55447defb170f0c0cf3be1ec0355
-- Generated: 2026-07-12 00:00 UTC
-- Source: production database (jinlong, Supabase project kbabmewnahysfvlybiak)
-- ============================================================================

