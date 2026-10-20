-- Regressão da migration 20260930090000_c1_authz_secdef_fecha_classe.sql (auditoria JINLONG 2026-09-30).
--
-- Dois níveis:
--   1) as funções só-de-backend não são executáveis por anon/authenticated;
--   2) GUARDA DE CLASSE: toda função SECURITY DEFINER executável por `authenticated` precisa referenciar a
--      identidade (auth.uid/jwt/role, current_setting, auth_usuario_*) OU estar na allowlist abaixo.
--      Função nova nessa situação reprova o teste — obriga decisão consciente (revogar, amarrar à identidade,
--      ou justificar e incluir na allowlist).
--
-- Roda em transação com ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

DO $c1_check$
DECLARE
  v_fn text;
  v_fail text[] := ARRAY[]::text[];
  v_rec record;
  -- Allowlist: SECURITY DEFINER read-only/sem dado sensível, revisadas em 2026-09-30.
  -- Itens marcados (REVISAR) não checam identidade e devem ser reavaliados na próxima passada.
  v_allow text[] := ARRAY[
    'auth_pode_ver_produto_gerencial',
    'caixa_integridade_gate_check',
    'calcular_preco_produto',
    'configuracoes_para_caixa_web',
    'is_feature_enabled',
    'marcar_comissoes_pagas',          -- delega a liquidar_comissoes (checa perfil e loja)
    'obter_limite_sangria_sem_gerente',
    'obter_pricing_version_ativa',
    'pdv_config_flags_visuais',
    'pdv_config_para_caixa_web'
  ];
BEGIN
  -- 1) Só backend
  FOREACH v_fn IN ARRAY ARRAY[
    'public.registrar_venda_evento(text,uuid,text,uuid,uuid,uuid,jsonb,numeric,numeric,text,boolean)',
    'public.ensure_venda_evento_registrado(uuid,text)',
    'public.shadow_validar_venda_engine_v4(jsonb)',
    'public.listar_valores_sistema_dinheiro_caixas(uuid[])',
    'public.proximo_numero_venda_em_espera(uuid)',
    'public.quantidade_devolvida_item_venda(uuid)'
  ]
  LOOP
    IF to_regprocedure(v_fn) IS NULL THEN CONTINUE; END IF;
    IF has_function_privilege('authenticated', to_regprocedure(v_fn), 'EXECUTE')
       OR has_function_privilege('anon', to_regprocedure(v_fn), 'EXECUTE') THEN
      v_fail := array_append(v_fail, v_fn || ': anon/authenticated deveriam ser false');
    END IF;
    IF NOT has_function_privilege('service_role', to_regprocedure(v_fn), 'EXECUTE') THEN
      v_fail := array_append(v_fail, v_fn || ': service_role deveria ser true');
    END IF;
  END LOOP;

  -- 2) Guarda de classe
  FOR v_rec IN
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      -- multiempresa (20261019140000+): envelopes e guardas derivam a identidade
      -- via helpers fp_* (que usam auth.uid()); contam como checagem.
      AND p.prosrc !~* '(auth\.uid|auth\.jwt|auth\.role|current_setting|auth_usuario_|fp_assert_loja|fp_assert_produto|fp_pode_loja|fp_pode_empresa|fp_lojas_permitidas|fp_empresas_arr|fp_empresa_operacional|fp_admin_legado|fp_empresas_do_usuario)'
      -- helpers de lookup puros usados nas expressões de RLS (precisam de EXECUTE
      -- para authenticated; não decidem acesso sozinhos — só mapeiam id → loja/empresa)
      AND NOT (p.proname = ANY (ARRAY['fp_loja_de', 'fp_empresa_da_loja', 'fp_mesma_empresa',
                                      'fp_assert_mesma_empresa', 'fp_pdv_config_id',
                                      'fp_empresa_operacional']))
      AND NOT (p.proname = ANY (v_allow))
    ORDER BY p.proname
  LOOP
    v_fail := array_append(
      v_fail,
      'public.' || v_rec.proname || ': SECURITY DEFINER executável por authenticated sem checagem de identidade'
    );
  END LOOP;

  -- 3) Fail-closed: função nova criada por postgres NÃO nasce executável por anon/authenticated
  CREATE FUNCTION public.zz_c1_probe() RETURNS int LANGUAGE sql AS 'SELECT 1';
  IF has_function_privilege('anon', 'public.zz_c1_probe()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.zz_c1_probe()', 'EXECUTE') THEN
    v_fail := array_append(v_fail, 'ACL padrão: função nova nasce executável por anon/authenticated');
  END IF;
  DROP FUNCTION public.zz_c1_probe();

  IF array_length(v_fail, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'c1-secdef-sem-identidade FALHOU:\n  - %', array_to_string(v_fail, E'\n  - ');
  END IF;

  RAISE NOTICE 'c1-secdef-sem-identidade OK';
END
$c1_check$;

ROLLBACK;
