-- ============================================================
-- Fase 1B — item 1B-4: remove a sobrecarga legada
--                      `relatorio_consistencia_vendas(3 args)`
--
-- CONTEXTO
--
-- A sobrecarga de 3 argumentos (`p_caixa_id, p_from, p_to`) é criada pelas
-- migrations `20260621004000` e `20260707020000` — ambas PRESENTES no ledger
-- de produção. Mesmo assim, o objeto NÃO EXISTE em produção (medido em
-- 2026-08-19). Nenhuma migration do repositório o remove.
--
-- É drift manual real, na direção oposta à maioria dos achados da Fase 0:
-- aqui o repositório tem um objeto que produção não tem. Catalogado em
-- `docs/AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md` §3.3.
--
-- POR QUE ISSO JÁ CUSTOU CARO
--
-- `REVOKE EXECUTE ON FUNCTION` não aceita `IF EXISTS`. As migrations
-- `20260814015032` e `20260819000000` faziam REVOKE sobre esta sobrecarga:
-- em produção, onde ela não existe, as duas ABORTAVAM INTEIRAS — e com elas
-- o bloco P1-3 da primeira, que é o fix da chave de idempotência de AP.
-- A PR #309 contornou o sintoma guardando cada alvo com `to_regprocedure`.
-- Esta migration remove a CAUSA: a divergência de catálogo em si.
--
-- SEGURANÇA
--
-- Nada consome esta sobrecarga:
--   - nenhuma chamada `.rpc()` no frontend, no `pdv-local` ou nas Edge Functions;
--   - `GATE 9` de `financial-adversarial-gates.test.sql` itera por NOME de
--     função, não por assinatura — segue cobrindo a sobrecarga de 4 args;
--   - a de 4 args, que é a usada, permanece intacta e restrita a
--     `postgres`/`service_role`.
--
-- Após esta migration, repositório e produção passam a ter exatamente UMA
-- sobrecarga de `relatorio_consistencia_vendas` — a de 4 argumentos.
--
-- Idempotente: guardado por `to_regprocedure`, que devolve NULL quando a
-- assinatura não existe, em vez de erro.
-- ============================================================

DO $$
BEGIN
  IF to_regprocedure(
       'public.relatorio_consistencia_vendas(uuid, timestamptz, timestamptz)'
     ) IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION public.relatorio_consistencia_vendas(uuid, timestamptz, timestamptz)';
    RAISE NOTICE 'FASE1B: relatorio_consistencia_vendas(3 args) removida — convergido com producao.';
  ELSE
    RAISE NOTICE 'FASE1B: relatorio_consistencia_vendas(3 args) ausente — nada a remover (estado de producao).';
  END IF;
END;
$$;

-- Reafirma o fechamento da sobrecarga que permanece. `20260819000000` já fez
-- isto; repetir é no-op e mantém a asserção junto do objeto que ela protege.
DO $$
BEGIN
  IF to_regprocedure(
       'public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz)'
     ) IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION
      public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz)
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION
      public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz)
      TO service_role;
  END IF;
END;
$$;
