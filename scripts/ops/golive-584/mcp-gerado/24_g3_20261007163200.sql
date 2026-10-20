-- golive-final-584 :: 20261007163200 ssot_004_revoke_insert_documentos_fiscais :: sha256 daedb41f00e8962b9254be7b5de14c63c8b98938587c1e24b317d05924a39002
BEGIN;
SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '180s';
DO $g$ BEGIN IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261007163200') THEN RAISE EXCEPTION 'GOLIVE_STOP: % já no histórico', '20261007163200'; END IF; END $g$;
-- SSOT-004 — enqueue fiscal só via RPC canônica.
--
-- Reafirma REVOKE INSERT em documentos_fiscais_pendentes para authenticated/anon.
-- (Também aplicado em 20261007161220_fiscal_cancelado_ssot.sql — idempotente.)
-- App: enfileirarDocFiscalStub removido; check-entity-ssot bloqueia reintrodução.
--
-- Rollback: GRANT INSERT ON public.documentos_fiscais_pendentes TO authenticated;
--           (não recomendado — reabre bypass do stub.)


REVOKE INSERT ON public.documentos_fiscais_pendentes FROM authenticated, anon;

DO $prova$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'documentos_fiscais_pendentes'
      AND grantee = 'authenticated'
      AND privilege_type = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'SSOT-004 PROVA FAIL: INSERT ainda concedido a authenticated';
  END IF;

  IF to_regprocedure('public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid)') IS NULL THEN
    RAISE EXCEPTION 'SSOT-004 PROVA FAIL: RPC fiscal_enfileirar_documento_venda ausente';
  END IF;

  RAISE NOTICE 'SSOT-004 PROVA ESTRUTURAL OK: INSERT revogado; RPC enqueue presente';
END
$prova$;

