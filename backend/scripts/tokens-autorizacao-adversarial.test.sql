-- Ataques adversariais ao contrato de autorizacao tipada (SANGRIA / AP).
--
-- A) token de AP-A usado em AP-B
-- B) token de uma idempotency key usado com outra
-- C) ESCALADA DE VALOR: token aprovado para R$ 2,00 tentando efetivar R$ 4.900,00.
--    Era aceito ate o valor entrar na identidade do alvo.
-- C2) o mesmo token no valor aprovado continua funcionando (sem falso positivo)
-- D) TOCTOU: `authenticated` tentando alterar o valor de uma movimentacao
--    pendente entre a emissao e o consumo do token
--
-- Roda em transacao e faz ROLLBACK: nao deixa residuo.

\set ON_ERROR_STOP on
BEGIN;

SELECT p.loja_id AS loja FROM public.produtos p
WHERE p.preco_varejo > 0
  AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.loja_id = p.loja_id AND u.ativo AND u.perfil = 'GERENTE')
  AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.loja_id = p.loja_id AND u.ativo AND u.perfil = 'OPERADOR')
ORDER BY p.loja_id, p.id LIMIT 1 \gset
SELECT id AS gerente_id FROM public.usuarios WHERE perfil='GERENTE' AND ativo AND loja_id=:'loja' LIMIT 1 \gset
SELECT id AS operador_id FROM public.usuarios WHERE perfil='OPERADOR' AND ativo AND loja_id=:'loja' LIMIT 1 \gset

UPDATE public.caixas SET status='FECHADO' WHERE loja_id=:'loja'::uuid AND status='ABERTO';
INSERT INTO public.caixas(operador_id, loja_id, status, valor_inicial) VALUES (NULL, :'loja', 'ABERTO', 0);
SELECT id AS caixa FROM public.caixas WHERE loja_id=:'loja' AND status='ABERTO' LIMIT 1 \gset
UPDATE public.caixas SET valor_inicial=100000, saldo_atual=100000 WHERE id=:'caixa';
UPDATE public.pdv_config SET limite_sangria_sem_gerente = 1 WHERE id = 1;

SELECT gen_random_uuid() AS fornecedor, gen_random_uuid() AS conta_a, gen_random_uuid() AS conta_b \gset
INSERT INTO public.fornecedores(id, cnpj, nome, loja_id)
VALUES (:'fornecedor', 'ADV-' || left(:'fornecedor',10), 'Fornecedor adversarial', :'loja');
INSERT INTO public.contas_pagar(id, fornecedor_id, loja_id, vencimento, valor_total, valor_pago, descricao)
VALUES (:'conta_a', :'fornecedor', :'loja', current_date, 5000, 0, 'Conta A'),
       (:'conta_b', :'fornecedor', :'loja', current_date, 5000, 0, 'Conta B');

SELECT set_config('request.jwt.claim.sub', :'gerente_id', true);
SELECT set_config('t.caixa', :'caixa', true);
SELECT set_config('t.conta_a', :'conta_a', true);
SELECT set_config('t.conta_b', :'conta_b', true);
SELECT set_config('t.gerente', :'gerente_id', true);

-- Token emitido para a operacao AP-A (conta_a + chave k1), valor "mostrado" = 2.
INSERT INTO public.tokens_autorizacao_operacao(token, finalidade, alvo_id, loja_id, gerente_id, solicitante_id, expira_em)
VALUES ('adv_ap_a', 'PAGAMENTO_AP', 'ap:' || :'conta_a' || ':k1:2.00', :'loja', :'gerente_id', :'gerente_id', now() + interval '10 min'),
       ('adv_ap_esc', 'PAGAMENTO_AP', 'ap:' || :'conta_a' || ':kesc:2.00', :'loja', :'gerente_id', :'gerente_id', now() + interval '10 min');

SET LOCAL ROLE authenticated;

\echo ''
\echo '=== A) token AP-A usado no pagamento AP-B ==='
DO $$ DECLARE r record; BEGIN
  BEGIN
    SELECT * INTO r FROM public.registrar_pagamento_contas_pagar(
      current_setting('t.conta_b')::uuid, 2, 'DINHEIRO', now(), NULL, 'k1',
      current_setting('t.caixa')::uuid, 'TESTE_DB', 'adv_ap_a');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS  DENY  token AP-A -> pagamento AP-B (%)', SQLERRM; RETURN;
  END;
  RAISE EXCEPTION 'FALHOU: token de AP-A pagou AP-B';
END $$;

\echo ''
\echo '=== B) token AP-A (chave k1) usado com outra idempotency key ==='
DO $$ DECLARE r record; BEGIN
  BEGIN
    SELECT * INTO r FROM public.registrar_pagamento_contas_pagar(
      current_setting('t.conta_a')::uuid, 2, 'DINHEIRO', now(), NULL, 'k9',
      current_setting('t.caixa')::uuid, 'TESTE_DB', 'adv_ap_a');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS  DENY  token(k1) -> pagamento(k9) (%)', SQLERRM; RETURN;
  END;
  RAISE EXCEPTION 'FALHOU: token da chave k1 pagou com chave k9';
END $$;

\echo ''
\echo '=== C) ESCALADA DE VALOR: token emitido p/ conta_a:kesc, pagamento de 4900 ==='
DO $$ DECLARE r record; v_valor numeric; BEGIN
  BEGIN
    SELECT * INTO r FROM public.registrar_pagamento_contas_pagar(
      current_setting('t.conta_a')::uuid, 4900, 'DINHEIRO', now(), NULL, 'kesc',
      current_setting('t.caixa')::uuid, 'TESTE_DB', 'adv_ap_esc');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS  DENY  escalada de valor bloqueada (%)', SQLERRM; RETURN;
  END;
  SELECT valor INTO v_valor FROM public.movimentacoes_caixa WHERE id = r.movimentacao_caixa_id;
  RAISE EXCEPTION 'FALHOU: escalada aceita, pagamento de % efetivado', v_valor;
