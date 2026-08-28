-- ============================================================================
-- Restaura registrar_conferencia_nfe — Jīn Lóng, plano de remediação PR1.
--
-- Contexto (evidência completa em docs/AUDITORIA_CODIGO_MORTO_2026-08.md §A.2
-- e no Mapa Operacional de Usabilidade, achado "Importar NF-e não credita
-- estoque"):
--
--   1. 20260805213357_296_nfe_conferencia.sql (FLX-05) criou
--      `registrar_conferencia_nfe(uuid, jsonb)` como pré-requisito de
--      `confirmar_importacao_nfe(uuid)` — sem ela, nenhum item pode sair de
--      `status_conferencia = 'EM_CONFERENCIA'`, e `confirmar_importacao_nfe`
--      recusa a operação inteira (`IMPORT_NFE_CONFERENCIA_PENDENTE`).
--   2. 20260819230000_remove_funcoes_sem_consumidor.sql removeu a função 14
--      dias depois, corretamente, pelo critério vigente na época: nenhuma
--      chamada `.rpc()` no frontend a usava. A UI de Importar NF-e nunca foi
--      atualizada para o modelo FLX-05 — continuou chamando só
--      `importar_nfe_transacao` e tratando o retorno como conclusão.
--   3. Resultado em produção, confirmado por leitura direta antes desta
--      migration: `registrar_conferencia_nfe` NÃO existe em `pg_proc`;
--      `confirmar_importacao_nfe` existe mas é hoje inalcançável (todo item
--      fica preso em EM_CONFERENCIA para sempre) — nenhuma NF-e importada
--      depois de 2026-08-05 credita estoque ou custo.
--
-- Esta migration recria `registrar_conferencia_nfe` com o MESMO corpo,
-- assinatura e grants da 296 (nenhuma regra nova) — ela deixou de ter
-- consumidor por uma lacuna de sequenciamento entre backend e frontend, não
-- por estar errada. O consumidor agora existe:
-- app/gerente/estoque/importar-nfe/actions.ts → registrarConferenciaNfe →
-- InventoryMovementWriter.registrarConferenciaNfe →
-- RPC registrar_conferencia_nfe, alimentando a nova etapa de conferência da
-- tela /admin/estoque/importar-nfe antes de confirmar_importacao_nfe.
--
-- Idempotente: usa CREATE OR REPLACE (a função pode já não existir, ou já
-- ter sido recriada por uma tentativa anterior desta mesma migration).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_conferencia_nfe(p_importacao_id uuid, p_itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_imp          record;
  el             jsonb;
  v_item_id      uuid;
  v_qtd_conf     numeric;
  v_qtd_nfe      numeric;
  v_div_obs      text;
  v_status       text;
  v_conferidos   int := 0;
  v_divergentes  int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'IMPORT_NFE_PERFIL';
  END IF;

  SELECT id, loja_id, status INTO v_imp
    FROM public.importacoes_nfe
   WHERE id = p_importacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IMPORT_NFE_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_imp.loja_id THEN
    RAISE EXCEPTION 'IMPORT_NFE_LOJA';
  END IF;

  IF v_imp.status <> 'EM_CONFERENCIA' THEN
    RAISE EXCEPTION 'IMPORT_NFE_STATUS_INVALIDO';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'IMPORT_NFE_ITENS_VAZIO';
  END IF;

  FOR el IN SELECT value FROM jsonb_array_elements(p_itens) AS t(value)
  LOOP
    v_item_id  := (el->>'item_id')::uuid;
    v_qtd_conf := (el->>'quantidade_conferida')::numeric;
    v_div_obs  := NULLIF(trim(COALESCE(el->>'divergencia_obs', '')), '');

    IF v_qtd_conf IS NULL OR v_qtd_conf < 0 THEN
      RAISE EXCEPTION 'IMPORT_NFE_CONFERENCIA_QTD_INVALIDA';
    END IF;

    SELECT quantidade_nfe INTO v_qtd_nfe
      FROM public.importacoes_nfe_itens
     WHERE id = v_item_id AND importacao_nfe_id = p_importacao_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'IMPORT_NFE_ITEM_NAO_ENCONTRADO';
    END IF;

    v_status := CASE WHEN v_qtd_conf = v_qtd_nfe THEN 'CONFERIDO' ELSE 'DIVERGENTE' END;
    IF v_status = 'CONFERIDO' THEN v_conferidos := v_conferidos + 1;
    ELSE v_divergentes := v_divergentes + 1; END IF;

    UPDATE public.importacoes_nfe_itens
       SET quantidade_conferida = v_qtd_conf,
           divergencia_obs      = v_div_obs,
           status_conferencia   = v_status,
           conferido_por        = v_uid,
           conferido_em         = now()
     WHERE id = v_item_id AND importacao_nfe_id = p_importacao_id;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'importacao_id', p_importacao_id,
    'itens_conferidos', v_conferidos, 'itens_divergentes', v_divergentes
  );
END;
$$;

COMMENT ON FUNCTION public.registrar_conferencia_nfe(uuid, jsonb) IS
  'FLX-05 (2026-08-05, restaurada 2026-08-28 com consumidor em app/gerente/estoque/importar-nfe/actions.ts). Registra contagem física por item de importação de NF-e, com auditoria. Não move estoque nem gera contas_pagar — pré-requisito de confirmar_importacao_nfe.';

REVOKE ALL ON FUNCTION public.registrar_conferencia_nfe(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_conferencia_nfe(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrar_conferencia_nfe(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_conferencia_nfe(uuid, jsonb) TO service_role;

-- ============================================================================
-- VERIFICAÇÃO DE EFEITO — dentro da transação.
-- ============================================================================

DO $verify$
BEGIN
  IF to_regprocedure('public.registrar_conferencia_nfe(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'RESTAURA_296_RPC_AUSENTE';
  END IF;

  IF has_function_privilege('anon', 'public.registrar_conferencia_nfe(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RESTAURA_296_GRANT_ANON_INDEVIDO';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.registrar_conferencia_nfe(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RESTAURA_296_GRANT_AUTHENTICATED_AUSENTE';
  END IF;

  -- confirmar_importacao_nfe precisa continuar existindo e com o mesmo gate —
  -- esta migration não deve ser aplicada isoladamente sem ela em produção.
  IF to_regprocedure('public.confirmar_importacao_nfe(uuid)') IS NULL THEN
    RAISE EXCEPTION 'RESTAURA_296_CONFIRMAR_AUSENTE_PRE_REQUISITO_FALTANDO';
  END IF;

  RAISE NOTICE 'restaura_registrar_conferencia_nfe OK — RPC recriada, grants corretos, confirmar_importacao_nfe presente.';
END
$verify$;

COMMIT;
