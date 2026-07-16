-- P1 rollback — restaura exatamente os GRANTs revogados por 02_security_revoke_anon.sql.
-- Usar apenas se S1-S3 causarem regressão inesperada (ex.: uma tela pré-login dependia
-- de uma dessas RPCs de forma não documentada).

GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid
) TO anon;

GRANT EXECUTE ON FUNCTION public.fechar_caixa_atomico(uuid, numeric, text) TO anon;
GRANT EXECUTE ON FUNCTION public.fechar_caixa_pdv_atomico(uuid, numeric, text, timestamptz) TO anon;
GRANT EXECUTE ON FUNCTION public.colocar_venda_em_espera(jsonb, jsonb, uuid, text, uuid, numeric, text) TO anon;
GRANT EXECUTE ON FUNCTION public.descartar_venda_em_espera(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.retomar_venda_em_espera(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_criar_funcionario(uuid, uuid, text, text, text, numeric, text, numeric) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_funcionario(uuid, text, text, numeric, text, numeric) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_desativar_funcionario(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.ensure_venda_evento_registrado(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.registrar_venda_evento(text, uuid, text, uuid, uuid, uuid, jsonb, numeric, numeric, text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.registrar_pricing_version_venda(uuid, uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.listar_vendas_em_espera() TO anon;
GRANT EXECUTE ON FUNCTION public.listar_venda_eventos_gerente(uuid, timestamptz, timestamptz, text[], text[], integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.kpis_venda_eventos_gerente(uuid, timestamptz, timestamptz, text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.obter_status_caixa_operador(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.obter_pricing_version_ativa() TO anon;
GRANT EXECUTE ON FUNCTION public.pdv_config_flags_visuais() TO anon;
GRANT EXECUTE ON FUNCTION public.proximo_numero_venda_em_espera(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz) TO anon;
GRANT EXECUTE ON FUNCTION public.verificar_consistencia_venda(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.shadow_validar_venda_engine_v4(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.venda_eventos_items_from_payload(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.venda_eventos_items_from_sale(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.caixa_integridade_gate_check() TO anon;

GRANT EXECUTE ON FUNCTION public.fn_audit_update_funcionarios_meta() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_registrar_comissao() TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_historico_preco_produto() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_documentos_fiscais_eventos_ai() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_documentos_fiscais_eventos_au() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_fn_itens_venda_limite_desconto() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_fn_precos_atacado_margem() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_fn_produtos_margem() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_fn_regras_preco_margem() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_fn_vendas_caixa_aberto() TO authenticated;
