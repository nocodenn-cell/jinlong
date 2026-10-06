BEGIN;
CREATE TABLE public.entrada_documentos (
  importacao_id uuid PRIMARY KEY REFERENCES public.importacoes_nfe(id),
  remessa_id uuid NOT NULL UNIQUE REFERENCES public.remessas(id),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  criado_por uuid NOT NULL REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.entrada_documentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.entrada_documentos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.entrada_documentos TO authenticated;
CREATE POLICY entrada_documentos_leitura ON public.entrada_documentos FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id=(SELECT auth.uid()) AND u.loja_id=entrada_documentos.loja_id));

CREATE FUNCTION public._validar_documento_entrega(p_importacao uuid, p_remessa uuid, p_loja uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_remessa record;
BEGIN
  SELECT * INTO v_remessa FROM public.remessas WHERE id=p_remessa FOR UPDATE;
  IF NOT FOUND OR v_remessa.loja_id IS DISTINCT FROM p_loja OR v_remessa.status <> 'CONCLUIDA' THEN
    RAISE EXCEPTION 'ENTRADA_ORIGEM_INVALIDA';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.remessa_itens WHERE remessa_id=p_remessa AND quantidade_conferida>0) THEN
    RAISE EXCEPTION 'ENTRADA_ORIGEM_VAZIA';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT produto_id, sum(quantidade_conferida) AS qtd FROM public.remessa_itens
      WHERE remessa_id=p_remessa GROUP BY produto_id
    ) r FULL OUTER JOIN (
      SELECT produto_id, sum(quantidade_conferida) AS qtd FROM public.importacoes_nfe_itens
      WHERE importacao_nfe_id=p_importacao GROUP BY produto_id
    ) n USING(produto_id)
    WHERE r.qtd IS DISTINCT FROM n.qtd OR n.qtd IS NULL
  ) THEN RAISE EXCEPTION 'ENTRADA_ITENS_DIVERGENTES'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._validar_documento_entrega(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.associar_documento_entrada(p_importacao uuid, p_remessa uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_imp record; v_usuario record;
BEGIN
  SELECT * INTO v_usuario FROM public.usuarios WHERE id=auth.uid();
  IF NOT FOUND OR v_usuario.perfil NOT IN ('GERENTE','DONO','ADMIN') OR NOT v_usuario.ativo THEN
    RAISE EXCEPTION 'ENTRADA_AUTH';
  END IF;
  SELECT * INTO v_imp FROM public.importacoes_nfe WHERE id=p_importacao FOR UPDATE;
  IF NOT FOUND OR v_imp.loja_id IS DISTINCT FROM v_usuario.loja_id OR v_imp.status <> 'EM_CONFERENCIA' THEN
    RAISE EXCEPTION 'ENTRADA_IMPORTACAO_INVALIDA';
  END IF;
  IF EXISTS(SELECT 1 FROM public.importacoes_nfe_itens WHERE importacao_nfe_id=p_importacao
    AND (quantidade_conferida IS NULL OR status_conferencia='EM_CONFERENCIA')) THEN
    RAISE EXCEPTION 'ENTRADA_CONFERENCIA_PENDENTE';
  END IF;
  PERFORM public._validar_documento_entrega(p_importacao,p_remessa,v_imp.loja_id);
  INSERT INTO public.entrada_documentos(importacao_id,remessa_id,loja_id,criado_por)
  VALUES(p_importacao,p_remessa,v_imp.loja_id,v_usuario.id)
  ON CONFLICT(importacao_id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.entrada_documentos WHERE importacao_id=p_importacao AND remessa_id=p_remessa) THEN
    RAISE EXCEPTION 'ENTRADA_JA_ASSOCIADA';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.associar_documento_entrada(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.associar_documento_entrada(uuid,uuid) TO authenticated;
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

  -- Pedido vinculado: trava antes de creditar (mesma ordem de lock das outras vias).
  IF v_remessa IS NULL AND v_imp.ordem_compra_id IS NOT NULL THEN
    SELECT oc.id, oc.loja_id, oc.status INTO v_oc
      FROM public.ordens_compra oc WHERE oc.id = v_imp.ordem_compra_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'OC_NAO_ENCONTRADA'; END IF;
    IF v_oc.loja_id IS DISTINCT FROM v_imp.loja_id THEN RAISE EXCEPTION 'OC_LOJA'; END IF;
    IF v_oc.status NOT IN ('CONFIRMADA', 'EM_TRANSITO') THEN RAISE EXCEPTION 'OC_STATUS_INVALIDO'; END IF;
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

REVOKE ALL ON FUNCTION public.confirmar_importacao_nfe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_importacao_nfe(uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
