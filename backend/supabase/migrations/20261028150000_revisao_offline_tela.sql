-- Tela da fila de revisão offline (pdv-importados /admin/revisao-offline).
-- Depende de 20261028130000. Sem tabela nova; nada é apagado.
--
-- 1. public.listar_revisoes_offline(p_status, p_limite): leitura para a tela, com nome do operador e de quem decidiu
--    (o operador costuma estar INATIVO, e a RLS de usuarios pode escondê-lo). Escopo no servidor, independente da UI:
--    só lojas onde o chamador é DONO/GERENTE ATIVO (fp_lojas_permitidas + fp_usuario_ativo_com_papel). Empresa de fora
--    não aparece. Payload completo não sai: só o resumo necessário para decidir.
-- 2. public.revisar_evento_offline: repetição idempotente. Se o MESMO usuário reenviar a MESMA decisão (duplo clique,
--    rede caiu depois do commit), devolve a decisão gravada com idempotente=true em vez de erro. Decisão diferente ou
--    outro usuário continua recebendo REVISAO_JA_DECIDIDA. Justificativa: 5..500 caracteres. O resto é igual
--    (FOR UPDATE, sem autoaprovação, ordem por caixa, aplicação do evento).
-- Rollback: backend/supabase/rollback/20261028150000_revisao_offline_tela.rollback.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.listar_revisoes_offline(p_status text DEFAULT 'PENDENTE', p_limite integer DEFAULT 100)
RETURNS TABLE (
  id uuid, seq bigint, event_id text, tipo text, origem text, empresa_id uuid, loja_id uuid, loja_nome text,
  caixa_id uuid, venda_id uuid, operador_id uuid, operador_nome text, operador_ativo boolean,
  horario_dispositivo timestamptz, recebido_em timestamptz, classificacao text, motivo text, evidencias jsonb,
  resumo jsonb, status text, decidido_por uuid, decidido_por_nome text, decidido_em timestamptz, decisao_motivo text,
  anteriores_pendentes integer, e_meu_evento boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lim integer := least(greatest(coalesce(p_limite, 100), 1), 200);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'REVISAO_EXIGE_USUARIO' USING ERRCODE = '42501'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('PENDENTE', 'DECIDIDOS', 'TODOS') THEN
    RAISE EXCEPTION 'REVISAO_FILTRO_INVALIDO';
  END IF;
  RETURN QUERY
  SELECT r.id, r.seq, r.event_id, r.tipo, r.origem, r.empresa_id, r.loja_id, l.nome, r.caixa_id, r.venda_id,
         r.operador_id, op.nome, op.ativo, r.horario_dispositivo, r.recebido_em, r.classificacao, r.motivo, r.evidencias,
         jsonb_strip_nulls(jsonb_build_object(
           'total_liquido', r.payload->'total_liquido', 'total_bruto', r.payload->'total_bruto',
           'forma_pagamento', r.payload->'forma_pagamento',
           'itens', CASE WHEN jsonb_typeof(r.payload->'itens') = 'array' THEN jsonb_array_length(r.payload->'itens') END,
           'valor_inicial', r.payload->'valor_inicial', 'valor_fechamento', r.payload->'valor_fechamento',
           'valor', r.payload->'valor', 'tipo_movimento', r.payload->'tipo')),
         r.status, r.decidido_por, dp.nome, r.decidido_em, r.decisao_motivo,
         (SELECT count(*)::int FROM public.sync_eventos_revisao o
           WHERE r.caixa_id IS NOT NULL AND o.caixa_id = r.caixa_id AND o.status = 'PENDENTE' AND o.seq < r.seq),
         (r.operador_id IS NOT DISTINCT FROM v_uid)
    FROM public.sync_eventos_revisao r
    JOIN public.lojas l ON l.id = r.loja_id
    LEFT JOIN public.usuarios op ON op.id = r.operador_id
    LEFT JOIN public.usuarios dp ON dp.id = r.decidido_por
   WHERE r.loja_id IN (SELECT public.fp_lojas_permitidas(ARRAY['DONO', 'GERENTE']))
     AND internal.fp_usuario_ativo_com_papel(v_uid, r.loja_id, ARRAY['DONO', 'GERENTE'])
     AND (coalesce(p_status, 'PENDENTE') = 'TODOS'
          OR (coalesce(p_status, 'PENDENTE') = 'PENDENTE' AND r.status = 'PENDENTE')
          OR (p_status = 'DECIDIDOS' AND r.status <> 'PENDENTE'))
   ORDER BY CASE WHEN r.status = 'PENDENTE' THEN r.seq END ASC NULLS LAST,
            coalesce(r.decidido_em, r.recebido_em) DESC
   LIMIT v_lim;
END $$;
REVOKE ALL ON FUNCTION public.listar_revisoes_offline(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_revisoes_offline(text, integer) TO authenticated;
COMMENT ON FUNCTION public.listar_revisoes_offline(text, integer) IS
  'Multiempresa revisado (20261028150000): só lojas onde auth.uid() é DONO/GERENTE ativo (fp_lojas_permitidas + '
  'fp_usuario_ativo_com_papel); sem payload completo. Tela /admin/revisao-offline.';

CREATE OR REPLACE FUNCTION public.revisar_evento_offline(p_id uuid, p_decisao text, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_r public.sync_eventos_revisao%ROWTYPE;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_alvo text := CASE p_decisao WHEN 'APROVAR' THEN 'APROVADO' WHEN 'REJEITAR' THEN 'REJEITADO' END;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'REVISAO_EXIGE_USUARIO' USING ERRCODE = '42501'; END IF;
  IF v_alvo IS NULL THEN RAISE EXCEPTION 'REVISAO_DECISAO_INVALIDA'; END IF;
  IF length(v_motivo) < 5 THEN RAISE EXCEPTION 'REVISAO_MOTIVO_OBRIGATORIO'; END IF;
  IF length(v_motivo) > 500 THEN RAISE EXCEPTION 'REVISAO_MOTIVO_LONGO'; END IF;
  SELECT * INTO v_r FROM public.sync_eventos_revisao WHERE id = p_id FOR UPDATE;
  -- Fora do escopo e inexistente respondem igual (não revela eventos de outra loja/empresa).
  IF NOT FOUND OR NOT internal.fp_usuario_ativo_com_papel(v_uid, v_r.loja_id, ARRAY['DONO', 'GERENTE']) THEN
    RAISE EXCEPTION 'REVISAO_NAO_ENCONTRADA_OU_SEM_PERMISSAO' USING ERRCODE = '42501';
  END IF;
  IF v_r.operador_id IS NOT DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'REVISAO_AUTOAPROVACAO_PROIBIDA' USING ERRCODE = '42501';
  END IF;
  IF v_r.status <> 'PENDENTE' THEN
    -- Repetição da MESMA decisão pelo MESMO usuário: devolve o que já está gravado (não aplica de novo).
    IF v_r.decidido_por = v_uid AND v_r.status = v_alvo THEN
      RETURN jsonb_build_object('id', p_id, 'status', v_r.status, 'idempotente', true,
                                'decidido_em', v_r.decidido_em);
    END IF;
    RAISE EXCEPTION 'REVISAO_JA_DECIDIDA';
  END IF;
  IF p_decisao = 'APROVAR' THEN
    IF v_r.caixa_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.sync_eventos_revisao o
         WHERE o.caixa_id = v_r.caixa_id AND o.status = 'PENDENTE' AND o.seq < v_r.seq) THEN
      RAISE EXCEPTION 'REVISAO_FORA_DE_ORDEM: decida antes os eventos anteriores deste caixa';
    END IF;
    PERFORM internal.sync_aplicar_evento_revisado(v_r);
  END IF;
  UPDATE public.sync_eventos_revisao
     SET status = v_alvo, decidido_por = v_uid, decidido_em = now(), decisao_motivo = v_motivo
   WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'status', v_alvo, 'idempotente', false, 'decidido_em', now());
END $$;
REVOKE ALL ON FUNCTION public.revisar_evento_offline(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisar_evento_offline(uuid, text, text) TO authenticated;
COMMENT ON FUNCTION public.revisar_evento_offline(uuid, text, text) IS
  'Multiempresa revisado (20261028130000/20261028150000): exige DONO/GERENTE ativo com vínculo na loja do evento '
  '(internal.fp_usuario_ativo_com_papel); fora do escopo = não encontrado. Sem autoaprovação; motivo 5..500; ordem por '
  'caixa; repetição da mesma decisão pelo mesmo usuário é idempotente.';

COMMIT;
