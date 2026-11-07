-- ROLLBACK de 20261106150000_sec_anon_complemento_privilegios.sql.
-- Restaura os privilégios de anon EXATAMENTE como estavam em PRODUÇÃO em 2026-11-06 (leitura por aclexplode, por objeto):
--   * 58 tabelas: MAINTAIN, REFERENCES, SELECT, TRIGGER
--   * 5 tabelas (gerente_auth_attempts, gerente_auth_rate_limits, pdv_config, produto_create_requests, produtos):
--     MAINTAIN, REFERENCES, TRIGGER (sem SELECT)
--   * 12 views: MAINTAIN, REFERENCES, SELECT, TRIGGER
--   * 6 sequências: SELECT, UPDATE, USAGE
--   * default ACL de postgres em public: tabelas rxtm, sequências rwU
-- Não restaura o estado de homologação (que tinha 18 sequências, não 6). Não remove security_invoker das views:
-- isso reabriria o vazamento de agregados de vendas, e produção já tinha a opção ligada.
-- Usar só com decisão do responsável e regressão comprovada. Reintroduz o risco documentado no PR.

BEGIN;

DO $rb_tabelas$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'caixas','categorias','categorias_financeiras','clientes','comissoes_ajustes','comissoes_itens',
    'comissoes_pagamentos','comissoes_pagamentos_ajustes','comissoes_regras_funcionario','comissoes_regras_historico',
    'comissoes_vendedores','configuracoes_gerais','descontos_venda','devolucoes','documentos_fiscais_eventos',
    'documentos_fiscais_pendentes','estoque','estoque_baixas','estoque_reposicoes_cancelamento',
    'estoque_reposicoes_devolucao','feature_flags','fiscal_provider_config','formas_pagamento','fornecedores',
    'funcionarios','funcionarios_meta','historico_precos_produto','historico_tiers_crud',
    'implantacao_checklist_itens','implantacao_checklists','importacoes_nfe','importacoes_nfe_duplicatas',
    'importacoes_nfe_itens','itens_venda','lojas','marcas','movimentacoes_caixa','movimentos_caixa',
    'movimentos_estoque_log','ordens_compra','ordens_compra_itens','perfis','precos_atacado',
    'pricing_config_versions','regras_preco','relatorio_settings','remessa_itens','remessas',
    'tipos_movimento_estoque','tokens_desconto_gerente','transferencias_idempotencia','usuarios',
    'venda_pos_venda_itens','venda_pos_venda_operacoes','vendas','vendas_canceladas_auditoria',
    'vendas_pagamentos','vinculos_fornecedor_produto'
  ]
  LOOP
    EXECUTE format('GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER ON public.%I TO anon', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'gerente_auth_attempts','gerente_auth_rate_limits','pdv_config','produto_create_requests','produtos'
  ]
  LOOP
    EXECUTE format('GRANT MAINTAIN, REFERENCES, TRIGGER ON public.%I TO anon', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'comissoes_ajustes_auditoria','comissoes_reconstrucao_auditoria','comissoes_saldo_operador',
    'comissoes_vendedores_liquidas','v_clientes_gerente','v_estoque_baixo','v_estoque_ledger_divergencia',
    'v_fiscal_doc_status_event_mismatch','v_kardex_unificado','v_top_produtos','v_venda_consistencia_anomalias',
    'v_vendas_dia'
  ]
  LOOP
    EXECUTE format('GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER ON public.%I TO anon', t);
  END LOOP;
END
$rb_tabelas$;

DO $rb_sequencias$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY[
    'comissoes_regras_log_id_seq','empresa_modulos_historico_id_seq','import_auditoria_id_seq',
    'movimentacoes_caixa_numero_sequencial_seq','pdv_ativacao_tentativas_id_seq','relatorio_settings_id_seq'
  ]
  LOOP
    EXECUTE format('GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.%I TO anon', s);
  END LOOP;
END
$rb_sequencias$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO anon;

COMMIT;
