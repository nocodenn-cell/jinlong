-- FORBIDDEN_APPLY: superseded by 20261006180000 / remote 20261006195837
-- NÃO aplicar em Jinlong remoto nem via db push/apply_migration automatizado.
-- Motivo: regrede PIX auto-liquidação e modelo financeiro_contas_forma.
-- Registro: backend/supabase/forbidden-migrations.json
-- Decisão: docs/piloto-d0/PLANO_POS_OPS02_INTEGRIDADE_FINANCEIRA.md
--
-- Sprint contas financeiras (histórico): vínculo forma→conta, inativação, painel enriquecido.
-- Aditiva. Não reescreve saldos históricos. Ledger continua em movimentos_financeiros.
-- Arquivo preservado para histórico e fixtures locais explícitas — apply remoto = NO-GO.
BEGIN;

ALTER TABLE public.formas_pagamento
  ADD COLUMN IF NOT EXISTS conta_financeira_id uuid REFERENCES public.contas_financeiras(id);

COMMENT ON COLUMN public.formas_pagamento.conta_financeira_id IS
  'Conta financeira padrão sugerida na liquidação/repasse desta forma. Dinheiro tipicamente RESERVA; PIX/cartão tipicamente BANCO. Não move saldo por si — só na liquidação efetiva.';

CREATE INDEX IF NOT EXISTS formas_pagamento_conta_financeira_idx
  ON public.formas_pagamento(conta_financeira_id)
  WHERE conta_financeira_id IS NOT NULL;

-- Captura de venda: pré-preenche conta padrão da forma (sem creditar saldo).
CREATE OR REPLACE FUNCTION internal.financeiro_capturar_venda() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.vendas%ROWTYPE; l uuid; p record; conta uuid;
BEGIN
 IF TG_TABLE_NAME='vendas' THEN SELECT * INTO v FROM public.vendas WHERE id=NEW.id;
 ELSE SELECT * INTO v FROM public.vendas WHERE id=NEW.venda_id; END IF;
 IF v.status<>'CONCLUIDA' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='vendas' THEN
  IF TG_OP='UPDATE' THEN
   IF OLD.status='CONCLUIDA' THEN RETURN NEW; END IF;
  END IF;
 END IF;
 SELECT loja_id INTO l FROM public.caixas WHERE id=v.caixa_id;
 IF l IS NULL THEN RETURN NEW; END IF;
 FOR p IN SELECT id,forma_pagamento,valor FROM public.vendas_pagamentos WHERE venda_id=v.id AND forma_pagamento<>'DINHEIRO' LOOP
  SELECT fp.conta_financeira_id INTO conta
  FROM public.formas_pagamento fp
  WHERE fp.loja_id=l AND fp.codigo=p.forma_pagamento AND fp.ativo
  LIMIT 1;
  INSERT INTO public.financeiro_recebiveis_venda(loja_id,venda_id,pagamento_id,forma,bruto,previsao,conta_financeira_id)
  VALUES(l,v.id,p.id,p.forma_pagamento,p.valor,
   CASE WHEN p.forma_pagamento='PIX' THEN (v.data AT TIME ZONE 'America/Sao_Paulo')::date END,
   conta)
  ON CONFLICT DO NOTHING;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.vendas_pagamentos WHERE venda_id=v.id) AND v.forma_pagamento<>'DINHEIRO' THEN
  SELECT fp.conta_financeira_id INTO conta
  FROM public.formas_pagamento fp
  WHERE fp.loja_id=l AND fp.codigo=v.forma_pagamento AND fp.ativo
  LIMIT 1;
  INSERT INTO public.financeiro_recebiveis_venda(loja_id,venda_id,forma,bruto,previsao,conta_financeira_id)
  VALUES(l,v.id,v.forma_pagamento,v.total_liquido,
   CASE WHEN v.forma_pagamento='PIX' THEN (v.data AT TIME ZONE 'America/Sao_Paulo')::date END,
   conta)
  ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;

