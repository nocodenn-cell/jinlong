-- Fluxo real do app para fechamento com venda em espera (D-06 / RN-03).
-- O app chama rpc('fechar_caixa_atomico') = public.fechar_caixa_atomico (envelope de
-- 20261019140000), que delega para internal.fechar_caixa_atomico. Este teste chama a
-- função pública como 'authenticated', com auth.uid() = operador.
--
-- Resultado esperado depende do estado do banco; o teste IMPRIME o desfecho de cada passo
-- (NOTICE 'PASSO ...') e não impõe um estado. O revisor compara com o estado do ambiente:
--   - COM 20261119120000 aplicada: passo 1 = FECHAR_CAIXA_VENDAS_EM_ESPERA; passo 3 = OK.
--   - SEM 20261119120000 (produção hoje): passo 1 = OK (espera não bloqueia). Lacuna real.
-- Executar SOMENTE em banco descartável:
--   docker exec -i <container_db_local> psql -U postgres -d <banco_descartavel> -v ON_ERROR_STOP=1 -f - < este_arquivo
-- Transação com ROLLBACK. Dados sintéticos (uuid prefixo fa1c...).
\set ON_ERROR_STOP on
BEGIN;

DO $t$
DECLARE
  e   uuid := 'fa1c0001-0000-4000-8000-000000000001';
  l   uuid := 'fa1c0002-0000-4000-8000-000000000001';
  op  uuid := 'fa1c0003-0000-4000-8000-000000000001';
  cx  uuid;
  esp uuid;
  r   record;
  msg text;
BEGIN
  INSERT INTO public.empresas (id, nome) VALUES (e, 'FA1C Empresa');
  INSERT INTO auth.users (id) VALUES (op);
  INSERT INTO public.lojas (empresa_id, id, nome, codigo, ativo) VALUES (e, l, 'FA1C Loja', 'FA1C', true);
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
    VALUES (op, 'FA1C Operador', 'OPERADOR', true, l);
  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
    VALUES (op, 'ABERTO', now(), 100, l) RETURNING id INTO cx;
  INSERT INTO public.vendas_em_espera (loja_id, operador_id, caixa_id, numero_local, status)
    VALUES (l, op, cx, 1, 'EM_ESPERA') RETURNING id INTO esp;

  -- contexto do app: operador autenticado
  PERFORM set_config('request.jwt.claim.sub', op::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- PASSO 1: fechamento com espera aberta
  BEGIN
    SELECT * INTO r FROM public.fechar_caixa_atomico(op, 100, 'teste fa1c');
    msg := 'OK';
  EXCEPTION WHEN OTHERS THEN
    msg := 'ERRO: ' || SQLERRM;
  END;
  RAISE NOTICE 'PASSO 1 (fechar com espera aberta): %', msg;

  -- se o passo 1 fechou o caixa, o restante do teste não se aplica
  IF msg <> 'OK' THEN
    -- PASSO 2: descarte pela RPC auditável (somente se existir na versão do banco)
    IF to_regprocedure('internal.descartar_venda_em_espera(uuid, text)') IS NOT NULL THEN
      BEGIN
        PERFORM internal.descartar_venda_em_espera(esp, 'teste fa1c descarte');
        RAISE NOTICE 'PASSO 2 (descartar espera pela RPC): OK';
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'PASSO 2 (descartar espera pela RPC): ERRO: %', SQLERRM;
      END;
    ELSE
      -- sem RPC auditável o descarte não é feito; o passo 3 reporta o efeito
      RAISE NOTICE 'PASSO 2 (descartar espera pela RPC): NAO_DISPONIVEL nesta versao';
    END IF;

    -- PASSO 3: novo fechamento
    BEGIN
      SELECT * INTO r FROM public.fechar_caixa_atomico(op, 100, 'teste fa1c');
      RAISE NOTICE 'PASSO 3 (fechar apos descarte): OK status=%',
        (SELECT status FROM public.caixas WHERE id = cx);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'PASSO 3 (fechar apos descarte): ERRO: %', SQLERRM;
    END;
  END IF;
END
$t$;

ROLLBACK;
