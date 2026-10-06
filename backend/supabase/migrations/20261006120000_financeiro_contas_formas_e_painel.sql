-- Sprint contas financeiras: vínculo forma→conta, inativação, painel enriquecido.
-- Aditiva. Não reescreve saldos históricos. Ledger continua em movimentos_financeiros.
BEGIN;

-- Conta financeira padrão por forma de pagamento (por loja).
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

-- Estende financeiro_comando com INATIVAR_CONTA e VINCULAR_FORMA_PAGAMENTO.
DO $$
DECLARE fonte text;
  marker text := 'ELSE RAISE EXCEPTION ''Operação financeira desconhecida.''';';
  injecao text := $inj$
 WHEN 'INATIVAR_CONTA' THEN
  IF c.id IS NULL THEN RAISE EXCEPTION 'Conta financeira inválida para esta loja.'; END IF;
  IF EXISTS(SELECT 1 FROM public.formas_pagamento fp WHERE fp.conta_financeira_id=c.id AND fp.ativo) THEN
   RAISE EXCEPTION 'Desvincule as formas de pagamento ativas antes de inativar a conta.';
  END IF;
  UPDATE public.contas_financeiras SET ativo=false WHERE id=c.id RETURNING id INTO v_id;
 WHEN 'VINCULAR_FORMA_PAGAMENTO' THEN
  IF length(btrim(coalesce(p_dados->>'codigo','')))<2 THEN RAISE EXCEPTION 'Forma de pagamento obrigatória.'; END IF;
  IF nullif(p_dados->>'conta_id','') IS NOT NULL THEN
   IF c.id IS NULL THEN RAISE EXCEPTION 'Conta financeira inválida para esta loja.'; END IF;
   IF (p_dados->>'codigo')='DINHEIRO' AND c.tipo='BANCO' THEN
    RAISE EXCEPTION 'Dinheiro deve apontar para conta tipo caixa/reserva, não banco.';
   END IF;
   IF (p_dados->>'codigo') IN ('PIX','CARTAO_DEBITO','CARTAO_CREDITO') AND c.tipo<>'BANCO' THEN
    RAISE EXCEPTION 'PIX e cartão devem apontar para conta bancária.';
   END IF;
  END IF;
  UPDATE public.formas_pagamento
   SET conta_financeira_id=nullif(p_dados->>'conta_id','')::uuid, updated_at=now()
   WHERE loja_id=l AND codigo=upper(btrim(p_dados->>'codigo')) AND ativo
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Forma de pagamento não encontrada nesta loja.'; END IF;
 ELSE RAISE EXCEPTION 'Operação financeira desconhecida.';
$inj$;
BEGIN
 SELECT pg_get_functiondef('public.financeiro_comando(text,jsonb,uuid)'::regprocedure) INTO fonte;
 IF strpos(fonte, marker) = 0 THEN
  RAISE EXCEPTION 'Financeiro: definição de financeiro_comando divergente; revisar antes do rollout.';
 END IF;
 IF strpos(fonte, 'INATIVAR_CONTA') > 0 THEN
  RAISE NOTICE 'INATIVAR_CONTA já presente; pulando reinjeção.';
 ELSE
  EXECUTE replace(fonte, marker, injecao);
 END IF;
END $$;

