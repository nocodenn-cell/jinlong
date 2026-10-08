-- Limpeza dos dados TRANSACIONAIS de teste do Jinlong (piloto D0).
--
-- Remove vendas, caixas, movimentos de caixa/estoque, financeiro (AR/AP), compras/NF-e/
-- remessas, documentos fiscais, comissões geradas e telemetria. PRESERVA cadastros e
-- configuração: lojas, usuarios/auth, perfis, produtos, categorias, marcas, fornecedores,
-- clientes, precos_atacado, pdv_config, configuracoes_gerais, feature_flags, formas_pagamento,
-- tipos_movimento_estoque, regras de comissão, checklist de implantação etc. (lista completa
-- em docs/runbooks/LIMPEZA_DADOS_TESTE_D0.md).
--
-- Saldo de estoque (estoque.quantidade_atual) é preservado. O kardex é zerado e recebe UM
-- movimento ENTRADA_AJUSTE de saldo inicial por linha de estoque com saldo > 0, para que
-- v_estoque_ledger_divergencia fique vazia. CONFIRME O SALDO FÍSICO ANTES DE ABRIR A LOJA.
--
-- SEGURANÇA
--   * Dry-run por padrão: termina em ROLLBACK. Só confirma com -v commit=1.
--   * Exige -v autorizacao=LIMPAR_DADOS_TESTE_JINLONG_D0, -v ator_id=<uuid de auth.users DONO>
--     e -v corte='<timestamptz>': aborta se existir venda/caixa criado a partir do corte
--     (protege vendas REAIS contra uma reexecução acidental depois do go-live).
--   * NUNCA executar em produção sem autorização específica e backup restaurável (ver runbook).
--   * Reexecutável: antes do go-live, rodar de novo produz o mesmo estado final.
--
-- Uso (banco descartável):
--   psql -v ON_ERROR_STOP=1 -v autorizacao=LIMPAR_DADOS_TESTE_JINLONG_D0 \
--        -v ator_id=<uuid> -v corte='2026-10-10 00:00:00+00' -v commit=0 -f limpeza-dados-teste-d0.sql
\set ON_ERROR_STOP on
\if :{?autorizacao} \else \echo 'ERRO: informe -v autorizacao=...' \quit \endif
\if :{?ator_id} \else \echo 'ERRO: informe -v ator_id=<uuid do DONO>' \quit \endif
\if :{?commit} \else \set commit 0 \endif
SELECT (:'autorizacao' = 'LIMPAR_DADOS_TESTE_JINLONG_D0') AS autorizado \gset
\if :autorizado \else \echo 'ERRO: autorizacao invalida' \quit \endif
\if :{?corte} \else \echo 'ERRO: informe -v corte=<timestamptz do go-live>' \quit \endif

-- Guarda: vendas/caixas criados a partir do corte são tratados como reais e bloqueiam a limpeza.
SELECT (EXISTS (SELECT 1 FROM public.vendas WHERE created_at >= :'corte'::timestamptz)
     OR EXISTS (SELECT 1 FROM public.caixas WHERE data_abertura >= :'corte'::timestamptz)) AS dados_reais \gset
\if :dados_reais
  \echo 'ABORTADO: existem vendas/caixas a partir do corte (dados possivelmente reais).'
  \quit
\endif

BEGIN;
-- replica: desliga triggers de imutabilidade/FK durante a limpeza (restauradas no COMMIT/ROLLBACK).
SET LOCAL session_replication_role = replica;

