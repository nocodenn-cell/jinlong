-- Rollback de 20261023200000_pdv_troca_operador_caixa: devolve a regra "operador = responsável do caixa"
-- nas RPCs, remove trigger, RPCs e a tabela de operadores ativos (a trilha em pdv_operador_eventos fica).
-- Antes: garanta que nenhum caixa ABERTO esteja com operador diferente do responsável, senão o turno
-- volta a pertencer só a quem abriu.
DO $$
BEGIN
  IF to_regprocedure('internal.fp_troca_operador_patch(text, text, text, boolean)') IS NOT NULL THEN
    PERFORM internal.fp_troca_operador_patch('finalizar_venda_transacional_canonica_v4',
      'IF internal.fp_operador_ativo_caixa(p_caixa_id, v_caixa_operador_id) IS DISTINCT FROM v_uid THEN',
      'IF v_caixa_operador_id IS DISTINCT FROM v_uid THEN', false);
    PERFORM internal.fp_troca_operador_patch('registrar_movimentacao',
      'internal.fp_operador_ativo_caixa(c.id, c.operador_id) = v_uid', 'c.operador_id = v_uid', false);
    PERFORM internal.fp_troca_operador_patch('estornar_movimentacao',
      'OR internal.fp_operador_ativo_caixa(c.id, c.operador_id) = v_uid', 'OR c.operador_id = v_uid', false);
    PERFORM internal.fp_troca_operador_patch('obter_status_caixa_operador',
      'WHERE internal.fp_operador_ativo_caixa(c.id, c.operador_id) = v_uid AND c.status = ''ABERTO''',
      'WHERE c.operador_id = v_uid AND c.status = ''ABERTO''', false);
    PERFORM internal.fp_troca_operador_patch('fechar_caixa_atomico',
      'WHERE internal.fp_operador_ativo_caixa(c.id, c.operador_id) = p_operador_id AND c.status = ''ABERTO''',
      'WHERE c.operador_id = p_operador_id AND c.status = ''ABERTO''', false);
    PERFORM internal.fp_troca_operador_patch('fechar_caixa_atomico',
      'WHERE (c.operador_id = p_operador_id OR internal.fp_participou_caixa(c.id, p_operador_id)) AND c.status = ''FECHADO''',
      'WHERE c.operador_id = p_operador_id AND c.status = ''FECHADO''', false);
    PERFORM internal.fp_troca_operador_patch('resolver_caixa_pagador',
      'internal.fp_operador_ativo_caixa(c.id, c.operador_id) = p_uid', 'c.operador_id = p_uid', false);
    PERFORM internal.fp_troca_operador_patch('calcular_valor_sistema_dinheiro_caixa',
      '(c.operador_id = auth.uid() OR internal.fp_participou_caixa(c.id, auth.uid())) OR', 'c.operador_id = auth.uid() OR', false);
    PERFORM internal.fp_troca_operador_patch('calcular_valor_sistema_por_forma_caixa',
      '(c.operador_id = auth.uid() OR internal.fp_participou_caixa(c.id, auth.uid())) OR', 'c.operador_id = auth.uid() OR', false);
    PERFORM internal.fp_troca_operador_patch('listar_caixas_fechamento_formas',
      '(c.operador_id = auth.uid() OR internal.fp_participou_caixa(c.id, auth.uid())) OR', 'c.operador_id = auth.uid() OR', false);
  END IF;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['caixas', 'movimentacoes_caixa', 'vendas', 'caixas_fechamento_formas', 'vendas_pagamentos'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_turno_operador', t);
    END IF;
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_caixas_fechamento_operador ON public.caixas;
DROP FUNCTION IF EXISTS internal.trg_caixas_fechamento_operador();
DROP FUNCTION IF EXISTS public.pdv_troca_contexto();
DROP FUNCTION IF EXISTS public.desbloquear_caixa_operador(uuid);
DROP FUNCTION IF EXISTS public.bloquear_caixa_operador(text);
DROP FUNCTION IF EXISTS public.assumir_caixa_operador(uuid);
DROP FUNCTION IF EXISTS public.liberar_caixa_operador(uuid);
DROP FUNCTION IF EXISTS internal.fp_troca_operador_patch(text, text, text, boolean);
DROP FUNCTION IF EXISTS internal.fp_garantir_linha_responsavel(uuid);
DROP FUNCTION IF EXISTS internal.fp_evento_operador(uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.fp_participa_caixa(uuid);
DROP FUNCTION IF EXISTS internal.fp_participou_caixa(uuid, uuid);
DROP FUNCTION IF EXISTS internal.fp_operador_ativo_caixa(uuid, uuid);
DO $$ BEGIN
  IF to_regclass('internal.fp_tenant_guardas') IS NOT NULL THEN
    DELETE FROM internal.fp_tenant_guardas WHERE tabela = 'caixa_operadores';
  END IF;
END $$;
DROP TABLE IF EXISTS public.caixa_operadores;
NOTIFY pgrst, 'reload schema';
