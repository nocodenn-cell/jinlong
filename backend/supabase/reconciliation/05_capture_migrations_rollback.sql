-- Rollback das migrations de captura 270-276 (P0.1). Em PRODUÇÃO estas migrations
-- são no-op (objetos já existem) — este rollback só é relevante para um ambiente
-- de rebuild/teste onde 270-276 tenham sido aplicadas do zero e precisem ser desfeitas.
-- Ordem: reverso da aplicação (276 -> 270), respeitando FKs.

-- 276: perfis (legada/órfã)
DROP TABLE IF EXISTS public.perfis;

-- 275: shadow venda engine
DROP FUNCTION IF EXISTS public.shadow_validar_venda_engine_v4(jsonb);
DROP TABLE IF EXISTS public.venda_engine_shadow_runs;

-- 274: funções auxiliares (funcionários/comissões/relatórios/diagnóstico)
DROP FUNCTION IF EXISTS public.fn_listar_funcionarios_gerente(uuid, text, text);
DROP FUNCTION IF EXISTS public.resumo_comissoes_por_funcionario(uuid, date, date);
DROP FUNCTION IF EXISTS public.total_vendas_por_funcionario(uuid, date, date);
DROP FUNCTION IF EXISTS public.baixar_estoque_venda(uuid, jsonb);
DROP FUNCTION IF EXISTS public.caixa_integridade_gate_check();
DROP FUNCTION IF EXISTS public.listar_valores_sistema_dinheiro_caixas(uuid[]);

-- 273: vendas.cliente_id + clientes
DROP POLICY IF EXISTS clientes_insert_loja ON public.clientes;
DROP INDEX IF EXISTS public.clientes_loja_documento_unique;
DROP INDEX IF EXISTS public.idx_vendas_cliente_id;
ALTER TABLE public.vendas DROP COLUMN IF EXISTS cliente_id;

-- 272: comissoes_regras_*
DROP TABLE IF EXISTS public.comissoes_regras_historico;
DROP TABLE IF EXISTS public.comissoes_regras_funcionario;

-- 271: historico_precos_produto
DROP TRIGGER IF EXISTS trg_historico_precos_produto ON public.produtos;
DROP FUNCTION IF EXISTS public.registrar_historico_preco_produto();
DROP TABLE IF EXISTS public.historico_precos_produto;

-- 270: funcionarios + funcionarios_meta
DROP TRIGGER IF EXISTS trg_funcionarios_meta_audit_update ON public.funcionarios_meta;
DROP FUNCTION IF EXISTS public.fn_audit_update_funcionarios_meta();
DROP FUNCTION IF EXISTS public.fn_criar_funcionario(uuid, uuid, text, text, text, numeric, text, numeric);
DROP FUNCTION IF EXISTS public.fn_atualizar_funcionario(uuid, text, text, numeric, text, numeric);
DROP FUNCTION IF EXISTS public.fn_desativar_funcionario(uuid);
DROP TABLE IF EXISTS public.funcionarios_meta;
DROP TABLE IF EXISTS public.funcionarios;