END $$;

\echo ''
\echo '=== C2) valor exatamente o aprovado (2.00) -> deve PASSAR ==='
DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM public.registrar_pagamento_contas_pagar(
    current_setting('t.conta_a')::uuid, 2, 'DINHEIRO', now(), NULL, 'kesc',
    current_setting('t.caixa')::uuid, 'TESTE_DB', 'adv_ap_esc');
  IF (SELECT status FROM public.movimentacoes_caixa WHERE id = r.movimentacao_caixa_id) <> 'aprovado' THEN
    RAISE EXCEPTION 'FALHOU: pagamento legitimo nao aprovado';
  END IF;
  RAISE NOTICE 'PASS  ALLOW pagamento AP no valor aprovado';
END $$;

\echo ''
\echo '=== D) TOCTOU sangria: authenticated consegue mutar movimentacao pendente? ==='
RESET ROLE;
SELECT gen_random_uuid() AS mov_id \gset
INSERT INTO public.movimentacoes_caixa(id, caixa_id, operador_id, tipo, forma_pagamento, valor, motivo, status, idempotency_key)
VALUES (:'mov_id', :'caixa', :'operador_id', 'sangria', 'dinheiro', 10, 'teste toctou', 'pendente', 'toctou-1');
SELECT set_config('t.mov', :'mov_id', true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; BEGIN
  UPDATE public.movimentacoes_caixa SET valor = 9999 WHERE id = current_setting('t.mov')::uuid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    RAISE WARNING 'MUTAVEL  authenticated alterou valor da movimentacao pendente (% linha)', n;
  ELSE
    RAISE NOTICE 'PASS  DENY  authenticated nao altera movimentacao pendente (RLS)';
  END IF;
EXCEPTION WHEN insufficient_privilege OR others THEN
  RAISE NOTICE 'PASS  DENY  authenticated nao altera movimentacao pendente (%)', SQLERRM;
END $$;

\echo ''
\echo '=== E) ROLLBACK AP com token JA CONSUMIDO: nada pode sobrar ==='
RESET ROLE;
-- Falha controlada logo apos a movimentacao ser criada/aprovada.
CREATE FUNCTION pg_temp.falha_ap() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.idempotency_key LIKE '%:krb' THEN RAISE EXCEPTION 'FALHA_CONTROLADA_AP'; END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER t_falha_ap AFTER INSERT ON public.movimentacoes_caixa
FOR EACH ROW EXECUTE FUNCTION pg_temp.falha_ap();

INSERT INTO public.tokens_autorizacao_operacao(token, finalidade, alvo_id, loja_id, gerente_id, solicitante_id, expira_em)
VALUES ('adv_ap_rb', 'PAGAMENTO_AP', 'ap:' || current_setting('t.conta_b') || ':krb:30.00',
        (SELECT loja_id FROM public.contas_pagar WHERE id = current_setting('t.conta_b')::uuid),
        current_setting('t.gerente')::uuid, current_setting('t.gerente')::uuid, now() + interval '10 min');

-- Variavel de sessao, nao variavel do psql: `:'x'` nao e interpolado dentro de $$.
SELECT set_config('t.saldo_antes',
  (SELECT saldo_atual::text FROM public.caixas WHERE id = current_setting('t.caixa')::uuid), true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE r record; BEGIN
  BEGIN
    SELECT * INTO r FROM public.registrar_pagamento_contas_pagar(
      current_setting('t.conta_b')::uuid, 30, 'DINHEIRO', now(), NULL, 'krb',
      current_setting('t.caixa')::uuid, 'TESTE_DB', 'adv_ap_rb');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%FALHA_CONTROLADA_AP%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
DO $$ DECLARE v_usado boolean; v_saldo numeric; BEGIN
  SELECT usado INTO v_usado FROM public.tokens_autorizacao_operacao WHERE token = 'adv_ap_rb';
  SELECT saldo_atual INTO v_saldo FROM public.caixas WHERE id = current_setting('t.caixa')::uuid;
  IF v_usado THEN RAISE EXCEPTION 'FALHOU: token continuou consumido apos rollback'; END IF;
  IF EXISTS (SELECT 1 FROM public.contas_pagar_pagamentos WHERE conta_id = current_setting('t.conta_b')::uuid) THEN
    RAISE EXCEPTION 'FALHOU: pagamento sobreviveu ao rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM public.movimentacoes_caixa WHERE idempotency_key LIKE '%:krb') THEN
    RAISE EXCEPTION 'FALHOU: movimentacao sobreviveu ao rollback';
  END IF;
  IF (SELECT valor_pago FROM public.contas_pagar WHERE id = current_setting('t.conta_b')::uuid) <> 0 THEN
    RAISE EXCEPTION 'FALHOU: valor_pago alterado apos rollback';
  END IF;
  IF v_saldo <> current_setting('t.saldo_antes')::numeric THEN
    RAISE EXCEPTION 'FALHOU: saldo alterado apos rollback (% -> %)', current_setting('t.saldo_antes'), v_saldo;
  END IF;
  RAISE NOTICE 'PASS  rollback AP integral: token, pagamento, movimentacao, valor_pago e saldo intactos';
END $$;
DROP TRIGGER t_falha_ap ON public.movimentacoes_caixa;

RESET ROLE;
ROLLBACK;
