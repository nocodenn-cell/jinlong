-- ============================================================================
-- SMOKE SSOT-04 — invariante: toda alteração de estoque passa pelo kardex.
--
-- Contexto: até 2026-08-06 três funções alteravam `estoque.quantidade_atual`
-- sem lançar em `movimentos_estoque_log` — `cancelar_venda_transacional` (já
-- usada em produção, 7 cancelamentos), `devolver_ou_trocar_venda` e a órfã
-- `baixar_estoque_venda`. Migrations 303 (lança kardex nas duas primeiras,
-- tipo `ENTRADA_DEVOLUCAO_CLIENTE`) e 304 (remove a terceira) fecharam o furo.
--
-- Este script é SOMENTE LEITURA — seguro em produção, serve como guarda de
-- regressão. Não valida as 22 divergências históricas: elas são anteriores à
-- correção e o backfill foi deliberadamente descartado (mutação de dado
-- pretérito é decisão de negócio).
--
-- Uso:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f smoke_ssot04_kardex_invariante.sql
-- ============================================================================

DO $smoke$
DECLARE
  v_sem_kardex text;
  v_tipo_ok boolean;
BEGIN
  -- ==========================================================================
  -- 1. A invariante: nenhuma função altera `estoque` sem tocar no kardex.
  --    Esta é a asserção central do SSOT-04.
  -- ==========================================================================
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
  INTO v_sem_kardex
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ~* 'UPDATE\s+(public\.)?estoque'
    AND position('movimentos_estoque_log' IN pg_get_functiondef(p.oid)) = 0;

  IF v_sem_kardex IS NOT NULL THEN
    RAISE EXCEPTION 'SMOKE_SSOT04_ESCRITA_SEM_KARDEX: %', v_sem_kardex;
  END IF;
  RAISE NOTICE 'SSOT04 C1 OK — nenhuma funcao altera estoque sem lancar no kardex';

  -- ==========================================================================
  -- 2. A função órfã não voltou (drift sem migration de origem).
  -- ==========================================================================
  IF to_regprocedure('public.baixar_estoque_venda(uuid,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'SMOKE_SSOT04_BAIXAR_ESTOQUE_VENDA_RESSURGIU';
  END IF;
  RAISE NOTICE 'SSOT04 C2 OK — baixar_estoque_venda continua removida';

  -- ==========================================================================
  -- 3. Os dois caminhos de retorno usam o tipo do catálogo existente.
  --    Guarda contra alguém "resolver" criando um tipo novo.
  -- ==========================================================================
  SELECT position('ENTRADA_DEVOLUCAO_CLIENTE' IN
           pg_get_functiondef('public.cancelar_venda_transacional(uuid,text,uuid)'::regprocedure)) > 0
     AND position('ENTRADA_DEVOLUCAO_CLIENTE' IN
           pg_get_functiondef('public.devolver_ou_trocar_venda(uuid,text,text,text,jsonb,numeric,text,uuid,uuid)'::regprocedure)) > 0
  INTO v_tipo_ok;

  IF NOT v_tipo_ok THEN
    RAISE EXCEPTION 'SMOKE_SSOT04_TIPO_DE_MOVIMENTO_DIVERGENTE';
  END IF;
  RAISE NOTICE 'SSOT04 C3 OK — cancelamento e devolucao lancam ENTRADA_DEVOLUCAO_CLIENTE';

  -- ==========================================================================
  -- 4. Todo lançamento de retorno aponta para a venda de origem.
  --    Sem `venda_id` o kardex não explica de onde veio o estoque.
  -- ==========================================================================
  IF EXISTS (
    SELECT 1 FROM public.movimentos_estoque_log
    WHERE tipo_codigo = 'ENTRADA_DEVOLUCAO_CLIENTE' AND venda_id IS NULL
  ) THEN
    RAISE EXCEPTION 'SMOKE_SSOT04_RETORNO_SEM_VENDA_VINCULADA';
  END IF;
  RAISE NOTICE 'SSOT04 C4 OK — todo retorno no kardex aponta para a venda de origem';

  RAISE NOTICE 'SMOKE SSOT-04 — INVARIANTE INTEGRA';
END
$smoke$;
