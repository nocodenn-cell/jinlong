-- ============================================================================
-- Conciliação financeira da NF-e de entrada (sprint corretiva NF-e, 2026-10-30).
--
-- PROBLEMA: internal.confirmar_importacao_nfe só verificava que existia ao menos uma
-- duplicata quando havia valor econômico. Uma NF de R$ 100,00 com duplicata de
-- R$ 60,00 era confirmada e gerava conta a pagar de R$ 60,00 (reproduzido em
-- homologação, 2026-10-30).
--
-- CONTRATO (canônico, SSOT-003): valor exigível = valor econômico da conferência,
-- Σ(quantidade_conferida × custo_unitario), sem arredondamento. As duplicatas
-- informadas devem somar esse valor com tolerância de R$ 0,01 (D3). Qualquer
-- divergência além da tolerância falha a confirmação com IMPORT_NFE_DUPLICATAS_DIVERGENTES,
-- dentro da mesma transação: nada é creditado, nenhuma conta a pagar é criada.
-- Não são criadas parcelas para fechar diferença.
--
-- Pagamentos antecipados não são modelados na importação de NF-e (não há campo nem
-- tabela de origem). Até existirem, o exigível é o valor total conferido, sem dedução.
--
-- Aplicação por substituição textual exata (cada trecho com 1 ocorrência; falha ⇒
-- aborta a transação), no mesmo padrão de 20261029160000_s2.
-- Rollback: backend/supabase/rollback/20261030120000_nfe_conciliacao_duplicatas_rollback.sql
-- ============================================================================

BEGIN;

DO $conc$
DECLARE
  v_def text;
  r record;
  v_n int;
BEGIN
  v_def := pg_get_functiondef('internal.confirmar_importacao_nfe(uuid)'::regprocedure);

  FOR r IN
    SELECT * FROM (VALUES
      (
        E'  v_econ         numeric(14,2);\n',
        E'  v_econ         numeric(14,2);\n  v_exigivel     numeric;\n  v_dup_total    numeric;\n'
      ),
      (
        E'  FOR v_dup IN\n    SELECT numero_duplicata, data_vencimento, valor\n',
        E'  -- Conciliação: duplicatas devem somar o valor exigível (exato, tolerância R$ 0,01).\n  SELECT coalesce(sum(i.quantidade_conferida * i.custo_unitario), 0) INTO v_exigivel\n    FROM public.importacoes_nfe_itens i\n   WHERE i.importacao_nfe_id = p_importacao_id;\n  SELECT coalesce(sum(d.valor), 0) INTO v_dup_total\n    FROM public.importacoes_nfe_duplicatas d\n   WHERE d.importacao_nfe_id = p_importacao_id;\n  IF abs(v_dup_total - v_exigivel) > 0.01 THEN\n    RAISE EXCEPTION ''IMPORT_NFE_DUPLICATAS_DIVERGENTES''\n      USING DETAIL = format(''valor_exigivel=%s duplicatas=%s'', v_exigivel, v_dup_total);\n  END IF;\n\n  FOR v_dup IN\n    SELECT numero_duplicata, data_vencimento, valor\n'
      )
    ) AS t(antigo, novo)
  LOOP
    v_n := (length(v_def) - length(replace(v_def, r.antigo, ''))) / length(r.antigo);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'CONCILIACAO_NFE: trecho encontrado % vezes (esperado 1): %', v_n, left(r.antigo, 60);
    END IF;
    v_def := replace(v_def, r.antigo, r.novo);
  END LOOP;

  EXECUTE v_def;
END
$conc$;

-- Prova: a função contém a conciliação; a semântica é verificada pelos testes SQL.
DO $prova$
BEGIN
  IF position('IMPORT_NFE_DUPLICATAS_DIVERGENTES' IN pg_get_functiondef('internal.confirmar_importacao_nfe(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'CONCILIACAO_NFE PROVA FAIL';
  END IF;
END
$prova$;

COMMIT;
