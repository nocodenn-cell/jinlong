-- SEC-ANON (2026-11-04): privilégios mínimos para o papel anon em public.
--
-- ACHADO (auditoria com privilégios reais do homolog, cópia restaurada com ACL):
-- 1) Três views sem security_invoker rodam como postgres e ignoram o RLS:
--    v_vendas_dia, v_top_produtos, v_venda_consistencia_anomalias. Qualquer usuário logado
--    (inclusive OPERADOR e GERENTE de outra empresa) e o anon liam agregados de vendas de todas as
--    empresas. Confirmado: anon viu 1 linha de v_vendas_dia com 4 vendas e R$ 20.040,00.
-- 2) anon tinha SELECT/REFERENCES/TRIGGER/MAINTAIN em 63 tabelas e 12 views de public. As tabelas têm
--    RLS, mas nenhuma leitura pública é legítima: o único uso público do banco é o INSERT do formulário
--    comercial (commercial_leads), que hoje nem tem grant para anon (fora do escopo desta migration).
-- 3) funções auxiliares com EXECUTE para anon: texto_sem_acento (usada pela busca do PDV, só authenticated),
--    duas funções de trigger (não devem ser chamadas diretamente) e internal.fp_* (sem USAGE em internal, mas com
--    EXECUTE).
--
-- FORA DESTA MIGRATION (objetos de plataforma Supabase, owner supabase_admin; o postgres não altera de forma
-- confiável): pg_stat_statements (SELECT para PUBLIC expõe texto de consultas), schema net (anon/PUBLIC
-- com USAGE e DML; anon consegue enfileirar requisições HTTP), graphql_public.graphql, schemas storage
-- e realtime. Ver docs/runbooks/RECONCILIACAO_HOMOLOG_2026-11-04.md, seção 12.
--
-- Efeitos verificados em cópia local com ACL real do homolog (ver evidências em docs/qa/evidencias/).
-- ROLLBACK: backend/supabase/rollback/20261104120000_sec_anon_privilegios_minimos.rollback.sql

BEGIN;

-- 1) Views que contornavam o RLS: passam a executar com os privilégios de quem consulta.
ALTER VIEW public.v_vendas_dia SET (security_invoker = true);
ALTER VIEW public.v_top_produtos SET (security_invoker = true);
ALTER VIEW public.v_venda_consistencia_anomalias SET (security_invoker = true);

-- 2) anon sem nenhum privilégio em public (tabelas e views).
REVOKE ALL ON TABLE
  public.caixas,
  public.categorias_financeiras,
  public.categorias,
  public.clientes,
  public.comissoes_ajustes_auditoria,
  public.comissoes_ajustes,
  public.comissoes_itens,
  public.comissoes_pagamentos_ajustes,
  public.comissoes_pagamentos,
  public.comissoes_reconstrucao_auditoria,
  public.comissoes_regras_funcionario,
  public.comissoes_regras_historico,
  public.comissoes_saldo_operador,
  public.comissoes_vendedores_liquidas,
  public.comissoes_vendedores,
  public.configuracoes_gerais,
  public.descontos_venda,
  public.devolucoes,
  public.documentos_fiscais_dlq,
  public.documentos_fiscais_eventos,
  public.documentos_fiscais_pendentes,
  public.estoque_baixas,
  public.estoque_reposicoes_cancelamento,
  public.estoque_reposicoes_devolucao,
  public.estoque,
  public.feature_flags,
  public.fiscal_provider_config,
  public.formas_pagamento,
  public.fornecedores,
  public.funcionarios_meta,
  public.funcionarios,
  public.gerente_auth_attempts,
  public.gerente_auth_rate_limits,
  public.historico_precos_produto,
  public.historico_tiers_crud,
  public.implantacao_checklist_itens,
  public.implantacao_checklists,
  public.importacoes_nfe_duplicatas,
  public.importacoes_nfe_itens,
  public.importacoes_nfe,
  public.itens_venda,
  public.lojas,
  public.marcas,
  public.movimentacoes_caixa,
  public.movimentos_caixa,
  public.movimentos_estoque_log,
  public.ordens_compra_itens,
  public.ordens_compra,
  public.pdv_config,
  public.precos_atacado,
  public.pricing_config_versions,
  public.produto_create_requests,
  public.produtos,
  public.regras_preco,
  public.relatorio_settings,
  public.remessa_itens,
  public.remessas,
  public.tipos_movimento_estoque,
  public.tokens_desconto_gerente,
  public.transferencias_idempotencia,
  public.usuarios,
  public.v_clientes_gerente,
  public.v_estoque_baixo,
  public.v_estoque_ledger_divergencia,
  public.v_fiscal_doc_status_event_mismatch,
  public.v_kardex_unificado,
  public.v_top_produtos,
  public.v_venda_consistencia_anomalias,
  public.v_vendas_dia,
  public.venda_pos_venda_itens,
  public.venda_pos_venda_operacoes,
  public.vendas_canceladas_auditoria,
  public.vendas_pagamentos,
  public.vendas,
  public.vinculos_fornecedor_produto
FROM anon;

-- 3) Funções auxiliares: sem EXECUTE para anon.
REVOKE ALL ON FUNCTION public.texto_sem_acento(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.texto_sem_acento(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.trg_caixas_fechado_imutavel() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trg_movimentos_estoque_log_bloquear_mutacao() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION internal.fp_contexto_servidor() FROM anon;
REVOKE EXECUTE ON FUNCTION internal.fp_empresa_selecionada() FROM anon;

-- Prova: falha a migration inteira se alguma garantia não valer.
DO $verify$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['v_vendas_dia','v_top_produtos','v_venda_consistencia_anomalias'] LOOP
    IF NOT coalesce((SELECT c.reloptions @> ARRAY['security_invoker=true'] FROM pg_class c
                      WHERE c.oid = format('public.%I', v)::regclass), false) THEN
      RAISE EXCEPTION 'SEC_ANON: % sem security_invoker', v;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relkind IN ('r','v','p')
                AND has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN')) THEN
    RAISE EXCEPTION 'SEC_ANON: anon ainda tem privilégio em alguma relação de public';
  END IF;
  IF has_function_privilege('anon', 'public.trg_caixas_fechado_imutavel()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.texto_sem_acento(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'internal.fp_contexto_servidor()', 'EXECUTE') THEN
    RAISE EXCEPTION 'SEC_ANON: anon ainda executa função auxiliar';
  END IF;
END
$verify$;

COMMIT;
