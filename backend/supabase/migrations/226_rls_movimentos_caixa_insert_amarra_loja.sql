-- 226_rls_movimentos_caixa_insert_amarra_loja.sql
--
-- OBSOLETA — não aplicar.
--
-- Contexto original: visava corrigir a policy `movimentos_insert` em `movimentos_caixa`
-- que permitia INSERT de qualquer usuário autenticado em qualquer caixa.
--
-- Por que está obsoleta:
--   1. A policy `movimentos_insert` NÃO existe em produção em `movimentos_caixa`.
--      Aplicar este ALTER falharia com erro 42704 (undefined_object).
--   2. `movimentos_caixa` é uma tabela legada. A tabela ativa é `movimentacoes_caixa`.
--   3. Toda escrita em `movimentos_caixa` passa por RPCs SECURITY DEFINER
--      (registrar_movimentacao, aprovar_movimentacao, etc.) — RLS default-deny
--      já bloqueia INSERT direto. O estado atual é mais seguro que o que a
--      migration pretendia corrigir.
--
-- Evidência (consultada em 2026-06-25):
--   SELECT policyname FROM pg_policies
--   WHERE tablename = 'movimentos_caixa';
--   → movimentos_gerente (SELECT only) — sem INSERT policy
--
-- Esta migration é mantida como documentação histórica. O arquivo de rollback
-- (226_rollback_*) também está obsoleto pelo mesmo motivo.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'movimentos_caixa'
      AND policyname = 'movimentos_insert'
  ) THEN
    ALTER POLICY movimentos_insert ON public.movimentos_caixa
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.caixas c
          JOIN public.usuarios u ON u.id = ( SELECT auth.uid() )
          WHERE c.id = movimentos_caixa.caixa_id
            AND c.loja_id = u.loja_id
            AND (
              c.operador_id = ( SELECT auth.uid() )
              OR u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])
            )
        )
      );
    RAISE NOTICE '226: policy movimentos_insert atualizada.';
  ELSE
    RAISE NOTICE '226: policy movimentos_insert não existe — nenhuma ação (esperado).';
  END IF;
END $$;
