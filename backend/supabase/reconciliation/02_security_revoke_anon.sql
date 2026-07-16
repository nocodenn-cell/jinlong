-- P1 S1+S2 — REVOKE EXECUTE FROM anon (mutantes + leitura). NÃO EXECUTAR sem confirmação.
-- Reversível: ver 02_security_rollback_grant_anon.sql (re-GRANT idêntico).
-- Pré-condição: confirmar que nenhuma tela pré-login (login, health) depende destas RPCs.

-- S1: achado principal — grant-drift da v4 (migration 268 já pretendia isto)
REVOKE EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid
) FROM anon;

-- S2: demais mutantes/privilegiadas
REVOKE EXECUTE ON FUNCTION public.fechar_caixa_atomico(uuid, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fechar_caixa_pdv_atomico(uuid, numeric, text, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.colocar_venda_em_espera(jsonb, jsonb, uuid, text, uuid, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.descartar_venda_em_espera(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.retomar_venda_em_espera(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_criar_funcionario(uuid, uuid, text, text, text, numeric, text, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_atualizar_funcionario(uuid, text, text, numeric, text, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_desativar_funcionario(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ensure_venda_evento_registrado(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.registrar_venda_evento(text, uuid, text, uuid, uuid, uuid, jsonb, numeric, numeric, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.registrar_pricing_version_venda(uuid, uuid) FROM anon;

-- S2: leitura/consulta
REVOKE EXECUTE ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.listar_vendas_em_espera() FROM anon;
REVOKE EXECUTE ON FUNCTION public.listar_venda_eventos_gerente(uuid, timestamptz, timestamptz, text[], text[], integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.kpis_venda_eventos_gerente(uuid, timestamptz, timestamptz, text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.obter_status_caixa_operador(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.obter_pricing_version_ativa() FROM anon;
REVOKE EXECUTE ON FUNCTION public.pdv_config_flags_visuais() FROM anon;
REVOKE EXECUTE ON FUNCTION public.proximo_numero_venda_em_espera(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verificar_consistencia_venda(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.shadow_validar_venda_engine_v4(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.venda_eventos_items_from_payload(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.venda_eventos_items_from_sale(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.caixa_integridade_gate_check() FROM anon;

-- S3: funções de trigger (nenhum papel deveria ter EXECUTE direto)
REVOKE EXECUTE ON FUNCTION public.fn_audit_update_funcionarios_meta() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_registrar_comissao() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_historico_preco_produto() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_documentos_fiscais_eventos_ai() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_documentos_fiscais_eventos_au() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_fn_itens_venda_limite_desconto() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_fn_precos_atacado_margem() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_fn_produtos_margem() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_fn_regras_preco_margem() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_fn_vendas_caixa_aberto() FROM PUBLIC, anon, authenticated;

-- Após executar: rodar get_advisors(security) e confirmar login/venda/caixa via smoke manual.
