-- SSOT-003 — reconhecimento explícito de obrigação financeira na NF-e.
--
-- Política (docs/regras-negocio/SSOT_AQUISICAO_OBRIGACAO_FINANCEIRA.md):
--   OC / remessa  → estoque sem obrigação (tipo_codigo ENTRADA_OC / ENTRADA_REMESSA_*)
--   NF-e confirm  → se valor econômico > 0, exige ≥1 duplicata; senão rejeita
--                   IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA. Com duplicatas → AP+origem.
--
-- Não cria AP fictícia para OC/remessa.
-- Rollback: remover o bloco de guard desta migration (reaplicar confirmar anterior).

BEGIN;

COMMENT ON FUNCTION public.receber_ordem_compra(uuid, jsonb, text, text) IS
  'UX-04 + SSOT-003: entrada física pelo pedido (ENTRADA_OC). Sem obrigação financeira '
  'nem AP — bem recebido sem título. Obrigação nasce só em confirmar_importacao_nfe com duplicatas.';

-- Substituição completa (corpo = 20261005225856 + guard SSOT-003).
CREATE OR REPLACE FUNCTION public.confirmar_importacao_nfe(p_importacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_remessa      uuid;
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_imp          record;
  v_it           record;
  v_dup          record;
  v_pendentes    int;
  v_oc           record;
  v_mov          uuid;
  v_obs          text;
  v_econ         numeric(14,2);
  v_n_dup        int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'IMPORT_NFE_PERFIL';
  END IF;

  SELECT id, loja_id, fornecedor_id, numero_nf, status, ordem_compra_id INTO v_imp
    FROM public.importacoes_nfe
   WHERE id = p_importacao_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IMPORT_NFE_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_imp.loja_id THEN
    RAISE EXCEPTION 'IMPORT_NFE_LOJA';
  END IF;

  IF v_imp.status <> 'EM_CONFERENCIA' THEN
    RAISE EXCEPTION 'IMPORT_NFE_STATUS_INVALIDO';
  END IF;

  SELECT count(*) INTO v_pendentes
    FROM public.importacoes_nfe_itens
   WHERE importacao_nfe_id = p_importacao_id AND status_conferencia = 'EM_CONFERENCIA';

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'IMPORT_NFE_CONFERENCIA_PENDENTE';
  END IF;

  SELECT remessa_id INTO v_remessa FROM public.entrada_documentos WHERE importacao_id=p_importacao_id;
  IF v_remessa IS NOT NULL THEN
    PERFORM public._validar_documento_entrega(p_importacao_id,v_remessa,v_imp.loja_id);
  END IF;

  IF v_remessa IS NULL AND v_imp.ordem_compra_id IS NOT NULL THEN
    SELECT oc.id, oc.loja_id, oc.status INTO v_oc
      FROM public.ordens_compra oc WHERE oc.id = v_imp.ordem_compra_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'OC_NAO_ENCONTRADA'; END IF;
    IF v_oc.loja_id IS DISTINCT FROM v_imp.loja_id THEN RAISE EXCEPTION 'OC_LOJA'; END IF;
    IF v_oc.status NOT IN ('CONFIRMADA', 'EM_TRANSITO') THEN RAISE EXCEPTION 'OC_STATUS_INVALIDO'; END IF;
  END IF;

  -- SSOT-003: bem com valor econômico exige reconhecimento de obrigação (duplicatas → AP).
  SELECT coalesce(sum(
           coalesce(quantidade_conferida, 0) * coalesce(custo_unitario, 0)
         ), 0)::numeric(14,2)
    INTO v_econ
    FROM public.importacoes_nfe_itens
   WHERE importacao_nfe_id = p_importacao_id;

  SELECT count(*)::int INTO v_n_dup
    FROM public.importacoes_nfe_duplicatas
   WHERE importacao_nfe_id = p_importacao_id;

  IF v_econ > 0 AND v_n_dup = 0 THEN
    RAISE EXCEPTION 'IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA'
      USING DETAIL = format(
        'valor_economico=%s duplicatas=0 — confirme duplicatas ou registre entrada OC/remessa sem obrigação',
        v_econ
      );
  END IF;

  FOR v_it IN
    SELECT produto_id, quantidade_nfe, quantidade_conferida, custo_unitario, atualizar_custo, status_conferencia
      FROM public.importacoes_nfe_itens
     WHERE importacao_nfe_id = p_importacao_id
  LOOP
    IF v_remessa IS NULL AND v_it.quantidade_conferida IS NOT NULL AND v_it.quantidade_conferida > 0 THEN
      INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
      VALUES (v_it.produto_id, v_imp.loja_id, v_it.quantidade_conferida, 0, 1)
      ON CONFLICT (loja_id, produto_id) DO UPDATE
        SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
            version          = public.estoque.version + 1,
            updated_at       = now();

      v_obs := format('Importação NF-e %s (conferido%s)', p_importacao_id::text,
               CASE WHEN v_it.status_conferencia = 'DIVERGENTE' THEN ', divergente da nota' ELSE '' END);
      IF v_remessa IS NULL AND v_imp.ordem_compra_id IS NOT NULL THEN
        v_obs := v_obs || format(' · OC %s', v_imp.ordem_compra_id::text);
      END IF;

      INSERT INTO public.movimentos_estoque_log (
        loja_id, produto_id, tipo_codigo, quantidade_delta, usuario_id, observacao
      ) VALUES (
        v_imp.loja_id, v_it.produto_id, 'ENTRADA_NFE', v_it.quantidade_conferida, v_uid, v_obs
      ) RETURNING id INTO v_mov;

      IF v_remessa IS NULL AND v_imp.ordem_compra_id IS NOT NULL THEN
        PERFORM public._oc_abater_por_produto(
          v_imp.ordem_compra_id, v_imp.loja_id, v_uid, 'NFE', p_importacao_id, NULL, p_importacao_id,
          v_it.produto_id, v_it.quantidade_conferida, v_it.quantidade_nfe, v_mov, NULL, false
        );
      END IF;
    END IF;

    IF v_it.atualizar_custo AND v_it.custo_unitario > 0 THEN
      UPDATE public.produtos p
         SET preco_custo = v_it.custo_unitario,
             updated_at  = now()
       WHERE p.id = v_it.produto_id
         AND (
           p.permitir_abaixo_custo
           OR (
             (p.preco_varejo < v_it.custo_unitario) IS NOT TRUE
             AND (p.preco_atacado IS NULL OR p.preco_atacado >= v_it.custo_unitario)
           )
         );
    END IF;
  END LOOP;

  IF v_remessa IS NULL AND v_imp.ordem_compra_id IS NOT NULL THEN
    PERFORM public._oc_atualizar_estado(v_imp.ordem_compra_id);
  END IF;

  FOR v_dup IN
    SELECT numero_duplicata, data_vencimento, valor
      FROM public.importacoes_nfe_duplicatas
     WHERE importacao_nfe_id = p_importacao_id
  LOOP
    INSERT INTO public.contas_pagar (
      nfe_importacao_id, fornecedor_id, loja_id, nfe_numero, vencimento, valor_total, status
    ) VALUES (
      p_importacao_id, v_imp.fornecedor_id, v_imp.loja_id, v_imp.numero_nf,
      v_dup.data_vencimento, v_dup.valor, 'PENDENTE'
    );
  END LOOP;

  UPDATE public.importacoes_nfe
     SET status = 'CONCLUIDA'
   WHERE id = p_importacao_id;
END;
$$;

COMMENT ON FUNCTION public.confirmar_importacao_nfe(uuid) IS
  'SSOT-003: confirma NF-e. Estoque se sem remessa; AP por duplicata com nfe_importacao_id. '
  'Valor econômico > 0 sem duplicatas → IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA. '
  'OC/remessa permanecem sem obrigação até este reconhecimento.';

REVOKE ALL ON FUNCTION public.confirmar_importacao_nfe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_importacao_nfe(uuid) TO authenticated, service_role;

DO $prova$
BEGIN
  IF position('IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA' IN
       pg_get_functiondef('public.confirmar_importacao_nfe(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SSOT-003 PROVA FAIL: guard ausente';
  END IF;
  RAISE NOTICE 'SSOT-003 PROVA ESTRUTURAL OK';
END
$prova$;

NOTIFY pgrst, 'reload schema';
COMMIT;