-- Wrapper: novos tipos antes do comando legado (sem reescrever o CASE gigante).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='financeiro_comando_v1'
  ) THEN
    ALTER FUNCTION public.financeiro_comando(text, jsonb, uuid) RENAME TO financeiro_comando_v1;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.financeiro_comando(p_tipo text, p_dados jsonb, p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  l uuid;
  u uuid := auth.uid();
  cmd public.financeiro_comandos%ROWTYPE;
  c public.contas_financeiras%ROWTYPE;
  v_id uuid;
  resultado jsonb;
BEGIN
  IF p_tipo NOT IN ('INATIVAR_CONTA', 'VINCULAR_FORMA_PAGAMENTO') THEN
    RETURN public.financeiro_comando_v1(p_tipo, p_dados, p_request_id);
  END IF;
  IF p_request_id IS NULL OR p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN
    RAISE EXCEPTION 'Comando financeiro inválido.';
  END IF;
  l := internal.financeiro_loja();
  PERFORM pg_advisory_xact_lock(hashtextextended(l::text, 0));
  SELECT * INTO cmd FROM public.financeiro_comandos WHERE id = p_request_id;
  IF FOUND THEN
    IF cmd.loja_id <> l OR cmd.usuario_id <> u OR cmd.tipo <> p_tipo OR cmd.dados <> p_dados THEN
      RAISE EXCEPTION 'Repetição com dados diferentes.';
    END IF;
    RETURN cmd.resultado;
  END IF;
  IF nullif(p_dados->>'conta_id', '') IS NOT NULL THEN
    SELECT * INTO c FROM public.contas_financeiras
    WHERE id = (p_dados->>'conta_id')::uuid AND loja_id = l AND ativo
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Conta financeira inválida para esta loja.'; END IF;
  END IF;
  CASE p_tipo
  WHEN 'INATIVAR_CONTA' THEN
    IF c.id IS NULL THEN RAISE EXCEPTION 'Conta financeira inválida para esta loja.'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.formas_pagamento fp
      WHERE fp.conta_financeira_id = c.id AND fp.ativo
    ) THEN
      RAISE EXCEPTION 'Desvincule as formas de pagamento ativas antes de inativar a conta.';
    END IF;
    UPDATE public.contas_financeiras SET ativo = false WHERE id = c.id RETURNING id INTO v_id;
  WHEN 'VINCULAR_FORMA_PAGAMENTO' THEN
    IF length(btrim(coalesce(p_dados->>'codigo', ''))) < 2 THEN
      RAISE EXCEPTION 'Forma de pagamento obrigatória.';
    END IF;
    IF nullif(p_dados->>'conta_id', '') IS NOT NULL THEN
      IF c.id IS NULL THEN RAISE EXCEPTION 'Conta financeira inválida para esta loja.'; END IF;
      IF (p_dados->>'codigo') = 'DINHEIRO' AND c.tipo = 'BANCO' THEN
        RAISE EXCEPTION 'Dinheiro deve apontar para conta tipo caixa/reserva, nao banco.';
      END IF;
      IF (p_dados->>'codigo') IN ('PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO') AND c.tipo <> 'BANCO' THEN
        RAISE EXCEPTION 'PIX e cartao devem apontar para conta bancaria.';
      END IF;
    END IF;
    UPDATE public.formas_pagamento
      SET conta_financeira_id = nullif(p_dados->>'conta_id', '')::uuid, updated_at = now()
    WHERE loja_id = l AND codigo = upper(btrim(p_dados->>'codigo')) AND ativo
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Forma de pagamento nao encontrada nesta loja.'; END IF;
  END CASE;
  resultado := jsonb_build_object('id', v_id, 'ok', true);
  INSERT INTO public.financeiro_comandos VALUES (p_request_id, l, u, p_tipo, p_dados, resultado, now());
  RETURN resultado;
END $$;

