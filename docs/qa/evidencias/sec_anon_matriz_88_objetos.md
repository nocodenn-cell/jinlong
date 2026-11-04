| extensions.pg_stat_statements_info | view | anon: - · PUBLIC: SELECT | nao | linhas=1 | DESNECESSÁRIO (vaza texto de consultas de todos os usuários) | PLATAFORMA: revogar de PUBLIC/anon (owner supabase_admin); fora da migration |
| extensions.pg_stat_statements | view | anon: - · PUBLIC: SELECT | nao | linhas=4783 | DESNECESSÁRIO (vaza texto de consultas de todos os usuários) | PLATAFORMA: revogar de PUBLIC/anon (owner supabase_admin); fora da migration |
| net._http_response | tabela | anon: - · PUBLIC: INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN | nao | linhas=0 · delete=0 | DESNECESSÁRIO (anon enfileira requisições HTTP) | PLATAFORMA: revogar de anon e PUBLIC (owner supabase_admin); fora da migration |
| net.http_request_queue | tabela | anon: - · PUBLIC: INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN | nao | linhas=0 · delete=0 | DESNECESSÁRIO (anon enfileira requisições HTTP) | PLATAFORMA: revogar de anon e PUBLIC (owner supabase_admin); fora da migration |
| public.caixas | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.categorias_financeiras | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.categorias | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.clientes | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_ajustes_auditoria | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_ajustes | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_itens | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_pagamentos_ajustes | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_pagamentos | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_reconstrucao_auditoria | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_regras_funcionario | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_regras_historico | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_saldo_operador | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_vendedores_liquidas | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_vendedores | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.configuracoes_gerais | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.descontos_venda | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.devolucoes | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.documentos_fiscais_dlq | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.documentos_fiscais_eventos | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.documentos_fiscais_pendentes | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.estoque_baixas | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.estoque_reposicoes_cancelamento | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.estoque_reposicoes_devolucao | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.estoque | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.feature_flags | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.fiscal_provider_config | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.formas_pagamento | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.fornecedores | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.funcionarios_meta | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.funcionarios | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.gerente_auth_attempts | tabela | anon: MAINTAIN,REFERENCES,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.gerente_auth_rate_limits | tabela | anon: MAINTAIN,REFERENCES,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.historico_precos_produto | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.historico_tiers_crud | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.implantacao_checklist_itens | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.implantacao_checklists | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.importacoes_nfe_duplicatas | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.importacoes_nfe_itens | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.importacoes_nfe | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.itens_venda | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.lojas | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.marcas | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.movimentacoes_caixa | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.movimentos_caixa | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.movimentos_estoque_log | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.ordens_compra_itens | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.ordens_compra | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.pdv_config | tabela | anon: MAINTAIN,REFERENCES,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.precos_atacado | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.pricing_config_versions | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.produto_create_requests | tabela | anon: MAINTAIN,REFERENCES,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.produtos | tabela | anon: MAINTAIN,REFERENCES,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.regras_preco | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.relatorio_settings | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.remessa_itens | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.remessas | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.tipos_movimento_estoque | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.tokens_desconto_gerente | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.transferencias_idempotencia | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.usuarios | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.v_clientes_gerente | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.v_estoque_baixo | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.v_estoque_ledger_divergencia | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.v_fiscal_doc_status_event_mismatch | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.v_kardex_unificado | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.v_top_produtos | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | linhas=1 | DESNECESSÁRIO — CRÍTICO (view contorna RLS; vazamento entre empresas) | MIGRATION: security_invoker=true + REVOKE de anon |
| public.v_venda_consistencia_anomalias | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | linhas=2 | DESNECESSÁRIO — CRÍTICO (view contorna RLS; vazamento entre empresas) | MIGRATION: security_invoker=true + REVOKE de anon |
| public.v_vendas_dia | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | linhas=1 | DESNECESSÁRIO — CRÍTICO (view contorna RLS; vazamento entre empresas) | MIGRATION: security_invoker=true + REVOKE de anon |
| public.venda_pos_venda_itens | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.venda_pos_venda_operacoes | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.vendas_canceladas_auditoria | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.vendas_pagamentos | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.vendas | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.vinculos_fornecedor_produto | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| realtime.messages | tabela | anon: INSERT,SELECT,UPDATE | sim | linhas=0 | INDETERMINADO (realtime autenticado) | PLATAFORMA: investigar |
| realtime.subscription | tabela | anon: SELECT | nao | linhas=0 | DESNECESSÁRIO (metadado de assinaturas) | PLATAFORMA: revogar; probe bloqueou |
| storage.buckets_analytics | tabela | anon: DELETE,INSERT,SELECT,UPDATE | sim | linhas=0 · delete=0 | DESNECESSÁRIO (DML sem uso público; policies só authenticated) | PLATAFORMA: revogar DML de anon; fora da migration |
| storage.buckets_vectors | tabela | anon: SELECT | sim | linhas=0 | DESNECESSÁRIO (DML sem uso público; policies só authenticated) | PLATAFORMA: revogar DML de anon; fora da migration |
| storage.buckets | tabela | anon: DELETE,INSERT,SELECT,UPDATE | sim | linhas=0 | DESNECESSÁRIO (DML sem uso público; policies só authenticated) | PLATAFORMA: revogar DML de anon; fora da migration |
| storage.objects | tabela | anon: DELETE,INSERT,SELECT,UPDATE | sim | linhas=0 | DESNECESSÁRIO (DML sem uso público; policies só authenticated) | PLATAFORMA: revogar DML de anon; fora da migration |
| storage.s3_multipart_uploads_parts | tabela | anon: SELECT | sim | linhas=0 | DESNECESSÁRIO (DML sem uso público; policies só authenticated) | PLATAFORMA: revogar DML de anon; fora da migration |
| storage.s3_multipart_uploads | tabela | anon: SELECT | sim | linhas=0 | DESNECESSÁRIO (DML sem uso público; policies só authenticated) | PLATAFORMA: revogar DML de anon; fora da migration |
| storage.vector_indexes | tabela | anon: SELECT | sim | linhas=0 | DESNECESSÁRIO (DML sem uso público; policies só authenticated) | PLATAFORMA: revogar DML de anon; fora da migration |
