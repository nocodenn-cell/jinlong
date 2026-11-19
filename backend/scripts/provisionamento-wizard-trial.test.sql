-- Provisionamento ponta a ponta (lado banco) — contrato de segurança 20261028121000.
--
-- CONTRATO ATUAL (não é o de antes da 121000):
--   * a porta public.plataforma_provisionar_empresa é FAIL-CLOSED: sem o interruptor
--     saas.parametros.provisionamento_automatico = 'habilitado' e sem contingência, recusa com
--     PROVISIONAMENTO_AUTOMATICO_BLOQUEADO;
--   * a única via de cadastro hoje é a CONTINGÊNCIA manual (docs/PROVISIONAMENTO_CONTINGENCIA.md):
--     sessão SQL direta com fp.provisionamento_contingencia (chamado) e fp.provisionamento_responsavel
--     (sem responsável ⇒ PROVISIONAMENTO_CONTINGENCIA_SEM_RESPONSAVEL), gravando trilha em
--     internal.provisionamento_contingencia_log;
--   * o teste grátis (plataforma_iniciar_trial) chama a mesma porta: também bloqueado.
--
-- O QUE ESTE TESTE PROVA (sem marcar erro esperado como PASS):
--   A. bloqueio automático: sem contingência, a porta recusa (PASS do bloqueio, verificado pelo código do erro);
--   B. sem responsável, a contingência recusa e não grava nada;
--   C. contingência autorizada (chamado + responsável) cadastra empresa, loja, DONO, GERENTE e OPERADOR e
--      grava a trilha; depois, wizard completo (pdv_config, formas, checklist), login/vínculos e isolamento;
--   D. trial automático bloqueado pelo mesmo interruptor; limite por IP continua valendo;
--   E. RPCs de plataforma só para service_role; anon/authenticated não cadastram.
--
-- O que NÃO cobre: Supabase Auth real (createUser/signUp, e-mail), sessão e a interface. Transação com ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE prov_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;
GRANT ALL ON prov_ctx TO service_role, authenticated;
CREATE TEMP TABLE prov_visiveis (id uuid) ON COMMIT DROP;
GRANT ALL ON prov_visiveis TO authenticated;

-- ── A. Bloqueio automático (contrato novo) ──────────────────────────────────────────
DO $bloqueio$
DECLARE v_msg text := '';
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    PERFORM public.plataforma_provisionar_empresa(jsonb_build_object(
      'empresa', jsonb_build_object('nome', 'ZZ Nao Deve Existir'),
      'lojas', jsonb_build_array(jsonb_build_object('chave', 'L1', 'nome', 'ZZ Loja')),
      'usuarios', '[]'::jsonb), NULL);
    RAISE EXCEPTION 'CONTRATO: provisionamento automático NÃO foi bloqueado';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  IF v_msg NOT LIKE 'PROVISIONAMENTO_AUTOMATICO_BLOQUEADO%' THEN
    RAISE EXCEPTION 'CONTRATO: erro inesperado no bloqueio automático: %', v_msg;
  END IF;
  IF EXISTS (SELECT 1 FROM public.empresas WHERE nome = 'ZZ Nao Deve Existir') THEN
    RAISE EXCEPTION 'CONTRATO: empresa criada apesar do bloqueio';
  END IF;
  RAISE NOTICE 'A OK: automático bloqueado (PROVISIONAMENTO_AUTOMATICO_BLOQUEADO), nada gravado';
END
$bloqueio$;

