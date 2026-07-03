-- 223 — Cria índices para chaves estrangeiras sem índice de cobertura (coluna inicial).
--
-- 31 FKs não tinham índice liderado pela coluna referenciante (advisor unindexed_foreign_keys).
-- Sem isso, DELETE/UPDATE no pai faz seq scan no filho e os JOINs por FK não são servidos por
-- índice. Todos os índices são pequenos; ganho em integridade referencial e joins. Idempotente.
-- Destaque: estoque.produto_id (só havia índice composto (loja_id, produto_id) — busca por produto
-- isolado, ex. baixa via produtos, não era coberta).

CREATE INDEX IF NOT EXISTS idx_caixas_operador_id ON public.caixas (operador_id);
CREATE INDEX IF NOT EXISTS idx_categorias_categoria_pai_id ON public.categorias (categoria_pai_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_vendedores_pago_por ON public.comissoes_vendedores (pago_por);
CREATE INDEX IF NOT EXISTS idx_configuracoes_gerais_atualizado_por ON public.configuracoes_gerais (atualizado_por);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_nfe_importacao_id ON public.contas_pagar (nfe_importacao_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_venda_id ON public.contas_receber (venda_id);
CREATE INDEX IF NOT EXISTS idx_documentos_fiscais_eventos_actor_user_id ON public.documentos_fiscais_eventos (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_estoque_produto_id ON public.estoque (produto_id);
CREATE INDEX IF NOT EXISTS idx_estoque_reposicoes_cancelamento_produto_id ON public.estoque_reposicoes_cancelamento (produto_id);
CREATE INDEX IF NOT EXISTS idx_importacoes_nfe_fornecedor_id ON public.importacoes_nfe (fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_importacoes_nfe_usuario_id ON public.importacoes_nfe (usuario_id);
CREATE INDEX IF NOT EXISTS idx_liquidacoes_receber_created_by ON public.liquidacoes_receber (created_by);
CREATE INDEX IF NOT EXISTS idx_liquidacoes_receber_titulo_id ON public.liquidacoes_receber (titulo_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_caixa_gerente_id ON public.movimentacoes_caixa (gerente_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_caixa_operador_id ON public.movimentacoes_caixa (operador_id);
CREATE INDEX IF NOT EXISTS idx_movimentos_caixa_caixa_id ON public.movimentos_caixa (caixa_id);
CREATE INDEX IF NOT EXISTS idx_movimentos_estoque_log_remessa_id ON public.movimentos_estoque_log (remessa_id);
CREATE INDEX IF NOT EXISTS idx_movimentos_estoque_log_tipo_codigo ON public.movimentos_estoque_log (tipo_codigo);
CREATE INDEX IF NOT EXISTS idx_movimentos_estoque_log_usuario_id ON public.movimentos_estoque_log (usuario_id);
CREATE INDEX IF NOT EXISTS idx_ordens_compra_created_by ON public.ordens_compra (created_by);

-- GUARD (2026-07-03): `public.perfis` nunca existiu como tabela no schema — nenhuma
-- migration cria essa relação (grep confirma: toda outra menção a "perfis" no
-- repositório é o plural de "perfil" em comentário, não nome de tabela). A
-- autorização foi unificada em `usuarios` (ver 216_fix_marcas_drift_ativo_rls_
-- usuarios.sql, que remove justamente variantes baseadas em "perfis"). Esta linha
-- provavelmente veio de um advisor do Postgres referenciando um catálogo já
-- dessincronizado (schema drift nunca capturado em migration). Guard por
-- to_regclass evita quebrar `db reset` do zero sem inventar substituto — se a
-- intenção real era indexar outra tabela (ex. usuarios.loja_id), isso precisa de
-- decisão explícita, não uma suposição nesta correção.
DO $$
BEGIN
  IF to_regclass('public.perfis') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_perfis_loja_id ON public.perfis (loja_id)';
  ELSE
    RAISE NOTICE 'public.perfis não existe — índice idx_perfis_loja_id pulado (tabela nunca existiu no schema).';
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_precos_atacado_loja_id ON public.precos_atacado (loja_id);
CREATE INDEX IF NOT EXISTS idx_regras_preco_created_by ON public.regras_preco (created_by);
CREATE INDEX IF NOT EXISTS idx_remessa_itens_produto_id ON public.remessa_itens (produto_id);
CREATE INDEX IF NOT EXISTS idx_remessas_created_by ON public.remessas (created_by);
CREATE INDEX IF NOT EXISTS idx_tokens_desconto_gerente_criado_por ON public.tokens_desconto_gerente (criado_por);
CREATE INDEX IF NOT EXISTS idx_transferencias_idempotencia_transferencia_id ON public.transferencias_idempotencia (transferencia_id);
CREATE INDEX IF NOT EXISTS idx_vendas_canceladas_auditoria_caixa_id ON public.vendas_canceladas_auditoria (caixa_id);
CREATE INDEX IF NOT EXISTS idx_vendas_canceladas_auditoria_operador_id ON public.vendas_canceladas_auditoria (operador_id);
CREATE INDEX IF NOT EXISTS idx_vinculos_fornecedor_produto_criado_por ON public.vinculos_fornecedor_produto (criado_por);
CREATE INDEX IF NOT EXISTS idx_vinculos_fornecedor_produto_fornecedor_id ON public.vinculos_fornecedor_produto (fornecedor_id);
