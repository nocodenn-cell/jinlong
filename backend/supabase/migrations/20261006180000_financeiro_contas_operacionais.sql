-- Contas operacionais: defaults por forma (somente novas operações).
-- Dinheiro permanece no caixa/PDV. PIX liquida no banco padrão. Cartões ficam a receber.
-- Não recalcula nem relança histórico.
BEGIN;
CREATE SCHEMA IF NOT EXISTS internal;

CREATE TABLE IF NOT EXISTS public.financeiro_contas_forma (
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  forma_pagamento text NOT NULL CHECK (forma_pagamento IN ('DINHEIRO','PIX','CARTAO_CREDITO','CARTAO_DEBITO')),
  conta_financeira_id uuid REFERENCES public.contas_financeiras(id),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.usuarios(id),
  PRIMARY KEY (loja_id, forma_pagamento)
);

ALTER TABLE public.financeiro_contas_forma ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financeiro_contas_forma FROM anon, authenticated;
GRANT SELECT ON public.financeiro_contas_forma TO authenticated;
DROP POLICY IF EXISTS financeiro_contas_forma_leitura ON public.financeiro_contas_forma;
CREATE POLICY financeiro_contas_forma_leitura ON public.financeiro_contas_forma FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.usuarios u
  WHERE u.id = (SELECT auth.uid()) AND u.ativo AND u.perfil IN ('GERENTE','DONO','ADMIN')
    AND u.loja_id = financeiro_contas_forma.loja_id
));

ALTER TABLE public.caixas ADD COLUMN IF NOT EXISTS conta_financeira_id uuid REFERENCES public.contas_financeiras(id);
COMMENT ON COLUMN public.caixas.conta_financeira_id IS
  'Conta financeira associada ao turno (opcional). Turnos históricos exigem vínculo explícito; não relança saldo.';
COMMENT ON TABLE public.financeiro_contas_forma IS
  'Conta padrão por loja/forma. Vale só para novas operações; não reconstrói saldos históricos.';