REVOKE ALL ON FUNCTION public.financeiro_comando_v1(text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_comando(text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_comando(text, jsonb, uuid) TO authenticated;

-- Painel: entradas/saídas do período, usuário no extrato, formas vinculadas.
DO $$
DECLARE fonte text;
  antigo_contas text := E'SELECT c.*,coalesce((SELECT sum(valor) FROM public.movimentos_financeiros m WHERE m.conta_financeira_id=c.id),0) AS saldo FROM public.contas_financeiras c WHERE loja_id=l ORDER BY nome';
  novo_contas text := E'SELECT c.*,\n   coalesce((SELECT sum(valor) FROM public.movimentos_financeiros m WHERE m.conta_financeira_id=c.id),0) AS saldo,\n   coalesce((SELECT sum(m.valor) FILTER(WHERE m.valor>0) FROM public.movimentos_financeiros m WHERE m.conta_financeira_id=c.id AND m.data BETWEEN p_de AND p_ate),0) AS entradas_periodo,\n   coalesce((SELECT -sum(m.valor) FILTER(WHERE m.valor<0) FROM public.movimentos_financeiros m WHERE m.conta_financeira_id=c.id AND m.data BETWEEN p_de AND p_ate),0) AS saidas_periodo\n  FROM public.contas_financeiras c WHERE loja_id=l ORDER BY c.ativo DESC, c.nome';
  antigo_mov text := E'SELECT m.*,c.nome AS conta_nome,cat.nome AS categoria_nome,\n   (SELECT id FROM public.conciliacoes_financeiras cc WHERE cc.movimento_id=m.id AND desfeito_em IS NULL) AS conciliacao_id,\n   EXISTS(SELECT 1 FROM public.movimentos_financeiros e WHERE e.estorno_de=m.id) AS estornado\n  FROM public.movimentos_financeiros m JOIN public.contas_financeiras c ON c.id=m.conta_financeira_id LEFT JOIN public.categorias_financeiras cat ON cat.id=m.categoria_id WHERE m.loja_id=l AND m.data BETWEEN p_de AND p_ate ORDER BY m.data DESC,m.created_at DESC,m.id LIMIT 50 OFFSET off';
  novo_mov text := E'SELECT m.*,c.nome AS conta_nome,cat.nome AS categoria_nome,u.nome AS usuario_nome,\n   (SELECT id FROM public.conciliacoes_financeiras cc WHERE cc.movimento_id=m.id AND desfeito_em IS NULL) AS conciliacao_id,\n   EXISTS(SELECT 1 FROM public.movimentos_financeiros e WHERE e.estorno_de=m.id) AS estornado\n  FROM public.movimentos_financeiros m JOIN public.contas_financeiras c ON c.id=m.conta_financeira_id LEFT JOIN public.categorias_financeiras cat ON cat.id=m.categoria_id LEFT JOIN public.usuarios u ON u.id=m.criado_por WHERE m.loja_id=l AND m.data BETWEEN p_de AND p_ate ORDER BY m.data DESC,m.created_at DESC,m.id LIMIT 50 OFFSET off';
  antigo_alerta_fim text := E'''sem_categoria'',(SELECT count(*) FROM public.contas_pagar WHERE loja_id=l AND categoria_id IS NULL AND status<>''CANCELADO''))) INTO v_resultado;';
  novo_alerta_fim text := E'''sem_categoria'',(SELECT count(*) FROM public.contas_pagar WHERE loja_id=l AND categoria_id IS NULL AND status<>''CANCELADO''))) INTO v_resultado;\n SELECT v_resultado||jsonb_build_object(''formas_pagamento'',coalesce(jsonb_agg(to_jsonb(q)),''[]'')) INTO v_resultado FROM (\n  SELECT fp.id,fp.codigo,fp.nome,fp.ativo,fp.conta_financeira_id,cf.nome AS conta_nome,cf.tipo AS conta_tipo\n  FROM public.formas_pagamento fp\n  LEFT JOIN public.contas_financeiras cf ON cf.id=fp.conta_financeira_id\n  WHERE fp.loja_id=l ORDER BY fp.codigo\n ) q;';
BEGIN
  SELECT pg_get_functiondef('public.financeiro_painel(date,date,integer)'::regprocedure) INTO fonte;
  IF strpos(fonte, 'entradas_periodo') = 0 THEN
    IF strpos(fonte, antigo_contas) = 0 THEN
      RAISE EXCEPTION 'Financeiro: bloco contas do painel divergente; revisar antes do rollout.';
    END IF;
    fonte := replace(fonte, antigo_contas, novo_contas);
  END IF;
  IF strpos(fonte, 'usuario_nome') = 0 THEN
    IF strpos(fonte, antigo_mov) = 0 THEN
      RAISE EXCEPTION 'Financeiro: bloco movimentos do painel divergente; revisar antes do rollout.';
    END IF;
    fonte := replace(fonte, antigo_mov, novo_mov);
  END IF;
  IF strpos(fonte, 'formas_pagamento') = 0 THEN
    IF strpos(fonte, antigo_alerta_fim) = 0 THEN
      RAISE EXCEPTION 'Financeiro: bloco alertas do painel divergente; revisar antes do rollout.';
    END IF;
    fonte := replace(fonte, antigo_alerta_fim, novo_alerta_fim);
  END IF;
  EXECUTE fonte;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
