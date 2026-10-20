-- golive-final-584 :: 20261006120000 financeiro_contas_formas_e_painel :: sha256 3ae1a705babf2b8bde92af88a937fddf2562c5cbb8c208da649f263d8e7043fb
BEGIN;
SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '180s';
DO $g$ BEGIN IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261006120000') THEN RAISE EXCEPTION 'GOLIVE_STOP: % já no histórico', '20261006120000'; END IF; END $g$;
-- Sprint contas financeiras: vínculo forma→conta, inativação, painel enriquecido.
-- Aditiva. Não reescreve saldos históricos. Ledger continua em movimentos_financeiros.

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
;
INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES ('20261006120000', 'financeiro_contas_formas_e_painel', ARRAY[$golive_stmt_3ae1a705babf$-- Sprint contas financeiras: vínculo forma→conta, inativação, painel enriquecido.
-- Aditiva. Não reescreve saldos históricos. Ledger continua em movimentos_financeiros.
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
$golive_stmt_3ae1a705babf$]);
DO $chk$ DECLARE v text; o bigint; BEGIN
  SELECT replace((SELECT (SELECT 'vendas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,chave_nf,cliente_id,created_at,data,forma_pagamento,id,idempotency_key,numero_nf,operador_id,pricing_version_id,status,tipo_venda,total_bruto,total_desconto,total_liquido)::text) h FROM public.vendas) s)||' # '||(SELECT 'itens_venda:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(custo_unitario_snap,desconto_unitario,id,preco_unitario,preco_unitario_original,pricing_version_id,produto_id,promocao_desconto_percentual,promocao_nome_snapshot,promocao_regra_id,quantidade,regra_aplicada_id,tipo_preco,tipo_preco_fonte,venda_id)::text) h FROM public.itens_venda) s)||' # '||(SELECT 'vendas_pagamentos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(created_at,forma_pagamento,id,valor,venda_id)::text) h FROM public.vendas_pagamentos) s)||' # '||(SELECT 'caixas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(autorizado_por,conta_financeira_id,data_abertura,data_fechamento,fechamento_diferenca,fechamento_observacao,id,loja_id,motivo_retomada,operador_id,saldo_atual,status,turno_anterior_id,valor_fechamento,valor_inicial)::text) h FROM public.caixas) s)||' # '||(SELECT 'movimentacoes_caixa:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,created_at,deleted_at,device_id,forma_pagamento,gerente_id,id,idempotency_key,ip_address,loja_id,motivo,motivo_codigo,movimentacao_origem_id,numero_sequencial,operador_id,saldo_antes,saldo_depois,status,terminal_id,tipo,updated_at,user_agent,valor)::text) h FROM public.movimentacoes_caixa) s)||' # '||(SELECT 'estoque:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(estoque_minimo,id,loja_id,produto_id,quantidade_atual,updated_at,version)::text) h FROM public.estoque) s)||' # '||(SELECT 'produtos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,atualizado_por,categoria_id,cest,cfop_produto,codigo_barras,codigo_interno,comissao_tipo,comissao_valor,created_at,criado_por,csosn,cst_cofins,cst_pis,estoque_minimo,fornecedor_id,icms_origem,id,imagem_url,limite_transferencia_sem_observacao,localizacao_prateleira,loja_id,marca_id,ncm,nome,nome_reduzido_pdv,nome_sem_acento,observacao,origem,permitir_abaixo_custo,preco_atacado,preco_custo,preco_custo_medio,preco_varejo,quantidade_gatilho_atacado,referencia_fornecedor,status_publicacao,tags,tem_nf,unidade_medida,updated_at)::text) h FROM public.produtos) s)||' # '||(SELECT 'usuarios:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,funcionario_id,id,idioma_preferido,loja_id,nome,perfil)::text) h FROM public.usuarios) s)||' # '||(SELECT 'clientes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,consentimento_privacidade_em,created_at,documento,email,endereco,id,limite_credito,loja_id,nome,telefone,termos_aceitos_em,tipo)::text) h FROM public.clientes) s)||' # '||(SELECT 'lojas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,cnae,cnpj,codigo,created_at,email,endereco_bairro,endereco_cep,endereco_cidade,endereco_complemento,endereco_logradouro,endereco_numero,endereco_uf,id,inscricao_estadual,logo_url,nome,nome_fantasia,numero_serie_nfce,numero_serie_nfe,razao_social,telefone)::text) h FROM public.lojas) s)||' # '||(SELECT 'formas_pagamento:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,codigo,created_at,id,loja_id,nome,prazo_compensacao_dias,taxa_percentual,updated_at)::text) h FROM public.formas_pagamento) s)||' # '||(SELECT 'contas_financeiras:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,criado_por,data_inicial,id,loja_id,nome,tipo)::text) h FROM public.contas_financeiras) s)||' # '||(SELECT 'contas_pagar:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(cancelamento_em,cancelamento_motivo,categoria_id,competencia,criado_em,descricao,favorecido,fornecedor_id,id,loja_id,lote_id,nfe_importacao_id,nfe_numero,observacao,parcela,status,valor_pago,valor_total,vencimento)::text) h FROM public.contas_pagar) s)||' # '||(SELECT 'contas_receber:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(categoria_id,cliente_id,competencia,created_at,descricao,id,loja_id,status,valor_aberto,valor_total,vencimento,venda_id)::text) h FROM public.contas_receber) s)||' # '||(SELECT 'pdv_config:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(alertas_leves_ativos,auto_enqueue_fiscal,blind_closure,cfop_padrao,cst_padrao,formato_impressao,gerente_id,gerente_senha_bcrypt,id,idioma_padrao,imprimir_cupom_auto,limite_sangria_sem_gerente,limite_transferencia_obs,loja_id,max_desconto_gerente_percentual,max_desconto_manual_item_percentual,max_desconto_total_percentual,modo_limite_credito,quantidade_minima_atacado_padrao,regime_tributario,show_margin_visual,show_preco_fonte,show_stock_alerts,tema_padrao)::text) h FROM public.pdv_config) s)||' # '||(SELECT 'documentos_fiscais_pendentes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(chave_fiscal,correlation_id,created_at,deleted_at,fiscal_action_hint,fiscal_error_category,fiscal_error_code,fiscal_error_payload,fiscal_next_step_url,fiscal_retryable,id,payload,processado_em,protocolo,provider,provider_ref,proxima_tentativa_em,status,tentativas,tipo_doc,transicao_origem,ultima_tentativa_em,ultima_transicao_em,ultimo_erro,updated_at,venda_id,xml_armazenado_em,xml_lease_expires_em,xml_lease_token,xml_proxima_tentativa_em,xml_sha256,xml_status,xml_storage_path,xml_tentativas,xml_ultimo_erro)::text) h FROM public.documentos_fiscais_pendentes) s)||' # '||(SELECT 'totais:'||coalesce(string_agg(x,';' ORDER BY x),'') FROM (SELECT md5(l.id::text)||'|'||(SELECT count(*) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(v.total_liquido),0) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id AND v.status<>'CANCELADA')||'|'||(SELECT coalesce(sum(p.valor),0) FROM public.vendas_pagamentos p JOIN public.vendas v ON v.id=p.venda_id JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(saldo_atual),0) FROM public.caixas c WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(round(sum(quantidade_atual),3),0) FROM public.estoque e WHERE e.loja_id=l.id) x FROM public.lojas l) z)), ' # ', chr(1)) INTO v;
  IF v IS DISTINCT FROM $b$vendas:268:d91380e73abcf09a1086cba6e9aa094eitens_venda:266:db402eee5f6d7957110757600882edccvendas_pagamentos:201:3432d6d312e6f6f24ea9612a7257e235caixas:58:1b639b4221cdfaf9bfcc3ebf5660fbedmovimentacoes_caixa:0:-estoque:158:061c9e8da8142a531eb8d0728e3b4b15produtos:161:8fba5ff547239f94467b7a2126222120usuarios:13:2acdeaaf217d2571a434f8e8ff767aa2clientes:0:-lojas:4:812269b5692f7006f88ec49b088e9c36formas_pagamento:16:c1bbdbff97007016877776ad56afcccccontas_financeiras:0:-contas_pagar:2:2567d13b490befeaf7cc8bf48d01cfe1contas_receber:0:-pdv_config:1:899f43bdba711cfddea47afd00c8b21adocumentos_fiscais_pendentes:0:-totais:528f99d0e010f11ef321f548d3a7b51c|0|0|0|0|20.000;7ab49c7a91a109170b7e57fef3243a59|2|100.00|0|100.00|0.000;86641fb0d5893caebab1d0b38f0ef759|0|0|0|0|0;b5381bb6313900060b277d41cd1d490c|266|49013.80|38569.80|6500.00|284546.000$b$ THEN RAISE EXCEPTION 'GOLIVE_STOP: totais/hashes divergem da baseline após 20261006120000: %', replace(v, chr(1), ' # '); END IF;
  WITH fk AS (SELECT c.conrelid::regclass filho, c.confrelid::regclass pai,
 (SELECT string_agg(format('f.%I = p.%I', af.attname, ap.attname), ' AND ' ORDER BY k.i) FROM unnest(c.conkey, c.confkey) WITH ORDINALITY k(fc, pc, i) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc JOIN pg_attribute ap ON ap.attrelid=c.confrelid AND ap.attnum=k.pc) cond,
 (SELECT string_agg(format('f.%I IS NOT NULL', af.attname), ' AND ') FROM unnest(c.conkey) k(fc) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc) nn
 FROM pg_constraint c WHERE c.contype='f' AND c.connamespace IN ('public'::regnamespace) )
SELECT count(*) FILTER (WHERE (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) c FROM %s f WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)', filho, nn, pai, cond), false, true, '')))[1]::text::bigint > 0) FROM fk INTO o;
  IF o <> 0 THEN RAISE EXCEPTION 'GOLIVE_STOP: % FK(s) com órfãos após 20261006120000', o; END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261006120000' AND name='financeiro_contas_formas_e_painel') THEN RAISE EXCEPTION 'GOLIVE_STOP: linha de histórico ausente 20261006120000'; END IF;
END $chk$;
COMMIT;