-- ── B. Contingência sem responsável (recusa e não grava) ────────────────────────────
DO $sem_resp$
DECLARE v_msg text := ''; v_antes int; v_depois int;
BEGIN
  SELECT count(*) INTO v_antes FROM internal.provisionamento_contingencia_log;
  PERFORM set_config('fp.provisionamento_contingencia', 'CHAMADO-TESTE-SEM-RESP', true);
  PERFORM set_config('fp.provisionamento_responsavel', '', true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    PERFORM public.plataforma_provisionar_empresa(jsonb_build_object(
      'empresa', jsonb_build_object('nome', 'ZZ Sem Responsavel'),
      'lojas', jsonb_build_array(jsonb_build_object('chave', 'L1', 'nome', 'ZZ Loja')),
      'usuarios', '[]'::jsonb), NULL);
    RAISE EXCEPTION 'CONTRATO: contingência sem responsável foi aceita';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  IF v_msg NOT LIKE 'PROVISIONAMENTO_CONTINGENCIA_SEM_RESPONSAVEL%' THEN
    RAISE EXCEPTION 'CONTRATO: erro inesperado sem responsável: %', v_msg;
  END IF;
  SELECT count(*) INTO v_depois FROM internal.provisionamento_contingencia_log;
  IF v_depois <> v_antes THEN RAISE EXCEPTION 'CONTRATO: trilha gravada em execução recusada'; END IF;
  RAISE NOTICE 'B OK: contingência sem responsável recusada, trilha inalterada';
END
$sem_resp$;

-- ── C. Wizard por contingência autorizada (administrador/responsável técnico) ──────────
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

  -- Autorização explícita: chamado + responsável (transação-local)
  PERFORM set_config('fp.provisionamento_contingencia', 'CHAMADO-TESTE-HOMOLOG-001', true);
  PERFORM set_config('fp.provisionamento_responsavel', 'Teste Automatizado <teste@exemplo.test>', true);

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

  -- Trilha de auditoria da contingência (leitura como postgres: a trilha não é exposta a service_role)
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_n FROM internal.provisionamento_contingencia_log
   WHERE chamado = 'CHAMADO-TESTE-HOMOLOG-001' AND responsavel = 'Teste Automatizado <teste@exemplo.test>'
     AND empresa_nome = 'ZZ Homologação Wizard';
  IF v_n <> 1 THEN RAISE EXCEPTION 'CONTINGENCIA: trilha ausente ou duplicada (%)', v_n; END IF;

  EXECUTE 'SET LOCAL ROLE service_role';
  -- ensurePdvConfig (payload pós-#625)
  UPDATE public.pdv_config SET gerente_id = v_dono::text
   WHERE empresa_id = v_emp AND gerente_id = 'empresa-' || left(v_emp::text, 8);
  IF NOT EXISTS (SELECT 1 FROM public.pdv_config WHERE loja_id = v_loja) THEN
    SELECT coalesce(max(id), 0) + 1 INTO v_id FROM public.pdv_config;
    INSERT INTO public.pdv_config (id, loja_id, gerente_id, cfop_padrao, cst_padrao, regime_tributario,
      auto_enqueue_fiscal, tema_padrao, imprimir_cupom_auto, formato_impressao, idioma_padrao)
    VALUES (v_id, v_loja, v_dono::text, '5102', '00', 'SIMPLES_NACIONAL', false, 'noturno', true, 'TERMICA', 'pt');
  END IF;

  -- ensureFormasPagamento
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

  -- login: vínculos ativos na empresa nova
  SELECT count(*) INTO v_n FROM public.usuario_vinculos WHERE empresa_id = v_emp AND ativo
     AND ((usuario_id = v_dono AND papel = 'DONO') OR (usuario_id = v_ger AND papel = 'GERENTE' AND loja_id = v_loja)
          OR (usuario_id = v_op AND papel = 'OPERADOR' AND loja_id = v_loja));
  IF v_n <> 3 THEN RAISE EXCEPTION 'WIZARD: vínculos ativos = % (esperado 3)', v_n; END IF;

  INSERT INTO prov_ctx VALUES ('wiz_emp', v_emp::text), ('wiz_loja', v_loja::text);
  RAISE NOTICE 'C OK: contingência autorizada cadastrou empresa %, loja %, 3 vínculos, trilha gravada; pdv_config + 4 formas + checklist', v_emp, v_loja;
END
$wizard$;

-- ── D. Trial automático bloqueado + limite por IP ────────────────────────────────────
DO $trial$
DECLARE
  v_resultados text := ''; i int; v_ok boolean; v_msg text := '';
BEGIN
  -- Encerra a autorização de contingência da seção C: o automático deve voltar a ser bloqueado.
  PERFORM set_config('fp.provisionamento_contingencia', '', true);
  PERFORM set_config('fp.provisionamento_responsavel', '', true);
  EXECUTE 'SET LOCAL ROLE service_role';
  FOR i IN 1..4 LOOP  -- saas.parametros.trial_max_por_ip_24h = 3
    v_ok := public.trial_registrar_tentativa('zz-ip-hash-homolog', 'zz-email-hash-' || i);
    v_resultados := v_resultados || v_ok::text || ' ';
  END LOOP;
  EXECUTE 'RESET ROLE';
  IF v_resultados <> 'true true true false ' THEN RAISE EXCEPTION 'TRIAL: limite por IP inesperado: %', v_resultados; END IF;

  -- signUp do teste grátis cria o Auth antes da RPC (mesma ordem do app)
  INSERT INTO auth.users (id, email, aud, role) VALUES ('a2000000-0000-4000-8000-0000000000d2', 'zz-trial-dono@exemplo.test', 'authenticated', 'authenticated') ON CONFLICT (id) DO NOTHING;
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    PERFORM public.plataforma_iniciar_trial(jsonb_build_object(
      'plano', 'ATACADO', 'demo', true,
      'empresa', jsonb_build_object('nome', 'ZZ Trial Nao Deve Existir'),
      'lojas', jsonb_build_array(jsonb_build_object('chave', 'loja1', 'nome', 'ZZ Loja Trial', 'codigo', NULL)),
      'usuarios', jsonb_build_array(jsonb_build_object('id', 'a2000000-0000-4000-8000-0000000000d2', 'nome', 'ZZ Dono Trial', 'papel', 'DONO', 'idioma', 'pt'))
    ), NULL);
    RAISE EXCEPTION 'CONTRATO: trial automático NÃO foi bloqueado';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  IF v_msg NOT LIKE 'PROVISIONAMENTO_AUTOMATICO_BLOQUEADO%' THEN RAISE EXCEPTION 'CONTRATO: trial com erro inesperado: %', v_msg; END IF;
  RAISE NOTICE 'D OK: trial automático bloqueado pelo mesmo interruptor; limite IP 3/24h respeitado';
END
$trial$;

-- ── E. Permissões e isolamento ──────────────────────────────────────────────────────
DO $perm$
DECLARE
  u record; v_alheias int; v_proprias int; v_negado boolean;
  v_wiz_emp uuid := (SELECT v::uuid FROM prov_ctx WHERE k = 'wiz_emp');
BEGIN
  IF has_function_privilege('authenticated', 'public.plataforma_provisionar_empresa(jsonb,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.plataforma_iniciar_trial(jsonb,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.trial_registrar_tentativa(text,text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.plataforma_iniciar_trial(jsonb,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PERM: RPC de plataforma executável por anon/authenticated';
  END IF;

  FOR u IN SELECT * FROM (VALUES
      ('a1000000-0000-4000-8000-0000000000d1'::uuid, 'DONO wizard', v_wiz_emp),
      ('a1000000-0000-4000-8000-0000000000e1'::uuid, 'GERENTE wizard', v_wiz_emp),
      ('a1000000-0000-4000-8000-0000000000f1'::uuid, 'OPERADOR wizard', v_wiz_emp)) x(id, quem, emp)
  LOOP
    PERFORM set_config('request.jwt.claim.sub', u.id::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
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
  RAISE NOTICE 'E OK: RPCs de plataforma só service_role; DONO/GERENTE/OPERADOR veem só a própria empresa';
END
$perm$;

SELECT 'PROVISIONAMENTO (contrato 20261028121000): OK' AS resultado;
ROLLBACK;
