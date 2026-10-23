-- Corrige seed de empresa nova: gerente_senha_sha256 não existe mais em pdv_config.
-- exigir_pin_operador explícito false (#609). Rollback: ops/corte/rollback-semear-config.sql
CREATE OR REPLACE FUNCTION internal.fp_semear_config_empresa(p_empresa uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id integer;
BEGIN
  INSERT INTO public.configuracoes_gerais (empresa_id, chave, valor, tipo_dado, descricao) VALUES
    (p_empresa, 'comissao_padrao_percentual', '5.00', 'percent', 'Comissão padrão para vendedores (%)'),
    (p_empresa, 'desconto_maximo_operador_percentual', '10.00', 'percent', 'Desconto máximo na venda sem validação de gerente (somatório linhas, %)'),
    (p_empresa, 'cancelamento_maximo_valor_sem_gerente', '500.00', 'money', 'Reservado: limite de cancelamento de venda sem gerente (R$)'),
    (p_empresa, 'estoque_minimo_padrao', '10', 'integer', 'Estoque mínimo padrão'),
    (p_empresa, 'lead_time_min_dias', '30', 'integer', 'Lead time mínimo de importação (dias)'),
    (p_empresa, 'lead_time_max_dias', '60', 'integer', 'Lead time máximo de importação (dias)'),
    (p_empresa, 'vendas_suspensas', 'false', 'text', 'Vendas suspensas'),
    (p_empresa, 'motivo_suspensao', '', 'text', 'Motivo da suspensão')
  ON CONFLICT (empresa_id, chave) DO NOTHING;
  INSERT INTO public.relatorio_settings (empresa_id) VALUES (p_empresa) ON CONFLICT (empresa_id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.pdv_config WHERE empresa_id = p_empresa AND loja_id IS NULL) THEN
    LOCK TABLE public.pdv_config IN SHARE ROW EXCLUSIVE MODE;
    SELECT coalesce(max(id), 0) + 1 INTO v_id FROM public.pdv_config;
    INSERT INTO public.pdv_config (id, empresa_id, loja_id, gerente_id, exigir_pin_operador)
    VALUES (v_id, p_empresa, NULL, 'empresa-' || left(p_empresa::text, 8), false);
  END IF;
END $function$
;
