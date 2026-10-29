-- Provisionamento ponta a ponta (lado banco) — wizard /admin/provisionamento e trial /teste-gratis.
--
-- Reproduz, na ordem e com os papéis do app, o que as server actions gravam:
--   wizard: ensureAuthUser (auth.users) → plataforma_provisionar_empresa (service_role) → ensurePdvConfig
--           (payload SEM gerente_senha_sha256, #625) → formas_pagamento (upsert loja_id,codigo) →
--           implantacao_checklists/itens → validarProvisionamento;
--   trial:  trial_registrar_tentativa (limite por IP) → signUp (auth.users) → plataforma_iniciar_trial →
--           bootstrapLojaTrial (pdv_config + formas_pagamento).
-- E prova: permissões (RPCs só para service_role), login (usuário/vínculo ativos) e isolamento entre empresas
-- (DONO, GERENTE e OPERADOR só enxergam a própria empresa; a empresa legada e a do trial ficam invisíveis).
--
-- O que NÃO cobre: Supabase Auth de verdade (createUser/signUp, e-mail de verificação, sessão) e a interface —
-- isso fica para o e2e (smoke-fase1-provisionamento-homologacao) e o teste controlado em produção.
-- Transação com ROLLBACK: não grava nada.

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE prov_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;
GRANT ALL ON prov_ctx TO service_role, authenticated;
CREATE TEMP TABLE prov_visiveis (id uuid) ON COMMIT DROP;
GRANT ALL ON prov_visiveis TO authenticated;

-- ── Wizard ───────────────────────────────────────────────────────────────────────────────────────
DO $wizard$
DECLARE
  v_dono uuid := 'a1000000-0000-4000-8000-0000000000d1';
  v_ger  uuid := 'a1000000-0000-4000-8000-0000000000e1';
  v_op   uuid := 'a1000000-0000-4000-8000-0000000000f1';
  v_r jsonb; v_loja uuid; v_emp uuid; v_id int; v_n int;
  c_itens constant text[] := ARRAY['ambiente.url','ambiente.vars','ambiente.service_role','ambiente.storage','ambiente.backup',
    'loja.criada','loja.config','loja.pdv','loja.impressora','usuarios.dono','usuarios.gerente','usuarios.operadores',
    'usuarios.login','usuarios.recuperacao_senha','cadastro.categorias','cadastro.produtos','cadastro.clientes',
    'cadastro.fornecedores','operacao.abrir_caixa','operacao.venda','operacao.desconto','operacao.cancelamento',
    'operacao.sangria','operacao.suprimento','operacao.fechar_caixa','financeiro.recebimento','financeiro.contas_pagar',
    'financeiro.dashboard','fiscal.stub','fiscal.nfce','homologacao.dados','homologacao.execucao_1','homologacao.execucao_2',
    'homologacao.fluxo_completo','homologacao.cliente_treinado','homologacao.aceite'];
BEGIN
  -- ensureAuthUser (Auth Admin API cria o usuário em auth.users)
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (v_dono, 'zz-wizard-dono@exemplo.test', 'authenticated', 'authenticated'),
    (v_ger,  'zz-wizard-gerente@exemplo.test', 'authenticated', 'authenticated'),
    (v_op,   'zz-wizard-operador@exemplo.test', 'authenticated', 'authenticated');

  EXECUTE 'SET LOCAL ROLE service_role';
  v_r := public.plataforma_provisionar_empresa(jsonb_build_object(
    'empresa', jsonb_build_object('nome', 'ZZ Homologação Wizard', 'cnpj', NULL),
    'lojas', jsonb_build_array(jsonb_build_object('chave', 'L1', 'nome', 'ZZ Loja Wizard', 'codigo', 'ZZWIZ')),
    'usuarios', jsonb_build_array(
      jsonb_build_object('id', v_dono, 'nome', 'ZZ Dono', 'idioma', 'pt', 'papel', 'DONO'),
      jsonb_build_object('id', v_ger,  'nome', 'ZZ Gerente', 'idioma', 'pt', 'papel', 'GERENTE', 'lojas', jsonb_build_array('L1')),
      jsonb_build_object('id', v_op,   'nome', 'ZZ Operador', 'idioma', 'pt', 'papel', 'OPERADOR', 'lojas', jsonb_build_array('L1'))
    )), NULL);
  v_emp := (v_r->>'empresa_id')::uuid;
  v_loja := (v_r->'lojas'->>'L1')::uuid;

  -- ensurePdvConfig: aponta o gerente padrão da empresa e cria a linha da loja (payload pós-#625)
  UPDATE public.pdv_config SET gerente_id = v_dono::text
   WHERE empresa_id = v_emp AND gerente_id = 'empresa-' || left(v_emp::text, 8);
  IF NOT EXISTS (SELECT 1 FROM public.pdv_config WHERE loja_id = v_loja) THEN
    SELECT coalesce(max(id), 0) + 1 INTO v_id FROM public.pdv_config;
    INSERT INTO public.pdv_config (id, loja_id, gerente_id, cfop_padrao, cst_padrao, regime_tributario,
      auto_enqueue_fiscal, tema_padrao, imprimir_cupom_auto, formato_impressao, idioma_padrao)
    VALUES (v_id, v_loja, v_dono::text, '5102', '00', 'SIMPLES_NACIONAL', false, 'noturno', true, 'TERMICA', 'pt');
  END IF;

  -- ensureFormasPagamento (upsert ignoreDuplicates)
  INSERT INTO public.formas_pagamento (loja_id, codigo, nome)
  SELECT v_loja, c, n FROM (VALUES ('DINHEIRO','Dinheiro'),('PIX','Pix'),('CARTAO_DEBITO','Cartão de Débito'),('CARTAO_CREDITO','Cartão de Crédito')) f(c, n)
  ON CONFLICT (loja_id, codigo) DO NOTHING;

  -- ensureChecklistBootstrap
  INSERT INTO public.implantacao_checklists (loja_id, updated_at) VALUES (v_loja, now())
  ON CONFLICT (loja_id) DO UPDATE SET updated_at = EXCLUDED.updated_at;
  INSERT INTO public.implantacao_checklist_itens (loja_id, item_key, status)
  SELECT v_loja, k, 'PENDENTE' FROM unnest(c_itens) k
  WHERE NOT EXISTS (SELECT 1 FROM public.implantacao_checklist_itens i WHERE i.loja_id = v_loja AND i.item_key = k);
  UPDATE public.implantacao_checklist_itens
     SET status = 'CONCLUIDO', responsavel = 'provisionamento', concluido_em = now(), updated_at = now()
   WHERE loja_id = v_loja AND item_key IN ('loja.criada', 'loja.pdv', 'usuarios.dono');
  EXECUTE 'RESET ROLE';

  -- validarProvisionamento
  IF NOT EXISTS (SELECT 1 FROM public.lojas WHERE id = v_loja AND empresa_id = v_emp) THEN RAISE EXCEPTION 'WIZARD: lojaOk=false'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = v_dono AND perfil = 'DONO' AND loja_id = v_loja AND ativo IS NOT FALSE) THEN
    RAISE EXCEPTION 'WIZARD: donoOk=false';
  END IF;
  SELECT count(*) INTO v_n FROM public.formas_pagamento WHERE loja_id = v_loja AND ativo;
  IF NOT EXISTS (SELECT 1 FROM public.pdv_config WHERE loja_id = v_loja) OR v_n < 4 THEN RAISE EXCEPTION 'WIZARD: configOk=false (formas=%)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.implantacao_checklist_itens WHERE loja_id = v_loja;
  IF v_n < array_length(c_itens, 1) THEN RAISE EXCEPTION 'WIZARD: checklistOk=false (%)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.implantacao_checklist_itens WHERE loja_id = v_loja AND status = 'CONCLUIDO';
  IF v_n <> 3 THEN RAISE EXCEPTION 'WIZARD: itens marcados = % (esperado 3)', v_n; END IF;

  -- "login": usuário ativo, perfil e vínculo na empresa nova
  SELECT count(*) INTO v_n FROM public.usuario_vinculos WHERE empresa_id = v_emp AND ativo
     AND ((usuario_id = v_dono AND papel = 'DONO') OR (usuario_id = v_ger AND papel = 'GERENTE' AND loja_id = v_loja)
          OR (usuario_id = v_op AND papel = 'OPERADOR' AND loja_id = v_loja));
  IF v_n <> 3 THEN RAISE EXCEPTION 'WIZARD: vínculos ativos = % (esperado 3)', v_n; END IF;

  INSERT INTO prov_ctx VALUES ('wiz_emp', v_emp::text), ('wiz_loja', v_loja::text);
  RAISE NOTICE 'WIZARD OK: empresa %, loja %, pdv_config + 4 formas + 36 itens (3 concluídos), 3 vínculos ativos', v_emp, v_loja;
END
$wizard$;

-- ── Trial (/teste-gratis) ────────────────────────────────────────────────────────────────────────
DO $trial$
DECLARE
  v_dono uuid := 'a2000000-0000-4000-8000-0000000000d2';
  v_r jsonb; v_loja uuid; v_emp uuid; v_id int; v_n int; v_ok boolean; i int;
  v_resultados text := '';
BEGIN
  EXECUTE 'SET LOCAL ROLE service_role';
  FOR i IN 1..4 LOOP  -- saas.parametros.trial_max_por_ip_24h = 3
    v_ok := public.trial_registrar_tentativa('zz-ip-hash-homolog', 'zz-email-hash-' || i);
    v_resultados := v_resultados || v_ok::text || ' ';
  END LOOP;
  EXECUTE 'RESET ROLE';
  IF v_resultados <> 'true true true false ' THEN RAISE EXCEPTION 'TRIAL: limite por IP inesperado: %', v_resultados; END IF;

  -- signUp (auth.users)
  INSERT INTO auth.users (id, email, aud, role) VALUES (v_dono, 'zz-trial-dono@exemplo.test', 'authenticated', 'authenticated');

  EXECUTE 'SET LOCAL ROLE service_role';
  v_r := public.plataforma_iniciar_trial(jsonb_build_object(
    'plano', 'ATACADO', 'demo', true,
    'empresa', jsonb_build_object('nome', 'ZZ Homologação Trial'),
    'lojas', jsonb_build_array(jsonb_build_object('chave', 'loja1', 'nome', 'ZZ Loja Trial', 'codigo', NULL)),
    'usuarios', jsonb_build_array(jsonb_build_object('id', v_dono, 'nome', 'ZZ Dono Trial', 'papel', 'DONO', 'idioma', 'pt'))
  ), NULL);
  v_loja := (v_r->>'loja_id')::uuid;
  SELECT empresa_id INTO v_emp FROM public.lojas WHERE id = v_loja;

  -- bootstrapLojaTrial (payload pós-#625)
  IF NOT EXISTS (SELECT 1 FROM public.pdv_config WHERE loja_id = v_loja) THEN
    SELECT coalesce(max(id), 0) + 1 INTO v_id FROM public.pdv_config;
    INSERT INTO public.pdv_config (id, loja_id, gerente_id, cfop_padrao, cst_padrao, regime_tributario,
      auto_enqueue_fiscal, tema_padrao, imprimir_cupom_auto, formato_impressao, idioma_padrao)
    VALUES (v_id, v_loja, v_dono::text, '5102', '00', 'SIMPLES_NACIONAL', false, 'noturno', true, 'TERMICA', 'pt');
  END IF;
  INSERT INTO public.formas_pagamento (loja_id, codigo, nome)
  SELECT v_loja, c, n FROM (VALUES ('DINHEIRO','Dinheiro'),('PIX','Pix'),('CARTAO_DEBITO','Cartão de Débito'),('CARTAO_CREDITO','Cartão de Crédito')) f(c, n)
  ON CONFLICT (loja_id, codigo) DO NOTHING;
  EXECUTE 'RESET ROLE';

  IF v_loja IS NULL OR v_emp IS NULL THEN RAISE EXCEPTION 'TRIAL: sem loja/empresa: %', v_r; END IF;
  IF (v_r->>'trial_fim')::timestamptz < now() + interval '14 days' OR (v_r->>'trial_fim')::timestamptz > now() + interval '16 days' THEN
    RAISE EXCEPTION 'TRIAL: trial_fim fora dos 15 dias: %', v_r->>'trial_fim';
  END IF;
  SELECT count(*) INTO v_n FROM public.formas_pagamento WHERE loja_id = v_loja AND ativo;
  IF NOT EXISTS (SELECT 1 FROM public.pdv_config WHERE loja_id = v_loja) OR v_n < 4 THEN RAISE EXCEPTION 'TRIAL: bootstrap incompleto (formas=%)', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = v_dono AND empresa_id = v_emp AND papel = 'DONO' AND ativo) THEN
    RAISE EXCEPTION 'TRIAL: DONO sem vínculo ativo';
  END IF;

  INSERT INTO prov_ctx VALUES ('trial_emp', v_emp::text), ('trial_loja', v_loja::text);
  RAISE NOTICE 'TRIAL OK: limite IP (3/24h) respeitado; empresa %, loja %, trial_fim %, pdv_config + 4 formas, vínculo DONO', v_emp, v_loja, v_r->>'trial_fim';
END
$trial$;

-- ── Permissões e isolamento ──────────────────────────────────────────────────────────────────────
DO $perm$
DECLARE
  u record; v_alheias int; v_proprias int; v_negado boolean;
  v_wiz_emp uuid := (SELECT v::uuid FROM prov_ctx WHERE k = 'wiz_emp');
  v_trial_emp uuid := (SELECT v::uuid FROM prov_ctx WHERE k = 'trial_emp');
BEGIN
  -- RPCs de plataforma: nada para anon/authenticated
  IF has_function_privilege('authenticated', 'public.plataforma_provisionar_empresa(jsonb,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.plataforma_iniciar_trial(jsonb,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.trial_registrar_tentativa(text,text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.plataforma_iniciar_trial(jsonb,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PERM: RPC de plataforma executável por anon/authenticated';
  END IF;

  FOR u IN SELECT * FROM (VALUES
      ('a1000000-0000-4000-8000-0000000000d1'::uuid, 'DONO wizard', v_wiz_emp),
      ('a1000000-0000-4000-8000-0000000000e1'::uuid, 'GERENTE wizard', v_wiz_emp),
      ('a1000000-0000-4000-8000-0000000000f1'::uuid, 'OPERADOR wizard', v_wiz_emp),
      ('a2000000-0000-4000-8000-0000000000d2'::uuid, 'DONO trial', v_trial_emp)) x(id, quem, emp)
  LOOP
    PERFORM set_config('request.jwt.claim.sub', u.id::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);  -- PostgREST define as duas formas
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) FILTER (WHERE l.empresa_id IS DISTINCT FROM u.emp), count(*) FILTER (WHERE l.empresa_id = u.emp)
      INTO v_alheias, v_proprias FROM public.lojas l;
    EXECUTE 'RESET ROLE';
    IF v_alheias > 0 THEN RAISE EXCEPTION 'ISOLAMENTO: % enxerga % loja(s) de outra empresa', u.quem, v_alheias; END IF;
    IF v_proprias < 1 THEN RAISE EXCEPTION 'LOGIN: % não enxerga a própria loja', u.quem; END IF;

    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_alheias FROM public.formas_pagamento f JOIN public.lojas l ON l.id = f.loja_id WHERE l.empresa_id IS DISTINCT FROM u.emp;
    EXECUTE 'RESET ROLE';
    IF v_alheias > 0 THEN RAISE EXCEPTION 'ISOLAMENTO: % enxerga formas_pagamento de outra empresa', u.quem; END IF;

    -- Coleta o que o usuário enxerga COMO ELE e julga como superusuário (comparar já como authenticated
    -- passaria pela RLS de usuario_vinculos e daria falso positivo).
    DELETE FROM prov_visiveis;
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO prov_visiveis SELECT us.id FROM public.usuarios us;
    EXECUTE 'RESET ROLE';
    SELECT count(*) INTO v_alheias FROM prov_visiveis pv
      WHERE NOT EXISTS (SELECT 1 FROM public.usuario_vinculos v WHERE v.usuario_id = pv.id AND v.empresa_id = u.emp);
    IF v_alheias > 0 THEN RAISE EXCEPTION 'ISOLAMENTO: % enxerga % usuário(s) de outra empresa', u.quem, v_alheias; END IF;

    BEGIN
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM public.plataforma_provisionar_empresa('{}'::jsonb, NULL);
      v_negado := false;
    EXCEPTION WHEN insufficient_privilege THEN v_negado := true;
    END;
    EXECUTE 'RESET ROLE';
    IF NOT v_negado THEN RAISE EXCEPTION 'PERM: % executou plataforma_provisionar_empresa', u.quem; END IF;
  END LOOP;
  RAISE NOTICE 'PERMISSÕES OK: RPCs só service_role; DONO/GERENTE/OPERADOR do wizard e DONO do trial veem só a própria empresa';
END
$perm$;

SELECT 'PROVISIONAMENTO WIZARD + TRIAL: OK' AS resultado;
ROLLBACK;