CREATE OR REPLACE FUNCTION internal.financeiro_conta_forma(p_loja uuid, p_forma text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.conta_financeira_id
  FROM public.financeiro_contas_forma f
  JOIN public.contas_financeiras c ON c.id = f.conta_financeira_id
  WHERE f.loja_id = p_loja AND f.forma_pagamento = p_forma AND c.ativo AND c.loja_id = p_loja
$$;
REVOKE ALL ON FUNCTION internal.financeiro_conta_forma(uuid, text) FROM PUBLIC, anon, authenticated;

-- Comandos operacionais novos (não reescreve o financeiro_comando legado).
CREATE OR REPLACE FUNCTION public.financeiro_comando_operacional(p_tipo text, p_dados jsonb, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l uuid := internal.financeiro_loja();
  u uuid := auth.uid();
  cmd public.financeiro_comandos%ROWTYPE;
  c public.contas_financeiras%ROWTYPE;
  v_id uuid;
  forma text;
  resultado jsonb;
BEGIN
  IF p_request_id IS NULL OR p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN
    RAISE EXCEPTION 'Comando financeiro inválido.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(l::text, 0));
  SELECT * INTO cmd FROM public.financeiro_comandos WHERE id = p_request_id;
  IF FOUND THEN
    IF cmd.loja_id <> l OR cmd.usuario_id <> u OR cmd.tipo <> p_tipo OR cmd.dados <> p_dados THEN
      RAISE EXCEPTION 'Repetição com dados diferentes.';
    END IF;
    RETURN cmd.resultado;
  END IF;

  IF nullif(p_dados->>'conta_id', '') IS NOT NULL THEN
    IF p_tipo = 'ALTERAR_CONTA' THEN
      SELECT * INTO c FROM public.contas_financeiras
      WHERE id = (p_dados->>'conta_id')::uuid AND loja_id = l FOR UPDATE;
    ELSE
      SELECT * INTO c FROM public.contas_financeiras
      WHERE id = (p_dados->>'conta_id')::uuid AND loja_id = l AND ativo FOR UPDATE;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'Conta financeira inválida para esta loja.'; END IF;
  END IF;

  CASE p_tipo
  WHEN 'ALTERAR_CONTA' THEN
    IF c.id IS NULL THEN RAISE EXCEPTION 'Conta financeira inválida para esta loja.'; END IF;
    UPDATE public.contas_financeiras SET
      nome = coalesce(nullif(btrim(p_dados->>'nome'), ''), nome),
      ativo = coalesce((p_dados->>'ativo')::boolean, ativo)
    WHERE id = c.id RETURNING id INTO v_id;
  WHEN 'CONFIGURAR_CONTA_FORMA' THEN
    forma := upper(btrim(coalesce(p_dados->>'forma_pagamento', '')));
    IF forma NOT IN ('DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO') THEN
      RAISE EXCEPTION 'Forma de pagamento inválida.';
    END IF;
    IF forma = 'DINHEIRO' THEN
      IF c.id IS NOT NULL AND c.tipo <> 'RESERVA' THEN
        RAISE EXCEPTION 'Dinheiro deve mapear para reserva de numerário ou ficar sem conta (gaveta do PDV).';
      END IF;
    ELSIF c.id IS NULL OR c.tipo <> 'BANCO' THEN
      RAISE EXCEPTION 'PIX e cartões devem mapear para conta bancária ativa.';
    END IF;
    INSERT INTO public.financeiro_contas_forma(loja_id, forma_pagamento, conta_financeira_id, atualizado_por)
    VALUES (l, forma, c.id, u)
    ON CONFLICT (loja_id, forma_pagamento) DO UPDATE
      SET conta_financeira_id = EXCLUDED.conta_financeira_id,
          atualizado_em = now(),
          atualizado_por = u;
    v_id := c.id;
  WHEN 'VINCULAR_TURNO_CONTA' THEN
    IF c.id IS NULL OR c.tipo <> 'RESERVA' THEN
      RAISE EXCEPTION 'Associe o turno a uma reserva de numerário.';
    END IF;
    UPDATE public.caixas SET conta_financeira_id = c.id
    WHERE id = (p_dados->>'caixa_id')::uuid AND loja_id = l AND conta_financeira_id IS NULL
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Turno não encontrado ou já associado.'; END IF;
  ELSE
    RAISE EXCEPTION 'Operação operacional desconhecida.';
  END CASE;

  resultado := jsonb_build_object('id', v_id, 'ok', true);
  INSERT INTO public.financeiro_comandos VALUES (p_request_id, l, u, p_tipo, p_dados, resultado, now());
  RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.financeiro_comando_operacional(text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_comando_operacional(text, jsonb, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION internal.financeiro_capturar_venda() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.vendas%ROWTYPE;
  l uuid;
  p record;
  conta uuid;
  dia date;
  mov uuid;
BEGIN
  IF TG_TABLE_NAME = 'vendas' THEN SELECT * INTO v FROM public.vendas WHERE id = NEW.id;
  ELSE SELECT * INTO v FROM public.vendas WHERE id = NEW.venda_id; END IF;
  IF v.status <> 'CONCLUIDA' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'vendas' THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.status = 'CONCLUIDA' THEN RETURN NEW; END IF;
    END IF;
  END IF;
  SELECT loja_id INTO l FROM public.caixas WHERE id = v.caixa_id;
  IF l IS NULL THEN RETURN NEW; END IF;
  dia := (v.data AT TIME ZONE 'America/Sao_Paulo')::date;

  FOR p IN
    SELECT id, forma_pagamento, valor
    FROM public.vendas_pagamentos
    WHERE venda_id = v.id AND forma_pagamento <> 'DINHEIRO'
  LOOP
    conta := internal.financeiro_conta_forma(l, p.forma_pagamento);
    INSERT INTO public.financeiro_recebiveis_venda(
      loja_id, venda_id, pagamento_id, forma, bruto, previsao, conta_financeira_id, taxa
    ) VALUES (
      l, v.id, p.id, p.forma_pagamento, p.valor,
      CASE WHEN p.forma_pagamento = 'PIX' THEN dia ELSE NULL END,
      conta,
      CASE WHEN p.forma_pagamento = 'PIX' AND conta IS NOT NULL THEN 0 ELSE NULL END
    ) ON CONFLICT DO NOTHING;

    IF p.forma_pagamento = 'PIX' AND conta IS NOT NULL THEN
      SELECT r.id INTO mov FROM public.financeiro_recebiveis_venda r
      WHERE r.pagamento_id = p.id AND r.parcela = 1 AND r.status = 'PENDENTE' AND r.recebimento_atual_id IS NULL
      FOR UPDATE;
      IF FOUND THEN
        UPDATE public.financeiro_recebiveis_venda
        SET status = 'RECEBIDO',
            recebimento_atual_id = internal.financeiro_movimento(
              conta, dia, p.valor, 'Venda '||v.id::text||' PIX automática', 'RECEBIVEL_VENDA', mov
            ),
            taxa = 0, previsao = dia, conta_financeira_id = conta
        WHERE id = mov AND status = 'PENDENTE';
      END IF;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.vendas_pagamentos WHERE venda_id = v.id)
     AND v.forma_pagamento <> 'DINHEIRO' THEN
    conta := internal.financeiro_conta_forma(l, v.forma_pagamento);
    INSERT INTO public.financeiro_recebiveis_venda(
      loja_id, venda_id, forma, bruto, previsao, conta_financeira_id, taxa
    ) VALUES (
      l, v.id, v.forma_pagamento, v.total_liquido,
      CASE WHEN v.forma_pagamento = 'PIX' THEN dia ELSE NULL END,
      conta,
      CASE WHEN v.forma_pagamento = 'PIX' AND conta IS NOT NULL THEN 0 ELSE NULL END
    ) ON CONFLICT DO NOTHING;
    IF v.forma_pagamento = 'PIX' AND conta IS NOT NULL THEN
      SELECT r.id INTO mov FROM public.financeiro_recebiveis_venda r
      WHERE r.venda_id = v.id AND r.pagamento_id IS NULL AND r.parcela = 1
        AND r.status = 'PENDENTE' AND r.recebimento_atual_id IS NULL
      FOR UPDATE;
      IF FOUND THEN
        UPDATE public.financeiro_recebiveis_venda
        SET status = 'RECEBIDO',
            recebimento_atual_id = internal.financeiro_movimento(
              conta, dia, v.total_liquido, 'Venda '||v.id::text||' PIX automática', 'RECEBIVEL_VENDA', mov
            ),
            taxa = 0, previsao = dia, conta_financeira_id = conta
        WHERE id = mov AND status = 'PENDENTE';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Injeta contas_forma e usuario no painel sem reescrever o restante.
DO $$
DECLARE
  fonte text;
  injecao text := $i$
 SELECT v_resultado||jsonb_build_object('contas_forma',coalesce(jsonb_agg(to_jsonb(q)),'[]')) INTO v_resultado FROM (
  SELECT f.forma_pagamento, f.conta_financeira_id, c.nome AS conta_nome, c.tipo AS conta_tipo
  FROM public.financeiro_contas_forma f
  LEFT JOIN public.contas_financeiras c ON c.id = f.conta_financeira_id
  WHERE f.loja_id=l ORDER BY f.forma_pagamento
 ) q;
$i$;
  marca text := $m$SELECT v_resultado||jsonb_build_object('categorias'$m$;
BEGIN
  SELECT pg_get_functiondef('public.financeiro_painel(date,date,integer)'::regprocedure) INTO fonte;
  IF strpos(fonte, 'contas_forma') > 0 THEN
    RAISE NOTICE 'financeiro_painel já expõe contas_forma';
    RETURN;
  END IF;
  IF strpos(fonte, marca) = 0 THEN
    RAISE EXCEPTION 'Financeiro: não foi possível localizar ponto de injeção de contas_forma no painel.';
  END IF;
  fonte := replace(fonte, marca, injecao || ' ' || marca);
  -- Extrato: incluir nome do usuário quando a projeção de movimentos ainda não o traz.
  IF strpos(fonte, 'usuario_nome') = 0 THEN
    fonte := replace(
      fonte,
      'SELECT m.*,c.nome AS conta_nome,cat.nome AS categoria_nome,',
      'SELECT m.*,c.nome AS conta_nome,cat.nome AS categoria_nome,u.nome AS usuario_nome,'
    );
    fonte := replace(
      fonte,
      'FROM public.movimentos_financeiros m JOIN public.contas_financeiras c ON c.id=m.conta_financeira_id LEFT JOIN public.categorias_financeiras cat ON cat.id=m.categoria_id WHERE m.loja_id=l',
      'FROM public.movimentos_financeiros m JOIN public.contas_financeiras c ON c.id=m.conta_financeira_id LEFT JOIN public.categorias_financeiras cat ON cat.id=m.categoria_id LEFT JOIN public.usuarios u ON u.id=m.criado_por WHERE m.loja_id=l'
    );
  END IF;
  EXECUTE fonte;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