NOTIFY pgrst, 'reload schema';
;
INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES ('20261007163200', 'ssot_004_revoke_insert_documentos_fiscais', ARRAY[$golive_stmt_daedb41f00e8$-- SSOT-004 — enqueue fiscal só via RPC canônica.
--
-- Reafirma REVOKE INSERT em documentos_fiscais_pendentes para authenticated/anon.
-- (Também aplicado em 20261007161220_fiscal_cancelado_ssot.sql — idempotente.)
-- App: enfileirarDocFiscalStub removido; check-entity-ssot bloqueia reintrodução.
--
-- Rollback: GRANT INSERT ON public.documentos_fiscais_pendentes TO authenticated;
--           (não recomendado — reabre bypass do stub.)

BEGIN;

REVOKE INSERT ON public.documentos_fiscais_pendentes FROM authenticated, anon;

DO $prova$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'documentos_fiscais_pendentes'
      AND grantee = 'authenticated'
      AND privilege_type = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'SSOT-004 PROVA FAIL: INSERT ainda concedido a authenticated';
  END IF;

  IF to_regprocedure('public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid)') IS NULL THEN
    RAISE EXCEPTION 'SSOT-004 PROVA FAIL: RPC fiscal_enfileirar_documento_venda ausente';
  END IF;

  RAISE NOTICE 'SSOT-004 PROVA ESTRUTURAL OK: INSERT revogado; RPC enqueue presente';
END
$prova$;

NOTIFY pgrst, 'reload schema';
COMMIT;
$golive_stmt_daedb41f00e8$]);
DO $chk$ DECLARE v text; o bigint; BEGIN
  SELECT replace((SELECT (SELECT 'vendas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,chave_nf,cliente_id,created_at,data,forma_pagamento,id,idempotency_key,numero_nf,operador_id,pricing_version_id,status,tipo_venda,total_bruto,total_desconto,total_liquido)::text) h FROM public.vendas) s)||' # '||(SELECT 'itens_venda:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(custo_unitario_snap,desconto_unitario,id,preco_unitario,preco_unitario_original,pricing_version_id,produto_id,promocao_desconto_percentual,promocao_nome_snapshot,promocao_regra_id,quantidade,regra_aplicada_id,tipo_preco,tipo_preco_fonte,venda_id)::text) h FROM public.itens_venda) s)||' # '||(SELECT 'vendas_pagamentos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(created_at,forma_pagamento,id,valor,venda_id)::text) h FROM public.vendas_pagamentos) s)||' # '||(SELECT 'caixas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(autorizado_por,conta_financeira_id,data_abertura,data_fechamento,fechamento_diferenca,fechamento_observacao,id,loja_id,motivo_retomada,operador_id,saldo_atual,status,turno_anterior_id,valor_fechamento,valor_inicial)::text) h FROM public.caixas) s)||' # '||(SELECT 'movimentacoes_caixa:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,created_at,deleted_at,device_id,forma_pagamento,gerente_id,id,idempotency_key,ip_address,loja_id,motivo,motivo_codigo,movimentacao_origem_id,numero_sequencial,operador_id,saldo_antes,saldo_depois,status,terminal_id,tipo,updated_at,user_agent,valor)::text) h FROM public.movimentacoes_caixa) s)||' # '||(SELECT 'estoque:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(estoque_minimo,id,loja_id,produto_id,quantidade_atual,updated_at,version)::text) h FROM public.estoque) s)||' # '||(SELECT 'produtos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,atualizado_por,categoria_id,cest,cfop_produto,codigo_barras,codigo_interno,comissao_tipo,comissao_valor,created_at,criado_por,csosn,cst_cofins,cst_pis,estoque_minimo,fornecedor_id,icms_origem,id,imagem_url,limite_transferencia_sem_observacao,localizacao_prateleira,loja_id,marca_id,ncm,nome,nome_reduzido_pdv,nome_sem_acento,observacao,origem,permitir_abaixo_custo,preco_atacado,preco_custo,preco_custo_medio,preco_varejo,quantidade_gatilho_atacado,referencia_fornecedor,status_publicacao,tags,tem_nf,unidade_medida,updated_at)::text) h FROM public.produtos) s)||' # '||(SELECT 'usuarios:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,funcionario_id,id,idioma_preferido,loja_id,nome,perfil)::text) h FROM public.usuarios) s)||' # '||(SELECT 'clientes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,consentimento_privacidade_em,created_at,documento,email,endereco,id,limite_credito,loja_id,nome,telefone,termos_aceitos_em,tipo)::text) h FROM public.clientes) s)||' # '||(SELECT 'lojas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,cnae,cnpj,codigo,created_at,email,endereco_bairro,endereco_cep,endereco_cidade,endereco_complemento,endereco_logradouro,endereco_numero,endereco_uf,id,inscricao_estadual,logo_url,nome,nome_fantasia,numero_serie_nfce,numero_serie_nfe,razao_social,telefone)::text) h FROM public.lojas) s)||' # '||(SELECT 'formas_pagamento:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,codigo,created_at,id,loja_id,nome,prazo_compensacao_dias,taxa_percentual,updated_at)::text) h FROM public.formas_pagamento) s)||' # '||(SELECT 'contas_financeiras:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,criado_por,data_inicial,id,loja_id,nome,tipo)::text) h FROM public.contas_financeiras) s)||' # '||(SELECT 'contas_pagar:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(cancelamento_em,cancelamento_motivo,categoria_id,competencia,criado_em,descricao,favorecido,fornecedor_id,id,loja_id,lote_id,nfe_importacao_id,nfe_numero,observacao,parcela,status,valor_pago,valor_total,vencimento)::text) h FROM public.contas_pagar) s)||' # '||(SELECT 'contas_receber:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(categoria_id,cliente_id,competencia,created_at,descricao,id,loja_id,status,valor_aberto,valor_total,vencimento,venda_id)::text) h FROM public.contas_receber) s)||' # '||(SELECT 'pdv_config:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(alertas_leves_ativos,auto_enqueue_fiscal,blind_closure,cfop_padrao,cst_padrao,formato_impressao,gerente_id,gerente_senha_bcrypt,id,idioma_padrao,imprimir_cupom_auto,limite_sangria_sem_gerente,limite_transferencia_obs,loja_id,max_desconto_gerente_percentual,max_desconto_manual_item_percentual,max_desconto_total_percentual,modo_limite_credito,quantidade_minima_atacado_padrao,regime_tributario,show_margin_visual,show_preco_fonte,show_stock_alerts,tema_padrao)::text) h FROM public.pdv_config) s)||' # '||(SELECT 'documentos_fiscais_pendentes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(chave_fiscal,correlation_id,created_at,deleted_at,fiscal_action_hint,fiscal_error_category,fiscal_error_code,fiscal_error_payload,fiscal_next_step_url,fiscal_retryable,id,payload,processado_em,protocolo,provider,provider_ref,proxima_tentativa_em,status,tentativas,tipo_doc,transicao_origem,ultima_tentativa_em,ultima_transicao_em,ultimo_erro,updated_at,venda_id,xml_armazenado_em,xml_lease_expires_em,xml_lease_token,xml_proxima_tentativa_em,xml_sha256,xml_status,xml_storage_path,xml_tentativas,xml_ultimo_erro)::text) h FROM public.documentos_fiscais_pendentes) s)||' # '||(SELECT 'totais:'||coalesce(string_agg(x,';' ORDER BY x),'') FROM (SELECT md5(l.id::text)||'|'||(SELECT count(*) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(v.total_liquido),0) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id AND v.status<>'CANCELADA')||'|'||(SELECT coalesce(sum(p.valor),0) FROM public.vendas_pagamentos p JOIN public.vendas v ON v.id=p.venda_id JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(saldo_atual),0) FROM public.caixas c WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(round(sum(quantidade_atual),3),0) FROM public.estoque e WHERE e.loja_id=l.id) x FROM public.lojas l) z)), ' # ', chr(1)) INTO v;
  IF v IS DISTINCT FROM $b$vendas:260:5c1f5a5067490828724c7e6793e90486itens_venda:265:8c5a0c68d26d3683324ab4398a339663vendas_pagamentos:108:0a473fb3507497a004a8939017d6b319caixas:56:a6e57b48a99c3bfdc2ababb690273a69movimentacoes_caixa:11:2b75d41eb7791147043b68015c89c0bdestoque:152:8f192671704ed300a97bf971f5aee4a9produtos:155:ce12eba23be390e38a178815fc4775c7usuarios:11:c3771aebcbf5642fa549d05fcb882a47clientes:2:88eb3c9ee632ac0dbbe5a6eb00b1f5b0lojas:1:c9488d2a43396d63bb7b482208a72fceformas_pagamento:4:7e3fee7650f570993c242c9513012e19contas_financeiras:0:-contas_pagar:9:541b1dc81dc7b94c4658301b64af6585contas_receber:3:a8c78e9630e752753334b8b4bbf76cadpdv_config:2:56a096d60214c463df2cfcc6b5b9ef23documentos_fiscais_pendentes:42:638d9052af1666def9bd7513e9d8b809totais:b5381bb6313900060b277d41cd1d490c|260|19364.60|11048.90|14053.10|32304.095$b$ THEN RAISE EXCEPTION 'GOLIVE_STOP: totais/hashes divergem da baseline após 20261007163200: %', replace(v, chr(1), ' # '); END IF;
  WITH fk AS (SELECT c.conrelid::regclass filho, c.confrelid::regclass pai,
 (SELECT string_agg(format('f.%I = p.%I', af.attname, ap.attname), ' AND ' ORDER BY k.i) FROM unnest(c.conkey, c.confkey) WITH ORDINALITY k(fc, pc, i) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc JOIN pg_attribute ap ON ap.attrelid=c.confrelid AND ap.attnum=k.pc) cond,
 (SELECT string_agg(format('f.%I IS NOT NULL', af.attname), ' AND ') FROM unnest(c.conkey) k(fc) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc) nn
 FROM pg_constraint c WHERE c.contype='f' AND c.connamespace IN ('public'::regnamespace) )
SELECT count(*) FILTER (WHERE (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) c FROM %s f WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)', filho, nn, pai, cond), false, true, '')))[1]::text::bigint > 0) FROM fk INTO o;
  IF o <> 0 THEN RAISE EXCEPTION 'GOLIVE_STOP: % FK(s) com órfãos após 20261007163200', o; END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261007163200' AND name='ssot_004_revoke_insert_documentos_fiscais') THEN RAISE EXCEPTION 'GOLIVE_STOP: linha de histórico ausente 20261007163200'; END IF;
END $chk$;
COMMIT;
