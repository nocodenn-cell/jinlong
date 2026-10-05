-- Evolução do financeiro; o saldo do turno continua pertencendo ao domínio cash.
BEGIN;
CREATE SCHEMA IF NOT EXISTS internal;

CREATE TABLE public.contas_financeiras (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid NOT NULL REFERENCES public.lojas(id),
 nome text NOT NULL CHECK(length(btrim(nome)) BETWEEN 2 AND 120),
 tipo text NOT NULL CHECK(tipo IN ('BANCO','RESERVA')), ativo boolean NOT NULL DEFAULT true,
 data_inicial date NOT NULL, criado_por uuid NOT NULL REFERENCES public.usuarios(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(loja_id,nome)
);
CREATE TABLE public.movimentos_financeiros (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid NOT NULL REFERENCES public.lojas(id),
 conta_financeira_id uuid NOT NULL REFERENCES public.contas_financeiras(id), data date NOT NULL,
 valor numeric NOT NULL CHECK(valor <> 0 AND valor NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) AND valor=round(valor,2)),
 descricao text NOT NULL, categoria_id uuid REFERENCES public.categorias_financeiras(id),
 origem text NOT NULL, origem_id uuid NOT NULL, transferencia_id uuid,
 estorno_de uuid REFERENCES public.movimentos_financeiros(id),
 criado_por uuid REFERENCES public.usuarios(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(conta_financeira_id,origem,origem_id), UNIQUE(estorno_de)
);
CREATE INDEX ON public.movimentos_financeiros(loja_id,data);
CREATE INDEX ON public.movimentos_financeiros(conta_financeira_id,data);
CREATE INDEX ON public.movimentos_financeiros(loja_id,origem,origem_id);
CREATE TABLE public.financeiro_comandos (
 id uuid PRIMARY KEY, loja_id uuid NOT NULL REFERENCES public.lojas(id),
 usuario_id uuid NOT NULL REFERENCES public.usuarios(id), tipo text NOT NULL, dados jsonb NOT NULL,
 resultado jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.financeiro_recebiveis_venda (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid NOT NULL REFERENCES public.lojas(id),
 venda_id uuid NOT NULL REFERENCES public.vendas(id), pagamento_id uuid REFERENCES public.vendas_pagamentos(id),
 parcela integer NOT NULL DEFAULT 1 CHECK(parcela>0), parcelas integer NOT NULL DEFAULT 1 CHECK(parcelas BETWEEN 1 AND 60),
 forma text NOT NULL, bruto numeric NOT NULL CHECK(bruto>0 AND bruto=round(bruto,2) AND bruto<'Infinity'::numeric), taxa numeric CHECK(taxa>=0 AND taxa<=bruto AND taxa=round(taxa,2)),
 operadora text, previsao date, conta_financeira_id uuid REFERENCES public.contas_financeiras(id),
 recebimento_atual_id uuid REFERENCES public.movimentos_financeiros(id),
 status text NOT NULL DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE','RECEBIDO','CANCELADO')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(pagamento_id,parcela)
);
CREATE UNIQUE INDEX ON public.financeiro_recebiveis_venda(venda_id,parcela) WHERE pagamento_id IS NULL;
CREATE INDEX ON public.financeiro_recebiveis_venda(loja_id,previsao);
CREATE INDEX ON public.financeiro_recebiveis_venda(venda_id);
CREATE TABLE public.extratos_financeiros (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid NOT NULL REFERENCES public.lojas(id),
 conta_financeira_id uuid NOT NULL REFERENCES public.contas_financeiras(id),
 referencia text NOT NULL, data date NOT NULL, descricao text NOT NULL,
 valor numeric NOT NULL CHECK(valor<>0 AND valor=round(valor,2) AND abs(valor)<'Infinity'::numeric),
 criado_por uuid NOT NULL REFERENCES public.usuarios(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(conta_financeira_id,referencia)
);
CREATE TABLE public.conciliacoes_financeiras (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid NOT NULL REFERENCES public.lojas(id),
 extrato_id uuid NOT NULL REFERENCES public.extratos_financeiros(id),
 movimento_id uuid NOT NULL REFERENCES public.movimentos_financeiros(id),
 motivo text NOT NULL, criado_por uuid NOT NULL REFERENCES public.usuarios(id),
 created_at timestamptz NOT NULL DEFAULT now(), desfeito_em timestamptz, desfeito_por uuid REFERENCES public.usuarios(id), motivo_desfazer text
);
CREATE UNIQUE INDEX ON public.conciliacoes_financeiras(extrato_id) WHERE desfeito_em IS NULL;
CREATE UNIQUE INDEX ON public.conciliacoes_financeiras(movimento_id) WHERE desfeito_em IS NULL;

ALTER TABLE public.contas_pagar ALTER COLUMN fornecedor_id DROP NOT NULL;
ALTER TABLE public.contas_pagar ADD COLUMN favorecido text, ADD COLUMN categoria_id uuid REFERENCES public.categorias_financeiras(id),
 ADD COLUMN competencia date, ADD COLUMN lote_id uuid, ADD COLUMN parcela integer;
ALTER TABLE public.contas_receber ADD COLUMN categoria_id uuid REFERENCES public.categorias_financeiras(id), ADD COLUMN competencia date;
ALTER TABLE public.contas_pagar_pagamentos ADD COLUMN conta_financeira_id uuid REFERENCES public.contas_financeiras(id);
ALTER TABLE public.liquidacoes_receber ADD COLUMN conta_financeira_id uuid REFERENCES public.contas_financeiras(id), ADD COLUMN data_efetiva date;
-- As baixas continuam exclusivamente nas RPCs transacionais existentes.
REVOKE INSERT,UPDATE,DELETE ON public.contas_pagar_pagamentos,public.liquidacoes_receber FROM anon,authenticated;

CREATE FUNCTION internal.financeiro_loja() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v uuid;
BEGIN
 SELECT loja_id INTO v FROM public.usuarios WHERE id=auth.uid() AND ativo AND perfil IN ('GERENTE','DONO','ADMIN');
 IF v IS NULL THEN RAISE EXCEPTION 'Financeiro: usuário gerencial com loja obrigatória.' USING ERRCODE='42501'; END IF;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION internal.financeiro_loja() FROM PUBLIC,anon,authenticated;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['contas_financeiras','movimentos_financeiros','financeiro_comandos','financeiro_recebiveis_venda','extratos_financeiros','conciliacoes_financeiras'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY financeiro_leitura ON public.%I FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=(SELECT auth.uid()) AND u.ativo AND u.perfil IN (''GERENTE'',''DONO'',''ADMIN'') AND u.loja_id=%I.loja_id))',t,t);
 END LOOP;
END $$;

CREATE FUNCTION internal.financeiro_movimento(p_conta uuid,p_data date,p_valor numeric,p_descricao text,p_origem text,p_origem_id uuid,p_categoria uuid DEFAULT NULL,p_transferencia uuid DEFAULT NULL,p_estorno uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.contas_financeiras%ROWTYPE; v uuid;
BEGIN
 SELECT * INTO c FROM public.contas_financeiras WHERE id=p_conta FOR UPDATE;
 IF NOT FOUND OR (auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=auth.uid() AND u.ativo AND u.loja_id=c.loja_id)) THEN RAISE EXCEPTION 'Conta financeira não encontrada nesta loja.'; END IF;
 IF p_data IS NULL OR p_data<c.data_inicial OR p_data>(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Data fora do período da conta financeira.'; END IF;
 INSERT INTO public.movimentos_financeiros(loja_id,conta_financeira_id,data,valor,descricao,origem,origem_id,categoria_id,transferencia_id,estorno_de,criado_por)
 VALUES(c.loja_id,c.id,p_data,p_valor,p_descricao,p_origem,p_origem_id,p_categoria,p_transferencia,p_estorno,auth.uid()) RETURNING id INTO v;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION internal.financeiro_movimento(uuid,date,numeric,text,text,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Espelha apenas baixas com conta definida. O recebimento em espécie continua exclusivamente no turno.
CREATE FUNCTION internal.financeiro_baixa_ledger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c uuid; v numeric; d date; cat uuid; l uuid; m public.movimentos_financeiros%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' AND OLD.conta_financeira_id IS NOT NULL AND (to_jsonb(OLD)-'movimentacao_caixa_id') IS DISTINCT FROM (to_jsonb(NEW)-'movimentacao_caixa_id') THEN
  RAISE EXCEPTION 'Baixa bancária imutável. Estorne pelo título de origem.';
 END IF;
 IF TG_TABLE_NAME='contas_pagar_pagamentos' THEN
  c:=NEW.conta_financeira_id; v:=-NEW.valor; d:=(NEW.data_pagamento AT TIME ZONE 'America/Sao_Paulo')::date;
  SELECT categoria_id,loja_id INTO cat,l FROM public.contas_pagar WHERE id=NEW.conta_id;
 ELSE
  c:=NEW.conta_financeira_id; v:=NEW.valor; d:=coalesce(NEW.data_efetiva,(NEW.created_at AT TIME ZONE 'America/Sao_Paulo')::date);
  SELECT categoria_id,loja_id INTO cat,l FROM public.contas_receber WHERE id=NEW.titulo_id;
 END IF;
 IF c IS NOT NULL AND (NEW.forma_pagamento='DINHEIRO' OR NOT EXISTS(SELECT 1 FROM public.contas_financeiras cf WHERE cf.id=c AND cf.loja_id=l AND cf.ativo) OR l IS DISTINCT FROM internal.financeiro_loja()) THEN
  RAISE EXCEPTION 'Conta bancária incompatível com a baixa.';
 END IF;
 IF NEW.operacao_tipo='ESTORNO' THEN
  SELECT * INTO m FROM public.movimentos_financeiros WHERE origem=TG_TABLE_NAME AND origem_id=NEW.operacao_origem_id;
  IF FOUND THEN PERFORM internal.financeiro_movimento(m.conta_financeira_id,(now() AT TIME ZONE 'America/Sao_Paulo')::date,-m.valor,coalesce(NEW.observacao,'Estorno'),TG_TABLE_NAME,NEW.id,m.categoria_id,NULL,m.id); END IF;
 ELSIF c IS NOT NULL AND (TG_OP='INSERT' OR OLD.conta_financeira_id IS NULL) THEN
  PERFORM internal.financeiro_movimento(c,d,v,coalesce(NEW.observacao,'Baixa financeira'),TG_TABLE_NAME,NEW.id,cat);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER financeiro_ap_ledger AFTER INSERT OR UPDATE ON public.contas_pagar_pagamentos FOR EACH ROW EXECUTE FUNCTION internal.financeiro_baixa_ledger();
CREATE TRIGGER financeiro_ar_ledger AFTER INSERT OR UPDATE ON public.liquidacoes_receber FOR EACH ROW EXECUTE FUNCTION internal.financeiro_baixa_ledger();
REVOKE ALL ON FUNCTION internal.financeiro_baixa_ledger() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION internal.financeiro_ledger_imutavel() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'Histórico financeiro imutável. Registre um estorno.'; END $$;
CREATE TRIGGER financeiro_ledger_imutavel BEFORE UPDATE OR DELETE ON public.movimentos_financeiros FOR EACH ROW EXECUTE FUNCTION internal.financeiro_ledger_imutavel();
REVOKE ALL ON FUNCTION internal.financeiro_ledger_imutavel() FROM PUBLIC,anon,authenticated;

-- Trigger adiado: pagamentos mistos e cabeçalho já estão completos no fim da transação.
CREATE FUNCTION internal.financeiro_capturar_venda() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.vendas%ROWTYPE; l uuid; p record;
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
  INSERT INTO public.financeiro_recebiveis_venda(loja_id,venda_id,pagamento_id,forma,bruto,previsao)
  VALUES(l,v.id,p.id,p.forma_pagamento,p.valor,CASE WHEN p.forma_pagamento='PIX' THEN (v.data AT TIME ZONE 'America/Sao_Paulo')::date END) ON CONFLICT DO NOTHING;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.vendas_pagamentos WHERE venda_id=v.id) AND v.forma_pagamento<>'DINHEIRO' THEN
  INSERT INTO public.financeiro_recebiveis_venda(loja_id,venda_id,forma,bruto,previsao)
  VALUES(l,v.id,v.forma_pagamento,v.total_liquido,CASE WHEN v.forma_pagamento='PIX' THEN (v.data AT TIME ZONE 'America/Sao_Paulo')::date END) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER financeiro_venda_captura AFTER INSERT OR UPDATE ON public.vendas DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION internal.financeiro_capturar_venda();
CREATE CONSTRAINT TRIGGER financeiro_split_captura AFTER INSERT ON public.vendas_pagamentos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION internal.financeiro_capturar_venda();
REVOKE ALL ON FUNCTION internal.financeiro_capturar_venda() FROM PUBLIC,anon,authenticated;

-- Dinheiro reembolsado já pertence ao cash. Crédito de cliente é abatimento do AR.
CREATE FUNCTION internal.financeiro_proporcao_reembolso(p_venda uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT least(coalesce((SELECT sum(d.valor) FROM public.devolucoes d
  LEFT JOIN public.venda_pos_venda_operacoes o ON o.id=d.operacao_id
  WHERE d.venda_id=p_venda AND d.forma_pagamento<>'DINHEIRO' AND d.caixa_desembolso_id IS NULL
   AND coalesce(o.forma_estorno,'')<>'CREDITO_CLIENTE'),0)
  /nullif((SELECT sum(r.bruto) FROM public.financeiro_recebiveis_venda r WHERE r.venda_id=p_venda),0),1)
$$;
REVOKE ALL ON FUNCTION internal.financeiro_proporcao_reembolso(uuid) FROM PUBLIC,anon,authenticated;

-- Diferença de acumulados distribui os centavos sem perda entre meios/parcelas.
CREATE FUNCTION internal.financeiro_reembolso_parcela(p_recebivel uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH partes AS (
  SELECT r.id,r.venda_id,r.bruto,sum(r.bruto) OVER(ORDER BY r.pagamento_id NULLS FIRST,r.parcela,r.id) AS acumulado
  FROM public.financeiro_recebiveis_venda r WHERE r.venda_id=(SELECT venda_id FROM public.financeiro_recebiveis_venda WHERE id=p_recebivel)
 ) SELECT coalesce(round(internal.financeiro_proporcao_reembolso(venda_id)*acumulado,2)-round(internal.financeiro_proporcao_reembolso(venda_id)*(acumulado-bruto),2),0)
 FROM partes WHERE id=p_recebivel
$$;
REVOKE ALL ON FUNCTION internal.financeiro_reembolso_parcela(uuid) FROM PUBLIC,anon,authenticated;

-- Pós-venda gera compensação, sem reescrever a receita recebida. Débitos podem ficar negativos após reembolso.
CREATE FUNCTION internal.financeiro_pos_venda() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v uuid; total numeric; devolvido numeric; r record; m public.movimentos_financeiros%ROWTYPE; alvo numeric; registrado numeric;
BEGIN
 IF TG_TABLE_NAME='vendas' THEN
  IF NEW.status<>'CANCELADA' THEN RETURN NEW; END IF; v:=NEW.id;
 ELSE v:=NEW.venda_id; END IF;
 SELECT total_liquido INTO total FROM public.vendas WHERE id=v;
 IF total<=0 THEN RETURN NEW; END IF;
 devolvido:=coalesce(internal.financeiro_proporcao_reembolso(v),0)*total;
 FOR r IN SELECT * FROM public.financeiro_recebiveis_venda WHERE venda_id=v ORDER BY id FOR UPDATE LOOP
  SELECT * INTO m FROM public.movimentos_financeiros WHERE id=r.recebimento_atual_id;
  IF FOUND THEN
   -- Reembolso devolve o bruto; a taxa original continua sendo despesa.
   alvo:=greatest(m.valor-round(r.bruto-coalesce(r.taxa,0)-internal.financeiro_reembolso_parcela(r.id),2),0);
   SELECT coalesce(-sum(valor),0) INTO registrado FROM public.movimentos_financeiros WHERE origem='AJUSTE_VENDA' AND descricao LIKE m.id::text||' %';
   IF alvo>registrado THEN PERFORM internal.financeiro_movimento(m.conta_financeira_id,(now() AT TIME ZONE 'America/Sao_Paulo')::date,-(alvo-registrado),m.id::text||' Reembolso pós-venda','AJUSTE_VENDA',gen_random_uuid(),m.categoria_id); END IF;
  END IF;
  IF devolvido>=total THEN UPDATE public.financeiro_recebiveis_venda SET status='CANCELADO' WHERE id=r.id; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER financeiro_cancelamento AFTER UPDATE ON public.vendas DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION internal.financeiro_pos_venda();
CREATE CONSTRAINT TRIGGER financeiro_devolucao AFTER INSERT ON public.devolucoes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION internal.financeiro_pos_venda();
REVOKE ALL ON FUNCTION internal.financeiro_pos_venda() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION internal.financeiro_estorno_caixa() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.movimentos_financeiros%ROWTYPE;
BEGIN
 IF NEW.movimentacao_origem_id IS NOT NULL AND NEW.status='aprovado' THEN
  SELECT * INTO m FROM public.movimentos_financeiros WHERE origem='TRANSFERENCIA_PDV' AND origem_id=NEW.movimentacao_origem_id;
  IF FOUND AND NOT EXISTS(SELECT 1 FROM public.movimentos_financeiros WHERE estorno_de=m.id) THEN
   PERFORM internal.financeiro_movimento(m.conta_financeira_id,(now() AT TIME ZONE 'America/Sao_Paulo')::date,-m.valor,'Estorno da transferência do PDV','ESTORNO_TRANSFERENCIA_PDV',NEW.id,NULL,NULL,m.id);
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER financeiro_estorno_caixa AFTER INSERT OR UPDATE OF status ON public.movimentacoes_caixa FOR EACH ROW EXECUTE FUNCTION internal.financeiro_estorno_caixa();
REVOKE ALL ON FUNCTION internal.financeiro_estorno_caixa() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.financeiro_comando(p_tipo text,p_dados jsonb,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l uuid:=internal.financeiro_loja(); u uuid:=auth.uid(); cmd public.financeiro_comandos%ROWTYPE;
 c public.contas_financeiras%ROWTYPE; c2 public.contas_financeiras%ROWTYPE; v_id uuid; cat uuid; valor numeric;
 d date; resultado jsonb; x record; i integer; n integer; lote uuid; base date; v_parcela numeric; venc date; taxa_parcela numeric; taxa_total numeric;
 r public.financeiro_recebiveis_venda%ROWTYPE; m public.movimentos_financeiros%ROWTYPE; e public.extratos_financeiros%ROWTYPE;
BEGIN
 IF p_request_id IS NULL OR p_dados IS NULL OR jsonb_typeof(p_dados)<>'object' THEN RAISE EXCEPTION 'Comando financeiro inválido.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(l::text,0));
 SELECT * INTO cmd FROM public.financeiro_comandos WHERE id=p_request_id;
 IF FOUND THEN
  IF cmd.loja_id<>l OR cmd.usuario_id<>u OR cmd.tipo<>p_tipo OR cmd.dados<>p_dados THEN RAISE EXCEPTION 'Repetição com dados diferentes.'; END IF;
  RETURN cmd.resultado;
 END IF;
 valor:=(p_dados->>'valor')::numeric; d:=(p_dados->>'data')::date; cat:=nullif(p_dados->>'categoria_id','')::uuid;
 IF valor IS NOT NULL AND (valor=0 OR (valor<0 AND p_tipo<>'CRIAR_CONTA') OR valor<>round(valor,2) OR valor::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Valor deve ser positivo com duas casas decimais (saldo inicial admite débito).'; END IF;
 IF cat IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.categorias_financeiras WHERE id=cat AND ativo) THEN RAISE EXCEPTION 'Categoria inválida.'; END IF;
 IF nullif(p_dados->>'conta_id','') IS NOT NULL THEN
  SELECT * INTO c FROM public.contas_financeiras WHERE id=(p_dados->>'conta_id')::uuid AND loja_id=l AND ativo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta financeira inválida para esta loja.'; END IF;
 END IF;
 CASE p_tipo
 WHEN 'CRIAR_CONTA' THEN
  IF d IS NULL OR d>(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Data inicial inválida.'; END IF;
  INSERT INTO public.contas_financeiras(loja_id,nome,tipo,data_inicial,criado_por) VALUES(l,btrim(p_dados->>'nome'),p_dados->>'tipo',d,u) RETURNING contas_financeiras.id INTO v_id;
  IF valor IS NOT NULL THEN PERFORM internal.financeiro_movimento(v_id,d,valor,'Saldo inicial','SALDO_INICIAL',p_request_id); END IF;
 WHEN 'CRIAR_AP' THEN
  IF valor IS NULL OR cat IS NULL OR length(btrim(coalesce(p_dados->>'descricao','')))<2 OR d IS NULL THEN RAISE EXCEPTION 'Descrição, valor, categoria e vencimento obrigatórios.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.categorias_financeiras WHERE categorias_financeiras.id=cat AND tipo IN ('DESPESA','AMBOS')) THEN RAISE EXCEPTION 'Selecione categoria de despesa.'; END IF;
  IF nullif(p_dados->>'fornecedor_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.fornecedores WHERE fornecedores.id=(p_dados->>'fornecedor_id')::uuid AND loja_id=l) THEN RAISE EXCEPTION 'Fornecedor de outra loja.'; END IF;
  IF nullif(p_dados->>'fornecedor_id','') IS NULL AND length(btrim(coalesce(p_dados->>'favorecido','')))<2 THEN RAISE EXCEPTION 'Informe o favorecido.'; END IF;
  n:=coalesce((p_dados->>'parcelas')::integer,1); IF n<1 OR n>60 THEN RAISE EXCEPTION 'Quantidade entre 1 e 60.'; END IF;
  lote:=p_request_id; base:=d; v_parcela:=trunc(valor/n,2);
  IF NOT coalesce((p_dados->>'recorrente')::boolean,false) AND v_parcela<=0 THEN RAISE EXCEPTION 'Valor insuficiente para a quantidade de parcelas.'; END IF;
  FOR i IN 1..n LOOP
   venc:=(date_trunc('month',base)+(i-1)*interval '1 month')::date;
   venc:=venc+least(extract(day FROM base)::integer,extract(day FROM venc+interval '1 month'-interval '1 day')::integer)-1;
   INSERT INTO public.contas_pagar(loja_id,fornecedor_id,favorecido,descricao,categoria_id,competencia,vencimento,valor_total,lote_id,parcela)
   VALUES(l,nullif(p_dados->>'fornecedor_id','')::uuid,nullif(btrim(p_dados->>'favorecido'),''),p_dados->>'descricao',cat,
    CASE WHEN coalesce((p_dados->>'recorrente')::boolean,false) THEN (coalesce((p_dados->>'competencia')::date,base)+(i-1)*interval '1 month')::date ELSE coalesce((p_dados->>'competencia')::date,base) END,venc,
    CASE WHEN coalesce((p_dados->>'recorrente')::boolean,false) THEN valor WHEN i=n THEN valor-v_parcela*(n-1) ELSE v_parcela END,lote,i) RETURNING contas_pagar.id INTO v_id;
  END LOOP;
 WHEN 'BAIXAR_AP' THEN
  IF c.id IS NULL OR valor IS NULL OR d IS NULL THEN RAISE EXCEPTION 'Conta, valor e data obrigatórios.'; END IF;
  IF coalesce((SELECT sum(mf.valor) FROM public.movimentos_financeiros mf WHERE conta_financeira_id=c.id),0)<valor THEN RAISE EXCEPTION 'Saldo insuficiente na conta financeira.'; END IF;
  SELECT * INTO x FROM public.registrar_pagamento_contas_pagar((p_dados->>'titulo_id')::uuid,valor,'TRANSF',(d::timestamp AT TIME ZONE 'America/Sao_Paulo'),p_dados->>'descricao',p_request_id::text,NULL,'FINANCEIRO_CONTAS',NULL);
  v_id:=x.pagamento_id;
  UPDATE public.contas_pagar_pagamentos SET conta_financeira_id=c.id WHERE contas_pagar_pagamentos.id=v_id;
 WHEN 'CRIAR_AR' THEN
  IF valor IS NULL OR cat IS NULL OR d IS NULL THEN RAISE EXCEPTION 'Valor, categoria e vencimento obrigatórios.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.clientes WHERE clientes.id=(p_dados->>'cliente_id')::uuid AND loja_id=l) THEN RAISE EXCEPTION 'Cliente de outra loja.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.categorias_financeiras WHERE categorias_financeiras.id=cat AND tipo IN ('RECEITA','AMBOS')) THEN RAISE EXCEPTION 'Selecione categoria de receita.'; END IF;
  INSERT INTO public.contas_receber(cliente_id,loja_id,descricao,valor_total,valor_aberto,vencimento,categoria_id,competencia)
  VALUES((p_dados->>'cliente_id')::uuid,l,p_dados->>'descricao',valor,valor,d,cat,coalesce((p_dados->>'competencia')::date,d)) RETURNING contas_receber.id INTO v_id;
 WHEN 'CLASSIFICAR_TITULO' THEN
  IF cat IS NULL THEN RAISE EXCEPTION 'Categoria obrigatória.'; END IF;
  IF p_dados->>'tipo'='AP' THEN
   IF NOT EXISTS(SELECT 1 FROM public.categorias_financeiras WHERE categorias_financeiras.id=cat AND tipo IN ('DESPESA','AMBOS')) THEN RAISE EXCEPTION 'Selecione despesa.'; END IF;
   UPDATE public.contas_pagar SET categoria_id=cat,competencia=coalesce(d,vencimento) WHERE contas_pagar.id=(p_dados->>'titulo_id')::uuid AND loja_id=l RETURNING contas_pagar.id INTO v_id;
  ELSIF p_dados->>'tipo'='AR' THEN
   IF NOT EXISTS(SELECT 1 FROM public.categorias_financeiras WHERE categorias_financeiras.id=cat AND tipo IN ('RECEITA','AMBOS')) THEN RAISE EXCEPTION 'Selecione receita.'; END IF;
   UPDATE public.contas_receber SET categoria_id=cat,competencia=coalesce(d,vencimento) WHERE contas_receber.id=(p_dados->>'titulo_id')::uuid AND loja_id=l RETURNING contas_receber.id INTO v_id;
  END IF;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Título não encontrado nesta loja.'; END IF;
 WHEN 'BAIXAR_AR' THEN
  IF c.id IS NULL OR valor IS NULL OR d IS NULL THEN RAISE EXCEPTION 'Conta, valor e data obrigatórios.'; END IF;
  SELECT * INTO x FROM public.registrar_liquidacao_receber((p_dados->>'titulo_id')::uuid,valor,'OUTROS',p_dados->>'descricao',p_request_id::text,NULL,'FINANCEIRO_CONTAS');
  v_id:=x.liquidacao_id;
  UPDATE public.liquidacoes_receber SET conta_financeira_id=c.id,data_efetiva=d WHERE liquidacoes_receber.id=v_id;
 WHEN 'TRANSFERIR' THEN
  SELECT * INTO c2 FROM public.contas_financeiras WHERE contas_financeiras.id=(p_dados->>'destino_id')::uuid AND loja_id=l AND ativo FOR UPDATE;
  IF c.id IS NULL OR c2.id IS NULL OR c.id=c2.id OR valor IS NULL THEN RAISE EXCEPTION 'Selecione origem e destino diferentes.'; END IF;
  IF coalesce((SELECT sum(mf.valor) FROM public.movimentos_financeiros mf WHERE conta_financeira_id=c.id),0)<valor THEN RAISE EXCEPTION 'Saldo insuficiente.'; END IF;
  PERFORM internal.financeiro_movimento(c.id,d,-valor,'Transferência para '||c2.nome,'TRANSFERENCIA',p_request_id,NULL,p_request_id);
  v_id:=internal.financeiro_movimento(c2.id,d,valor,'Transferência de '||c.nome,'TRANSFERENCIA',p_request_id,NULL,p_request_id);
 WHEN 'MOVIMENTO' THEN
  IF c.id IS NULL OR valor IS NULL OR cat IS NULL OR length(btrim(coalesce(p_dados->>'descricao','')))<2 OR coalesce(p_dados->>'direcao','') NOT IN ('ENTRADA','SAIDA') THEN RAISE EXCEPTION 'Preencha conta, categoria, direção, valor e descrição.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.categorias_financeiras WHERE categorias_financeiras.id=cat AND (tipo='AMBOS' OR tipo::text=CASE WHEN p_dados->>'direcao'='ENTRADA' THEN 'RECEITA' ELSE 'DESPESA' END)) THEN RAISE EXCEPTION 'Tipo da categoria incompatível.'; END IF;
  IF p_dados->>'direcao'='SAIDA' THEN valor:=-valor; END IF;
  v_id:=internal.financeiro_movimento(c.id,d,valor,p_dados->>'descricao','MANUAL',p_request_id,cat);
 WHEN 'VINCULAR_CAIXA' THEN
  SELECT mc.* INTO x FROM public.movimentacoes_caixa mc JOIN public.caixas cx ON cx.id=mc.caixa_id
   WHERE mc.id=(p_dados->>'movimento_id')::uuid AND cx.loja_id=l AND mc.status='aprovado' AND mc.deleted_at IS NULL
   AND mc.tipo IN ('sangria','suprimento') AND mc.forma_pagamento='dinheiro';
  IF NOT FOUND OR c.id IS NULL THEN RAISE EXCEPTION 'Selecione movimento de caixa aprovado e conta financeira.'; END IF;
  IF EXISTS(SELECT 1 FROM public.contas_pagar_pagamentos WHERE movimentacao_caixa_id=x.id) OR EXISTS(SELECT 1 FROM public.movimentos_financeiros WHERE origem='TRANSFERENCIA_PDV' AND origem_id=x.id) OR EXISTS(SELECT 1 FROM public.movimentacoes_caixa mc WHERE mc.movimentacao_origem_id=x.id AND mc.status='aprovado') THEN RAISE EXCEPTION 'Movimento já utilizado ou estornado.'; END IF;
  valor:=CASE WHEN x.tipo='sangria' THEN x.valor ELSE -x.valor END;
  IF valor<0 AND coalesce((SELECT sum(mf.valor) FROM public.movimentos_financeiros mf WHERE conta_financeira_id=c.id),0)<-valor THEN RAISE EXCEPTION 'Saldo insuficiente.'; END IF;
  v_id:=internal.financeiro_movimento(c.id,d,valor,'Transferência do caixa: '||x.tipo,'TRANSFERENCIA_PDV',x.id,NULL,p_request_id);
 WHEN 'ESTORNAR_MOVIMENTO' THEN
  SELECT * INTO m FROM public.movimentos_financeiros WHERE movimentos_financeiros.id=(p_dados->>'movimento_id')::uuid AND loja_id=l FOR UPDATE;
  IF NOT FOUND OR m.origem<>'MANUAL' OR length(btrim(coalesce(p_dados->>'descricao','')))<2 THEN RAISE EXCEPTION 'Estorne baixas e transferências pelo fluxo de origem; informe motivo.'; END IF;
  v_id:=internal.financeiro_movimento(m.conta_financeira_id,d,-m.valor,p_dados->>'descricao','ESTORNO_MANUAL',p_request_id,m.categoria_id,NULL,m.id);
 WHEN 'CONFIGURAR_RECEBIVEL' THEN
  SELECT * INTO r FROM public.financeiro_recebiveis_venda WHERE financeiro_recebiveis_venda.id=(p_dados->>'recebivel_id')::uuid AND loja_id=l FOR UPDATE;
  IF NOT FOUND OR r.status<>'PENDENTE' OR c.id IS NULL OR d IS NULL OR (p_dados->>'taxa')::numeric IS NULL THEN RAISE EXCEPTION 'Recebível pendente, conta, previsão e taxa obrigatórios.'; END IF;
  n:=coalesce((p_dados->>'parcelas')::integer,1); taxa_total:=(p_dados->>'taxa')::numeric;
  IF n NOT BETWEEN 1 AND 60 OR (n>1 AND r.parcelas<>1) OR taxa_total<0 OR taxa_total>r.bruto OR taxa_total<>round(taxa_total,2) OR taxa_total::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Parcelamento ou taxa inválidos. Configure parcelas existentes individualmente.'; END IF;
  v_parcela:=trunc(r.bruto/n,2); taxa_parcela:=trunc(taxa_total/n,2);
  IF v_parcela<=0 OR round((r.bruto-taxa_total)/n,2)<=0 THEN RAISE EXCEPTION 'Líquido de cada parcela deve ser positivo.'; END IF;
  UPDATE public.financeiro_recebiveis_venda SET bruto=CASE WHEN n>1 THEN v_parcela ELSE r.bruto END,taxa=CASE WHEN n>1 THEN taxa_parcela ELSE taxa_total END,parcelas=CASE WHEN n>1 THEN n ELSE r.parcelas END,previsao=d,conta_financeira_id=c.id,operadora=nullif(btrim(p_dados->>'operadora'),'') WHERE financeiro_recebiveis_venda.id=r.id;
  FOR i IN 2..n LOOP
   venc:=(date_trunc('month',d)+(i-1)*interval '1 month')::date;
   venc:=venc+least(extract(day FROM d)::integer,extract(day FROM venc+interval '1 month'-interval '1 day')::integer)-1;
   INSERT INTO public.financeiro_recebiveis_venda(loja_id,venda_id,pagamento_id,forma,bruto,taxa,operadora,previsao,conta_financeira_id,parcela,parcelas)
   VALUES(l,r.venda_id,r.pagamento_id,r.forma,CASE WHEN i=n THEN r.bruto-v_parcela*(n-1) ELSE v_parcela END,CASE WHEN i=n THEN taxa_total-taxa_parcela*(n-1) ELSE taxa_parcela END,nullif(btrim(p_dados->>'operadora'),''),venc,c.id,i,n);
  END LOOP;
  v_id:=r.id;
 WHEN 'RECEBER_VENDA' THEN
  SELECT * INTO r FROM public.financeiro_recebiveis_venda WHERE financeiro_recebiveis_venda.id=(p_dados->>'recebivel_id')::uuid AND loja_id=l FOR UPDATE;
  IF NOT FOUND OR r.status<>'PENDENTE' OR r.taxa IS NULL OR r.conta_financeira_id IS NULL THEN RAISE EXCEPTION 'Configure taxa, conta e previsão antes de receber.'; END IF;
  SELECT coalesce(internal.financeiro_proporcao_reembolso(v.id),0) AS proporcao INTO x FROM public.vendas v WHERE v.id=r.venda_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda cancelada.'; END IF;
  valor:=round(r.bruto-r.taxa-internal.financeiro_reembolso_parcela(r.id),2);
  IF valor<=0 THEN RAISE EXCEPTION 'Recebível integralmente devolvido.'; END IF;
  v_id:=internal.financeiro_movimento(r.conta_financeira_id,d,valor,'Venda '||r.venda_id::text||' '||r.forma||' parcela '||r.parcela,'RECEBIVEL_VENDA',p_request_id);
  UPDATE public.financeiro_recebiveis_venda SET status='RECEBIDO',recebimento_atual_id=v_id WHERE financeiro_recebiveis_venda.id=r.id;
 WHEN 'ESTORNAR_RECEBIVEL' THEN
  SELECT * INTO r FROM public.financeiro_recebiveis_venda WHERE financeiro_recebiveis_venda.id=(p_dados->>'recebivel_id')::uuid AND loja_id=l FOR UPDATE;
  SELECT * INTO m FROM public.movimentos_financeiros WHERE movimentos_financeiros.id=r.recebimento_atual_id;
  IF r.id IS NULL OR r.status<>'RECEBIDO' OR m.id IS NULL OR length(btrim(coalesce(p_dados->>'descricao','')))<2 THEN RAISE EXCEPTION 'Selecione depósito recebido e informe motivo.'; END IF;
  IF EXISTS(SELECT 1 FROM public.movimentos_financeiros mf WHERE mf.origem='AJUSTE_VENDA' AND mf.descricao LIKE m.id::text||' %') THEN RAISE EXCEPTION 'Depósito com reembolso posterior: confira o pós-venda antes da correção.'; END IF;
  v_id:=internal.financeiro_movimento(m.conta_financeira_id,d,-m.valor,p_dados->>'descricao','ESTORNO_RECEBIVEL',p_request_id,NULL,NULL,m.id);
  UPDATE public.financeiro_recebiveis_venda SET status='PENDENTE',recebimento_atual_id=NULL WHERE financeiro_recebiveis_venda.id=r.id;
 WHEN 'IMPORTAR_EXTRATO' THEN
  IF c.id IS NULL OR jsonb_typeof(p_dados->'linhas')<>'array' OR jsonb_array_length(p_dados->'linhas') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Extrato deve ter entre 1 e 500 linhas.'; END IF;
  FOR x IN SELECT value AS linha FROM jsonb_array_elements(p_dados->'linhas') LOOP
   IF length(btrim(coalesce(x.linha->>'referencia','')))<1 THEN RAISE EXCEPTION 'Referência bancária obrigatória.'; END IF;
   INSERT INTO public.extratos_financeiros(loja_id,conta_financeira_id,referencia,data,descricao,valor,criado_por)
   VALUES(l,c.id,x.linha->>'referencia',(x.linha->>'data')::date,x.linha->>'descricao',(x.linha->>'valor')::numeric,u) ON CONFLICT(conta_financeira_id,referencia) DO NOTHING RETURNING extratos_financeiros.id INTO v_id;
   IF v_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.extratos_financeiros ef WHERE ef.conta_financeira_id=c.id AND ef.referencia=x.linha->>'referencia' AND ef.data=(x.linha->>'data')::date AND ef.valor=(x.linha->>'valor')::numeric AND ef.descricao=x.linha->>'descricao') THEN RAISE EXCEPTION 'Referência bancária repetida com dados diferentes.'; END IF;
  END LOOP;
 WHEN 'CONCILIAR' THEN
  SELECT * INTO m FROM public.movimentos_financeiros WHERE movimentos_financeiros.id=(p_dados->>'movimento_id')::uuid AND loja_id=l;
  SELECT * INTO e FROM public.extratos_financeiros WHERE extratos_financeiros.id=(p_dados->>'extrato_id')::uuid AND loja_id=l;
  IF m.id IS NULL OR e.id IS NULL OR m.conta_financeira_id<>e.conta_financeira_id OR m.valor<>e.valor THEN RAISE EXCEPTION 'Conta e valor devem coincidir. Corrija a diferença antes de conciliar.'; END IF;
  IF length(btrim(coalesce(p_dados->>'descricao','')))<2 THEN RAISE EXCEPTION 'Informe observação da conferência.'; END IF;
  INSERT INTO public.conciliacoes_financeiras(loja_id,extrato_id,movimento_id,motivo,criado_por) VALUES(l,e.id,m.id,p_dados->>'descricao',u) RETURNING conciliacoes_financeiras.id INTO v_id;
 WHEN 'DESCONCILIAR' THEN
  IF length(btrim(coalesce(p_dados->>'descricao','')))<2 THEN RAISE EXCEPTION 'Informe motivo.'; END IF;
  UPDATE public.conciliacoes_financeiras SET desfeito_em=now(),desfeito_por=u,motivo_desfazer=p_dados->>'descricao' WHERE conciliacoes_financeiras.id=(p_dados->>'conciliacao_id')::uuid AND loja_id=l AND desfeito_em IS NULL RETURNING conciliacoes_financeiras.id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Conciliação não encontrada.'; END IF;
 ELSE RAISE EXCEPTION 'Operação financeira desconhecida.';
 END CASE;
 resultado:=jsonb_build_object('id',v_id,'ok',true);
 INSERT INTO public.financeiro_comandos VALUES(p_request_id,l,u,p_tipo,p_dados,resultado,now());
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.financeiro_comando(text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.financeiro_comando(text,jsonb,uuid) TO authenticated;

CREATE FUNCTION public.financeiro_painel(p_de date,p_ate date,p_pagina integer DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE l uuid:=internal.financeiro_loja(); hoje date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
 v_resultado jsonb; saldo numeric; pdv numeric; off integer:=greatest(coalesce(p_pagina,1)-1,0)*50;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário autenticado obrigatório.' USING ERRCODE='42501'; END IF;
 IF p_de IS NULL OR p_ate IS NULL OR p_de>p_ate OR p_ate-p_de>3660 OR p_pagina NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Período ou página inválidos.'; END IF;
 SELECT coalesce(sum(valor),0) INTO saldo FROM public.movimentos_financeiros WHERE loja_id=l;
 SELECT coalesce(sum(saldo_atual),0) INTO pdv FROM public.caixas WHERE loja_id=l AND status='ABERTO';
 v_resultado:=jsonb_build_object('hoje',hoje,'saldo',saldo,'saldo_pdv',pdv,'pagina',p_pagina);
 SELECT v_resultado||jsonb_build_object('contas',coalesce(jsonb_agg(to_jsonb(q)),'[]')) INTO v_resultado FROM (
  SELECT c.*,coalesce((SELECT sum(valor) FROM public.movimentos_financeiros m WHERE m.conta_financeira_id=c.id),0) AS saldo FROM public.contas_financeiras c WHERE loja_id=l ORDER BY nome
 ) q;
 SELECT v_resultado||jsonb_build_object('categorias',coalesce(jsonb_agg(to_jsonb(q)),'[]')) INTO v_resultado FROM (SELECT id,nome,tipo,ativo FROM public.categorias_financeiras ORDER BY nome) q;
 SELECT v_resultado||jsonb_build_object('clientes',coalesce(jsonb_agg(to_jsonb(q)),'[]')) INTO v_resultado FROM (SELECT id,nome FROM public.clientes WHERE loja_id=l ORDER BY nome LIMIT 1000) q;
 SELECT v_resultado||jsonb_build_object('fornecedores',coalesce(jsonb_agg(to_jsonb(q)),'[]')) INTO v_resultado FROM (SELECT id,nome FROM public.fornecedores WHERE loja_id=l ORDER BY nome LIMIT 1000) q;
 SELECT v_resultado||jsonb_build_object('pagar',coalesce(jsonb_agg(to_jsonb(q)),'[]')) INTO v_resultado FROM (
  SELECT cp.*,coalesce(f.nome,cp.favorecido,'Favorecido não informado') AS nome FROM public.contas_pagar cp LEFT JOIN public.fornecedores f ON f.id=cp.fornecedor_id WHERE cp.loja_id=l ORDER BY cp.vencimento,cp.id LIMIT 50 OFFSET off
 ) q;
 SELECT v_resultado||jsonb_build_object('receber',coalesce(jsonb_agg(to_jsonb(q)),'[]')) INTO v_resultado FROM (
  SELECT cr.*,cl.nome FROM public.contas_receber cr JOIN public.clientes cl ON cl.id=cr.cliente_id WHERE cr.loja_id=l ORDER BY cr.vencimento,cr.id LIMIT 50 OFFSET off
 ) q;
 SELECT v_resultado||jsonb_build_object('recebiveis',coalesce(jsonb_agg(to_jsonb(q)),'[]')) INTO v_resultado FROM (
  SELECT r.*,greatest(round(r.bruto-coalesce(r.taxa,0)-internal.financeiro_reembolso_parcela(r.id),2),0) AS liquido,
   coalesce((SELECT sum(valor) FROM public.devolucoes WHERE venda_id=r.venda_id),0)>0 AS devolucao
  FROM public.financeiro_recebiveis_venda r JOIN public.vendas v ON v.id=r.venda_id WHERE r.loja_id=l ORDER BY r.created_at DESC,r.id LIMIT 50 OFFSET off
 ) q;
 SELECT v_resultado||jsonb_build_object('movimentos',coalesce(jsonb_agg(to_jsonb(q)),'[]')) INTO v_resultado FROM (
  SELECT m.*,c.nome AS conta_nome,cat.nome AS categoria_nome,
   (SELECT id FROM public.conciliacoes_financeiras cc WHERE cc.movimento_id=m.id AND desfeito_em IS NULL) AS conciliacao_id,
   EXISTS(SELECT 1 FROM public.movimentos_financeiros e WHERE e.estorno_de=m.id) AS estornado
  FROM public.movimentos_financeiros m JOIN public.contas_financeiras c ON c.id=m.conta_financeira_id LEFT JOIN public.categorias_financeiras cat ON cat.id=m.categoria_id WHERE m.loja_id=l AND m.data BETWEEN p_de AND p_ate ORDER BY m.data DESC,m.created_at DESC,m.id LIMIT 50 OFFSET off
 ) q;
 SELECT v_resultado||jsonb_build_object('extratos',coalesce(jsonb_agg(to_jsonb(q)),'[]')) INTO v_resultado FROM (
  SELECT e.*,(SELECT id FROM public.conciliacoes_financeiras cc WHERE cc.extrato_id=e.id AND desfeito_em IS NULL) AS conciliacao_id
  FROM public.extratos_financeiros e WHERE e.loja_id=l AND e.data BETWEEN p_de AND p_ate ORDER BY e.data DESC,e.id LIMIT 50 OFFSET off
 ) q;
 SELECT v_resultado||jsonb_build_object('movimentos_caixa',coalesce(jsonb_agg(to_jsonb(q)),'[]')) INTO v_resultado FROM (
  SELECT mc.id,mc.tipo,mc.valor,mc.caixa_id FROM public.movimentacoes_caixa mc JOIN public.caixas c ON c.id=mc.caixa_id
  WHERE c.loja_id=l AND mc.status='aprovado' AND mc.deleted_at IS NULL AND mc.tipo IN ('sangria','suprimento') AND mc.forma_pagamento='dinheiro'
   AND NOT EXISTS(SELECT 1 FROM public.contas_pagar_pagamentos WHERE movimentacao_caixa_id=mc.id)
   AND NOT EXISTS(SELECT 1 FROM public.movimentos_financeiros WHERE origem='TRANSFERENCIA_PDV' AND origem_id=mc.id)
   AND NOT EXISTS(SELECT 1 FROM public.movimentacoes_caixa e WHERE e.movimentacao_origem_id=mc.id AND e.status='aprovado')
  ORDER BY mc.created_at DESC LIMIT 100
 ) q;
 SELECT v_resultado||jsonb_build_object('contagens',jsonb_build_object(
  'pagar',(SELECT count(*) FROM public.contas_pagar WHERE loja_id=l),
  'receber',(SELECT count(*) FROM public.contas_receber WHERE loja_id=l),
  'recebiveis',(SELECT count(*) FROM public.financeiro_recebiveis_venda WHERE loja_id=l),
  'movimentos',(SELECT count(*) FROM public.movimentos_financeiros WHERE loja_id=l AND data BETWEEN p_de AND p_ate),
  'extratos',(SELECT count(*) FROM public.extratos_financeiros WHERE loja_id=l AND data BETWEEN p_de AND p_ate))) INTO v_resultado;
 WITH agenda AS (
  SELECT vencimento AS dia,-(valor_total-valor_pago) AS valor FROM public.contas_pagar WHERE loja_id=l AND status NOT IN ('PAGO','CANCELADO')
  UNION ALL SELECT vencimento,valor_aberto FROM public.contas_receber WHERE loja_id=l AND valor_aberto>0 AND status<>'CANCELADO'
  UNION ALL SELECT r.previsao,greatest(round(r.bruto-r.taxa-internal.financeiro_reembolso_parcela(r.id),2),0)
   FROM public.financeiro_recebiveis_venda r JOIN public.vendas v ON v.id=r.venda_id WHERE r.loja_id=l AND r.status='PENDENTE' AND r.taxa IS NOT NULL
 ), dias AS (SELECT hoje+i AS dia FROM generate_series(0,90) i), totais AS (
  SELECT d.dia,coalesce(sum(a.valor) FILTER(WHERE a.valor>0),0) entradas,coalesce(-sum(a.valor) FILTER(WHERE a.valor<0),0) saidas
  FROM dias d LEFT JOIN agenda a ON a.dia IS NOT NULL AND greatest(a.dia,hoje)=d.dia GROUP BY d.dia
 ) SELECT v_resultado||jsonb_build_object('fluxo',jsonb_agg(to_jsonb(q) ORDER BY q.dia)) INTO v_resultado FROM (
  SELECT dia,entradas,saidas,saldo+pdv+sum(entradas-saidas) OVER(ORDER BY dia) AS saldo FROM totais
 ) q;
 SELECT v_resultado||jsonb_build_object('alertas',jsonb_build_object(
  'sem_previsao',(SELECT count(*) FROM public.financeiro_recebiveis_venda WHERE loja_id=l AND status='PENDENTE' AND (previsao IS NULL OR taxa IS NULL)),
  'ar_sem_vencimento',(SELECT count(*) FROM public.contas_receber WHERE loja_id=l AND valor_aberto>0 AND vencimento IS NULL),
  'caixas_incompletos',(SELECT count(*) FROM public.caixas WHERE loja_id=l AND status='FECHADO' AND (data_fechamento IS NULL OR valor_fechamento IS NULL OR fechamento_diferenca IS NULL)),
  'sem_categoria',(SELECT count(*) FROM public.contas_pagar WHERE loja_id=l AND categoria_id IS NULL AND status<>'CANCELADO'))) INTO v_resultado;
 SELECT v_resultado||jsonb_build_object('resultado_caixa',coalesce(jsonb_agg(to_jsonb(q)),'[]')) INTO v_resultado FROM (
  SELECT coalesce(c.nome,'Sem categoria') AS categoria,
   coalesce(sum(m.valor) FILTER(WHERE m.valor>0),0) AS entradas,coalesce(-sum(m.valor) FILTER(WHERE m.valor<0),0) AS saidas,sum(m.valor) AS resultado
  FROM public.movimentos_financeiros m LEFT JOIN public.categorias_financeiras c ON c.id=m.categoria_id
  WHERE m.loja_id=l AND m.data BETWEEN p_de AND p_ate AND m.origem NOT IN ('SALDO_INICIAL','TRANSFERENCIA','TRANSFERENCIA_PDV') GROUP BY c.nome ORDER BY c.nome
 ) q;
 WITH vendas_periodo AS (
  SELECT v.id,greatest(v.total_liquido-coalesce((SELECT sum(d.valor) FROM public.devolucoes d WHERE d.venda_id=v.id),0),0) AS receita
  FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id
  WHERE c.loja_id=l AND v.status='CONCLUIDA' AND (v.data AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate
 ), itens AS (
  SELECT iv.custo_unitario_snap,greatest(iv.quantidade-coalesce((SELECT sum(pi.quantidade) FROM public.venda_pos_venda_itens pi WHERE pi.item_venda_id=iv.id),0),0) AS quantidade
  FROM public.itens_venda iv JOIN vendas_periodo v ON v.id=iv.venda_id
 ) SELECT v_resultado||jsonb_build_object('resultado_gerencial',jsonb_build_object(
  'receita_vendas',coalesce((SELECT sum(receita) FROM vendas_periodo),0),
  'custo_conhecido',coalesce((SELECT sum(custo_unitario_snap*quantidade) FROM itens),0),
  'itens_sem_custo',(SELECT count(*) FROM itens WHERE custo_unitario_snap IS NULL AND quantidade>0),
  'despesas_manuais',coalesce((SELECT sum(cp.valor_total) FROM public.contas_pagar cp WHERE cp.loja_id=l AND cp.nfe_importacao_id IS NULL AND cp.status<>'CANCELADO' AND cp.competencia BETWEEN p_de AND p_ate),0),
  'taxas_conferidas',coalesce((SELECT sum(r.taxa) FROM public.financeiro_recebiveis_venda r JOIN vendas_periodo v ON v.id=r.venda_id),0),
  'taxas_pendentes',(SELECT count(*) FROM public.financeiro_recebiveis_venda r JOIN vendas_periodo v ON v.id=r.venda_id WHERE r.taxa IS NULL)
 )) INTO v_resultado;
 RETURN v_resultado;
END $$;
REVOKE ALL ON FUNCTION public.financeiro_painel(date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.financeiro_painel(date,date,integer) TO authenticated;

CREATE FUNCTION public.financeiro_candidatos_conciliacao(p_extrato uuid,p_busca text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE l uuid:=internal.financeiro_loja(); e public.extratos_financeiros%ROWTYPE; r jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário autenticado obrigatório.' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.extratos_financeiros WHERE id=p_extrato AND loja_id=l;
 IF NOT FOUND OR length(coalesce(p_busca,''))>120 THEN RAISE EXCEPTION 'Extrato ou busca inválidos.'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO r FROM (
  SELECT m.id,m.data,m.descricao,m.valor FROM public.movimentos_financeiros m
  WHERE m.loja_id=l AND m.conta_financeira_id=e.conta_financeira_id AND m.valor=e.valor
   AND m.descricao ILIKE '%'||coalesce(p_busca,'')||'%'
   AND NOT EXISTS(SELECT 1 FROM public.conciliacoes_financeiras cc WHERE cc.movimento_id=m.id AND cc.desfeito_em IS NULL)
  ORDER BY abs(m.data-e.data),m.id LIMIT 100
 ) q;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.financeiro_candidatos_conciliacao(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.financeiro_candidatos_conciliacao(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