CREATE TEMP TABLE _limpeza_tabelas (nome text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _limpeza_tabelas VALUES
  ('vendas'), ('itens_venda'), ('vendas_pagamentos'), ('vendas_em_espera'),
  ('vendas_canceladas_auditoria'), ('venda_eventos'), ('venda_pos_venda_itens'),
  ('venda_pos_venda_operacoes'), ('venda_engine_shadow_runs'), ('devolucoes'),
  ('descontos_venda'), ('tokens_desconto_gerente'), ('estoque_baixas'),
  ('estoque_reposicoes_cancelamento'), ('estoque_reposicoes_devolucao'),
  ('caixas'), ('movimentacoes_caixa'), ('movimentos_caixa'),
  ('tokens_autorizacao_operacao'), ('gerente_auth_attempts'), ('gerente_auth_rate_limits'),
  ('documentos_fiscais_pendentes'), ('documentos_fiscais_eventos'), ('documentos_fiscais_dlq'),
  ('comissoes_itens'), ('comissoes_ajustes'), ('comissoes_pagamentos'),
  ('comissoes_pagamentos_ajustes'), ('comissoes_vendedores'),
  ('contas_receber'), ('liquidacoes_receber'), ('contas_pagar'), ('contas_pagar_pagamentos'),
  ('movimentos_financeiros'), ('conciliacoes_financeiras'), ('extratos_financeiros'),
  ('financeiro_comandos'), ('financeiro_recebiveis_venda'),
  ('importacoes_nfe'), ('importacoes_nfe_itens'), ('importacoes_nfe_duplicatas'),
  ('entrada_documentos'), ('remessas'), ('remessa_itens'),
  ('ordens_compra'), ('ordens_compra_itens'), ('ordens_compra_recebimentos'),
  ('movimentos_estoque_log'), ('transferencias_idempotencia'), ('sync_request_nonces'),
  ('system_alerts'), ('caixa_scan_telemetry_events'), ('cadastro_produto_telemetry_events'),
  ('produto_create_requests');

CREATE TEMP TABLE _limpeza_contagens (tabela text PRIMARY KEY, antes bigint, depois bigint) ON COMMIT DROP;

DO $contar_antes$
DECLARE r record;
BEGIN
  FOR r IN SELECT nome FROM _limpeza_tabelas ORDER BY nome LOOP
    EXECUTE format(
      'INSERT INTO _limpeza_contagens (tabela, antes) SELECT %L, count(*) FROM public.%I',
      r.nome, r.nome);
  END LOOP;
END
$contar_antes$;

DO $apagar$
DECLARE r record;
BEGIN
  FOR r IN SELECT nome FROM _limpeza_tabelas ORDER BY nome LOOP
    EXECUTE format('DELETE FROM public.%I', r.nome);
  END LOOP;
END
$apagar$;

-- Numeração sequencial de movimentos de caixa recomeça em 1.
SELECT setval('public.movimentacoes_caixa_numero_sequencial_seq', 1, false);

-- Baseline do kardex: um ENTRADA_AJUSTE por linha de estoque com saldo > 0.
INSERT INTO public.movimentos_estoque_log
  (loja_id, produto_id, tipo_codigo, quantidade_delta, usuario_id, observacao)
SELECT e.loja_id, e.produto_id, 'ENTRADA_AJUSTE', e.quantidade_atual, :'ator_id'::uuid,
       'Saldo inicial — baseline pós-limpeza D0 (confirmar com contagem física)'
FROM public.estoque e
WHERE e.quantidade_atual > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.movimentos_estoque_log m
    WHERE m.loja_id = e.loja_id AND m.produto_id = e.produto_id
      AND m.observacao LIKE 'Saldo inicial — baseline pós-limpeza D0%');

DO $contar_depois$
DECLARE r record;
BEGIN
  FOR r IN SELECT nome FROM _limpeza_tabelas ORDER BY nome LOOP
    EXECUTE format(
      'UPDATE _limpeza_contagens SET depois = (SELECT count(*) FROM public.%I) WHERE tabela = %L',
      r.nome, r.nome);
  END LOOP;
END
$contar_depois$;

-- Integridade referencial: nenhuma FK de public pode apontar para linha inexistente.
DO $orfaos$
DECLARE
  c record; cols_filho text; cols_pai text; join_on text; n bigint; total bigint := 0;
BEGIN
  FOR c IN
    SELECT con.oid, con.conname, con.conrelid::regclass AS filho, con.confrelid::regclass AS pai,
           con.conkey, con.confkey, con.conrelid AS filho_oid, con.confrelid AS pai_oid
    FROM pg_constraint con
    WHERE con.contype = 'f' AND con.connamespace = 'public'::regnamespace
  LOOP
    SELECT string_agg(format('f.%I IS NOT NULL', a.attname), ' AND '),
           string_agg(format('f.%I = p.%I', a.attname, b.attname), ' AND ')
      INTO cols_filho, join_on
    FROM unnest(c.conkey, c.confkey) AS k(fk, pk)
    JOIN pg_attribute a ON a.attrelid = c.filho_oid AND a.attnum = k.fk
    JOIN pg_attribute b ON b.attrelid = c.pai_oid AND b.attnum = k.pk;
    EXECUTE format(
      'SELECT count(*) FROM %s f WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)',
      c.filho, cols_filho, c.pai, join_on) INTO n;
    IF n > 0 THEN
      RAISE WARNING 'FK órfã: % em % (% linhas)', c.conname, c.filho, n;
      total := total + n;
    END IF;
  END LOOP;
  IF total > 0 THEN
    RAISE EXCEPTION 'Limpeza abortada: % referências órfãs (ver warnings)', total;
  END IF;
END
$orfaos$;

\echo '== Contagens (antes -> depois) =='
SELECT tabela, antes, depois FROM _limpeza_contagens WHERE antes > 0 OR depois > 0 ORDER BY tabela;
\echo '== Divergência kardex x saldo (esperado: 0) =='
SELECT count(*) AS divergencias FROM public.v_estoque_ledger_divergencia;

\if :commit
  \echo 'COMMIT solicitado.'
  COMMIT;
\else
  \echo 'DRY-RUN: ROLLBACK (use -v commit=1 para confirmar).'
  ROLLBACK;
\endif
