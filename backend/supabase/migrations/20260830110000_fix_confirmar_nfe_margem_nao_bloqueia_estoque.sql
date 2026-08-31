-- ============================================================================
-- confirmar_importacao_nfe — não abortar crédito de estoque por margem.
--
-- Gatilho concreto (PR #341 tornou a RPC alcançável de novo): GERENTE importa
-- NF-e vinculada a produto com atacado entre o custo antigo e o da nota
-- (ex.: varejo 100, atacado 60, custo 50, v_un_com 80). `atualizar_custo`
-- vem true por padrão na UI e fica gravado em importacoes_nfe_itens — a
-- tela de conferência não oferece desligar. Clica confirmar →
-- trg_fn_produtos_margem (125/126) levanta PRODUTO_ATACADO_ABAIXO_CUSTO (ou
-- PRODUTO_VAREJO_ABAIXO_CUSTO). A transação inteira desfaz: estoque não
-- credita, contas_pagar não nasce, a chave_acesso já foi consumida
-- (IMPORT_NFE_DUPLICADA se tentar reimportar). Operador fica preso.
--
-- Correção mínima: o UPDATE de preco_custo só ocorre quando NÃO dispararia
-- o trigger (espelha 125: override permitir_abaixo_custo, ou varejo/atacado
-- cabem o novo custo). Estoque, kardex e contas_pagar seguem. Custo que
-- estouraria margem fica para o catálogo. Não enfraquece o guard do
-- formulário de produto.
--
-- CREATE OR REPLACE do corpo da 20260828150100, só o predicado do UPDATE
-- de custo muda. FOR UPDATE / conferência pendente / grants intactos.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.confirmar_importacao_nfe(p_importacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_imp          record;
  v_it           record;
  v_dup          record;
  v_pendentes    int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'IMPORT_NFE_PERFIL';
  END IF;

  SELECT id, loja_id, fornecedor_id, numero_nf, status INTO v_imp
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

  FOR v_it IN
    SELECT produto_id, quantidade_conferida, custo_unitario, atualizar_custo, status_conferencia
      FROM public.importacoes_nfe_itens
     WHERE importacao_nfe_id = p_importacao_id
  LOOP
    IF v_it.quantidade_conferida IS NOT NULL AND v_it.quantidade_conferida > 0 THEN
      INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
      VALUES (v_it.produto_id, v_imp.loja_id, v_it.quantidade_conferida, 0, 1)
      ON CONFLICT (loja_id, produto_id) DO UPDATE
        SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
            version          = public.estoque.version + 1,
            updated_at       = now();

      INSERT INTO public.movimentos_estoque_log (
        loja_id, produto_id, tipo_codigo, quantidade_delta, usuario_id, observacao
      ) VALUES (
        v_imp.loja_id,
        v_it.produto_id,
        'ENTRADA_NFE',
        v_it.quantidade_conferida,
        v_uid,
        format('Importação NF-e %s (conferido%s)', p_importacao_id::text,
               CASE WHEN v_it.status_conferencia = 'DIVERGENTE' THEN ', divergente da nota' ELSE '' END)
      );
    END IF;

    IF v_it.atualizar_custo AND v_it.custo_unitario > 0 THEN
      -- Predicado alinhado a trg_fn_produtos_margem (125): IS NOT TRUE trata
      -- preco_varejo NULL como o trigger (IF NULL não levanta). Sem isto o
      -- UPDATE aborta a transação e o estoque conferido nunca entra.
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

  FOR v_dup IN
    SELECT numero_duplicata, data_vencimento, valor
      FROM public.importacoes_nfe_duplicatas
     WHERE importacao_nfe_id = p_importacao_id
  LOOP
    INSERT INTO public.contas_pagar (
      nfe_importacao_id, fornecedor_id, loja_id, nfe_numero, vencimento, valor_total, status
    ) VALUES (
      p_importacao_id, v_imp.fornecedor_id, v_imp.loja_id, v_dup.numero_duplicata,
      v_dup.data_vencimento, v_dup.valor, 'PENDENTE'
    );
  END LOOP;

  UPDATE public.importacoes_nfe
     SET status = 'CONCLUIDA'
   WHERE id = p_importacao_id;
END;
$$;

COMMENT ON FUNCTION public.confirmar_importacao_nfe(uuid) IS
  'FLX-05. Credita estoque/contas_pagar pela quantidade conferida. FOR UPDATE anti-corrida. UPDATE de preco_custo é pulado quando dispararia trg_fn_produtos_margem (20260830110000) — estoque não fica refém do preço de catálogo.';

REVOKE ALL ON FUNCTION public.confirmar_importacao_nfe(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirmar_importacao_nfe(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirmar_importacao_nfe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_importacao_nfe(uuid) TO service_role;

DO $verify$
DECLARE
  v_def text;
BEGIN
  IF to_regprocedure('public.confirmar_importacao_nfe(uuid)') IS NULL THEN
    RAISE EXCEPTION 'CONFIRMAR_NFE_MARGEM_RPC_AUSENTE';
  END IF;

  v_def := pg_get_functiondef('public.confirmar_importacao_nfe(uuid)'::regprocedure);

  IF position('FOR UPDATE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'CONFIRMAR_NFE_MARGEM_LOCK_AUSENTE';
  END IF;
  IF position('IMPORT_NFE_CONFERENCIA_PENDENTE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'CONFIRMAR_NFE_MARGEM_GATE_CONFERENCIA_AUSENTE';
  END IF;
  IF position('permitir_abaixo_custo' IN v_def) = 0 THEN
    RAISE EXCEPTION 'CONFIRMAR_NFE_MARGEM_PREDICADE_AUSENTE';
  END IF;
  IF has_function_privilege('anon', 'public.confirmar_importacao_nfe(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFIRMAR_NFE_MARGEM_GRANT_ANON_INDEVIDO';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.confirmar_importacao_nfe(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFIRMAR_NFE_MARGEM_GRANT_AUTHENTICATED_AUSENTE';
  END IF;
END
$verify$;

COMMIT;
