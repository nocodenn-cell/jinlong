-- Cenário de homologação da política de venda offline (roda num único DO que aborta no fim: não deixa dados).
-- Pré-requisito: migrations 20261020100000 e 20261020110000 aplicadas; depois rodar os rollbacks.
DO $$
DECLARE
  e uuid := gen_random_uuid(); l uuid := gen_random_uuid(); cx uuid := gen_random_uuid(); dv uuid := gen_random_uuid();
  le1 uuid; dv1 uuid := gen_random_uuid(); r jsonb; ok text[] := '{}'; t_aut timestamptz; v1 uuid := gen_random_uuid(); v2 uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.empresas (id, nome) VALUES (e, 'HOMOLOG_OFFLINE_TESTE');
  INSERT INTO public.lojas (id, nome, empresa_id) VALUES (l, 'HOMOLOG_OFFLINE_TESTE', e);
  INSERT INTO public.configuracoes_gerais (empresa_id, chave, valor, tipo_dado, descricao)
    VALUES (e, 'vendas_suspensas', 'false', 'text', 'x') ON CONFLICT (empresa_id, chave) DO NOTHING;
  INSERT INTO public.caixas (id, loja_id, status) VALUES (cx, l, 'ABERTO');
  INSERT INTO public.pdv_dispositivos (id, empresa_id, loja_id, device_fingerprint, sync_secret, ativado_em)
    VALUES (dv, e, l, 'homolog-offline-' || dv, repeat('s', 48), now() - interval '5 days');
  PERFORM public.cobranca_registrar_assinatura(e, 'BASICO', '{}', 1, 1, 'PIX', 9900, NULL, NULL, NULL);
  -- sync antes da suspensão: servidor emite autorização (simula ter sido há 2h)
  UPDATE public.pdv_dispositivos SET ultimo_sync_em = now() WHERE id = dv;
  UPDATE public.pdv_dispositivos SET ultimo_sync_em = now() - interval '2 hours' WHERE id = dv;
  UPDATE saas.pdv_autorizacoes_offline SET emitida_em = now() - interval '2 hours', expira_em = now() + interval '70 hours' WHERE dispositivo_id = dv;
  IF (SELECT count(*) FROM saas.pdv_autorizacoes_offline WHERE dispositivo_id = dv) = 1 THEN ok := ok || 'autorizacao_emitida'::text; END IF;
  PERFORM internal.cobranca_suspender(e, 'teste homolog');
  IF (SELECT valor FROM public.configuracoes_gerais WHERE empresa_id = e AND chave = 'vendas_suspensas') = 'true' THEN ok := ok || 'suspensa'::text; END IF;
  UPDATE public.pdv_dispositivos SET ultimo_sync_em = now() WHERE id = dv;  -- PDV recebe a suspensão
  IF EXISTS (SELECT 1 FROM saas.dispositivo_ciencia_suspensao WHERE dispositivo_id = dv) THEN ok := ok || 'ciencia'::text; END IF;
  -- pré-suspensão: aceita e entra; idempotente
  r := public.cobranca_liberar_venda_offline(dv, v1, now() - interval '1 hour');
  IF (r->>'liberada')::boolean THEN ok := ok || 'pre_liberada'::text; END IF;
  INSERT INTO public.vendas (id, caixa_id, total_bruto, total_liquido, forma_pagamento) VALUES (v1, cx, 1, 1, 'DINHEIRO');
  ok := ok || 'pre_venda_inserida'::text;
  IF (public.cobranca_liberar_venda_offline(dv, v1, now() - interval '1 hour')->>'idempotente')::boolean THEN ok := ok || 'idempotente'::text; END IF;
  IF public.cobranca_liberar_venda_offline(dv, v1, now() - interval '30 minutes')->>'motivo' = 'VENDA_ID_REUTILIZADO' THEN ok := ok || 'id_reutilizado_recusado'::text; END IF;
  -- pós-suspensão
  IF public.cobranca_liberar_venda_offline(dv, v2, now() + interval '1 second')->>'motivo' = 'VENDA_APOS_SUSPENSAO' THEN ok := ok || 'pos_recusada'::text; END IF;
  BEGIN
    INSERT INTO public.vendas (id, caixa_id, total_bruto, total_liquido, forma_pagamento) VALUES (v2, cx, 1, 1, 'DINHEIRO');
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%VENDAS_SUSPENSAS%' THEN ok := ok || 'pos_gatilho_bloqueou'::text; END IF; END;
  -- retroagida antes da autorização
  IF public.cobranca_liberar_venda_offline(dv, gen_random_uuid(), now() - interval '5 hours')->>'motivo' = 'SEM_AUTORIZACAO_OFFLINE_VALIDA' THEN ok := ok || 'retroagida_recusada'::text; END IF;
  -- fora de ordem
  IF public.cobranca_liberar_venda_offline(dv, gen_random_uuid(), now() - interval '90 minutes')->>'motivo' = 'VENDA_FORA_DE_ORDEM' THEN ok := ok || 'fora_de_ordem_recusada'::text; END IF;
  -- prazo de envio
  UPDATE saas.dispositivo_ciencia_suspensao SET ciente_em = now() - interval '2 hours' WHERE dispositivo_id = dv;
  IF public.cobranca_liberar_venda_offline(dv, gen_random_uuid(), now() - interval '30 minutes')->>'motivo' = 'PRAZO_DE_ENVIO_EXPIRADO' THEN ok := ok || 'prazo_envio_recusado'::text; END IF;
  -- Empresa 1 sem assinatura: inalterada
  SELECT id INTO le1 FROM public.lojas WHERE empresa_id = 'e0000001-0000-4000-8000-000000000001' LIMIT 1;
  IF public.fp_recursos_empresa('e0000001-0000-4000-8000-000000000001') IS NULL THEN ok := ok || 'empresa1_sem_restricao'::text; END IF;
  IF le1 IS NOT NULL THEN
    INSERT INTO public.pdv_dispositivos (id, empresa_id, loja_id, device_fingerprint, sync_secret)
      VALUES (dv1, 'e0000001-0000-4000-8000-000000000001', le1, 'homolog-offline-e1-' || dv1, repeat('s', 48));
    IF public.cobranca_liberar_venda_offline(dv1, gen_random_uuid(), now())->>'motivo' = 'SEM_SUSPENSAO_COBRANCA' THEN ok := ok || 'empresa1_sem_suspensao'::text; END IF;
  END IF;
  IF (SELECT valor FROM public.configuracoes_gerais WHERE empresa_id = 'e0000001-0000-4000-8000-000000000001' AND chave = 'vendas_suspensas') = 'false' THEN ok := ok || 'empresa1_vendendo'::text; END IF;
  -- pagamento/reativação
  PERFORM internal.cobranca_reativar(e);
  INSERT INTO public.vendas (id, caixa_id, total_bruto, total_liquido, forma_pagamento) VALUES (gen_random_uuid(), cx, 1, 1, 'DINHEIRO');
  ok := ok || 'reativada_venda_ok'::text;
  RAISE EXCEPTION 'HOMOLOG_RESULTADO % (desfeito de propósito)', array_to_string(ok, ',');
END $$;