-- Painel: entradas/saídas do período por conta, usuário no extrato, formas vinculadas.
DO $$
DECLARE fonte text;
  antigo_contas text := $a$SELECT v_resultado||jsonb_build_object('contas',coalesce(jsonb_agg(to_jsonb(q)),'[]')) INTO v_resultado FROM (
  SELECT c.*,coalesce((SELECT sum(valor) FROM public.movimentos_financeiros m WHERE m.conta_financeira_id=c.id),0) AS saldo FROM public.contas_financeiras c WHERE loja_id=l ORDER BY nome
 ) q;$a$;
  novo_contas text := $b$SELECT v_resultado||jsonb_build_object('contas',coalesce(jsonb_agg(to_jsonb(q)),'[]')) INTO v_resultado FROM (
  SELECT c.*,
   coalesce((SELECT sum(valor) FROM public.movimentos_financeiros m WHERE m.conta_financeira_id=c.id),0) AS saldo,
   coalesce((SELECT sum(m.valor) FILTER(WHERE m.valor>0) FROM public.movimentos_financeiros m WHERE m.conta_financeira_id=c.id AND m.data BETWEEN p_de AND p_ate),0) AS entradas_periodo,
   coalesce((SELECT -sum(m.valor) FILTER(WHERE m.valor<0) FROM public.movimentos_financeiros m WHERE m.conta_financeira_id=c.id AND m.data BETWEEN p_de AND p_ate),0) AS saidas_periodo
  FROM public.contas_financeiras c WHERE loja_id=l ORDER BY c.ativo DESC, c.nome
 ) q;$b$;
  antigo_mov text := $c$SELECT v_resultado||jsonb_build_object('movimentos',coalesce(jsonb_agg(to_jsonb(q)),'[]')) INTO v_resultado FROM (
  SELECT m.*,c.nome AS conta_nome,cat.nome AS categoria_nome,
   (SELECT id FROM public.conciliacoes_financeiras cc WHERE cc.movimento_id=m.id AND desfeito_em IS NULL) AS conciliacao_id,
   EXISTS(SELECT 1 FROM public.movimentos_financeiros e WHERE e.estorno_de=m.id) AS estornado
  FROM public.movimentos_financeiros m JOIN public.contas_financeiras c ON c.id=m.conta_financeira_id LEFT JOIN public.categorias_financeiras cat ON cat.id=m.categoria_id WHERE m.loja_id=l AND m.data BETWEEN p_de AND p_ate ORDER BY m.data DESC,m.created_at DESC,m.id LIMIT 50 OFFSET off
 ) q;$c$;
  novo_mov text := $d$SELECT v_resultado||jsonb_build_object('movimentos',coalesce(jsonb_agg(to_jsonb(q)),'[]')) INTO v_resultado FROM (
  SELECT m.*,c.nome AS conta_nome,cat.nome AS categoria_nome,u.nome AS usuario_nome,
   (SELECT id FROM public.conciliacoes_financeiras cc WHERE cc.movimento_id=m.id AND desfeito_em IS NULL) AS conciliacao_id,
   EXISTS(SELECT 1 FROM public.movimentos_financeiros e WHERE e.estorno_de=m.id) AS estornado
  FROM public.movimentos_financeiros m
  JOIN public.contas_financeiras c ON c.id=m.conta_financeira_id
  LEFT JOIN public.categorias_financeiras cat ON cat.id=m.categoria_id
  LEFT JOIN public.usuarios u ON u.id=m.criado_por
  WHERE m.loja_id=l AND m.data BETWEEN p_de AND p_ate
  ORDER BY m.data DESC,m.created_at DESC,m.id LIMIT 50 OFFSET off
 ) q;$d$;
  antigo_alerta text := $e$SELECT v_resultado||jsonb_build_object('alertas',jsonb_build_object(
  'sem_previsao',(SELECT count(*) FROM public.financeiro_recebiveis_venda WHERE loja_id=l AND status='PENDENTE' AND (previsao IS NULL OR taxa IS NULL)),
  'ar_sem_vencimento',(SELECT count(*) FROM public.contas_receber WHERE loja_id=l AND valor_aberto>0 AND vencimento IS NULL),
  'caixas_incompletos',(SELECT count(*) FROM public.caixas WHERE loja_id=l AND status='FECHADO' AND (data_fechamento IS NULL OR valor_fechamento IS NULL OR fechamento_diferenca IS NULL)),
  'sem_categoria',(SELECT count(*) FROM public.contas_pagar WHERE loja_id=l AND categoria_id IS NULL AND status<>'CANCELADO'))) INTO v_resultado;$e$;
  novo_alerta_e_formas text := $f$SELECT v_resultado||jsonb_build_object('alertas',jsonb_build_object(
  'sem_previsao',(SELECT count(*) FROM public.financeiro_recebiveis_venda WHERE loja_id=l AND status='PENDENTE' AND (previsao IS NULL OR taxa IS NULL)),
  'ar_sem_vencimento',(SELECT count(*) FROM public.contas_receber WHERE loja_id=l AND valor_aberto>0 AND vencimento IS NULL),
  'caixas_incompletos',(SELECT count(*) FROM public.caixas WHERE loja_id=l AND status='FECHADO' AND (data_fechamento IS NULL OR valor_fechamento IS NULL OR fechamento_diferenca IS NULL)),
  'sem_categoria',(SELECT count(*) FROM public.contas_pagar WHERE loja_id=l AND categoria_id IS NULL AND status<>'CANCELADO'))) INTO v_resultado;
 SELECT v_resultado||jsonb_build_object('formas_pagamento',coalesce(jsonb_agg(to_jsonb(q)),'[]')) INTO v_resultado FROM (
  SELECT fp.id,fp.codigo,fp.nome,fp.ativo,fp.conta_financeira_id,cf.nome AS conta_nome,cf.tipo AS conta_tipo
  FROM public.formas_pagamento fp
  LEFT JOIN public.contas_financeiras cf ON cf.id=fp.conta_financeira_id
  WHERE fp.loja_id=l ORDER BY fp.codigo
 ) q;$f$;
BEGIN
 SELECT pg_get_functiondef('public.financeiro_painel(date,date,integer)'::regprocedure) INTO fonte;
 IF strpos(fonte, antigo_contas) = 0 THEN
  RAISE EXCEPTION 'Financeiro: bloco contas do painel divergente; revisar antes do rollout.';
 END IF;
 IF strpos(fonte, 'entradas_periodo') = 0 THEN
  fonte := replace(fonte, antigo_contas, novo_contas);
 END IF;
 IF strpos(fonte, antigo_mov) > 0 THEN
  fonte := replace(fonte, antigo_mov, novo_mov);
 ELSIF strpos(fonte, 'usuario_nome') = 0 THEN
  RAISE EXCEPTION 'Financeiro: bloco movimentos do painel divergente; revisar antes do rollout.';
 END IF;
 IF strpos(fonte, 'formas_pagamento') = 0 THEN
  IF strpos(fonte, antigo_alerta) = 0 THEN
   RAISE EXCEPTION 'Financeiro: bloco alertas do painel divergente; revisar antes do rollout.';
  END IF;
  fonte := replace(fonte, antigo_alerta, novo_alerta_e_formas);
 END IF;
 EXECUTE fonte;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
