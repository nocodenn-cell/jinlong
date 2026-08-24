-- Regressão: reproduz fielmente o drift descoberto em produção em
-- 24/08/2026 ao aplicar 20260823192024_d0_remessa_quantidade_positiva_atomica
-- — schema_migrations marcava 20260801120000_recebimento_conferencia_explicita
-- como aplicada, mas as colunas conferido_por/conferido_em nunca existiram
-- fisicamente em remessas. criar_confirmar_remessa_entrada falhava em toda
-- chamada real com "column conferido_por of relation remessas does not exist".
--
-- Este teste simula o drift removendo as colunas dentro de uma transação
-- (nunca commitada — ROLLBACK no final), prova que a RPC falha nesse estado
-- (vermelho), reaplica exatamente a migration corretiva
-- (20260824010000_fix_remessas_conferencia_columns_drift.sql) e prova que a
-- mesma chamada passa a funcionar (verde).

\set ON_ERROR_STOP on
BEGIN;

SELECT p.id AS produto, p.loja_id AS loja, u.id AS gerente
FROM public.produtos p
JOIN public.usuarios u ON u.loja_id = p.loja_id
WHERE p.ativo AND u.ativo AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
ORDER BY p.id, u.id
LIMIT 1 \gset

SELECT set_config('request.jwt.claim.sub', :'gerente', true),
       set_config('d0.produto', :'produto', true);

-- Simula o drift: remove exatamente as colunas que a migration original
-- deveria ter criado e que a atômica D0-03 depende.
ALTER TABLE public.remessas DROP COLUMN IF EXISTS conferido_por;
ALTER TABLE public.remessas DROP COLUMN IF EXISTS conferido_em;

DO $vermelho$
BEGIN
  BEGIN
    PERFORM public.criar_confirmar_remessa_entrada(
      'D0 drift vermelho', NULL,
      jsonb_build_array(jsonb_build_object('produto_id', current_setting('d0.produto')::uuid, 'quantidade_esperada', 1, 'quantidade_conferida', 1)),
      'd0-drift-vermelho');
    RAISE EXCEPTION 'D0_DRIFT_RPC_NAO_FALHOU_SEM_COLUNAS';
  EXCEPTION
    WHEN undefined_column THEN
      RAISE NOTICE 'VERMELHO confirmado: RPC falha sem as colunas (undefined_column), como em produção.';
    WHEN OTHERS THEN
      IF SQLSTATE <> '42703' THEN RAISE; END IF;
      RAISE NOTICE 'VERMELHO confirmado: RPC falha sem as colunas (42703), como em produção.';
  END;
END;
$vermelho$;

-- Reaplica exatamente a correção da migration 20260824010000.
ALTER TABLE public.remessas
  ADD COLUMN IF NOT EXISTS origem_tipo text NOT NULL DEFAULT 'SEM_DOCUMENTO',
  ADD COLUMN IF NOT EXISTS origem_ref text,
  ADD COLUMN IF NOT EXISTS conferido_por uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS conferido_em timestamptz,
  ADD COLUMN IF NOT EXISTS divergencia_motivo text;

ALTER TABLE public.remessas DROP CONSTRAINT IF EXISTS remessas_origem_tipo_check;
ALTER TABLE public.remessas ADD CONSTRAINT remessas_origem_tipo_check
  CHECK (origem_tipo IN ('NFE', 'ORDEM_COMPRA', 'SEM_DOCUMENTO'));

ALTER TABLE public.remessas DROP CONSTRAINT IF EXISTS remessas_status_check;
ALTER TABLE public.remessas ADD CONSTRAINT remessas_status_check
  CHECK (status IN ('RASCUNHO', 'EM_CONFERENCIA', 'CONFERIDO', 'DIVERGENTE', 'CONCLUIDA', 'CANCELADA'));

DO $verde$
DECLARE
  v_id uuid;
  v_gerente uuid := current_setting('request.jwt.claim.sub')::uuid;
  v_produto uuid;
BEGIN
  SELECT p.id INTO v_produto FROM public.produtos p WHERE p.ativo LIMIT 1;

  v_id := public.criar_confirmar_remessa_entrada(
    'D0 drift verde', NULL,
    jsonb_build_array(jsonb_build_object('produto_id', v_produto, 'quantidade_esperada', 1, 'quantidade_conferida', 1)),
    'd0-drift-verde');

  IF NOT EXISTS (
    SELECT 1 FROM public.remessas
    WHERE id = v_id AND conferido_por = v_gerente AND conferido_em IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'D0_DRIFT_VERDE_SEM_AUDITORIA';
  END IF;

  RAISE NOTICE 'VERDE confirmado: RPC funciona e grava conferido_por/conferido_em após a correção.';
END;
$verde$;

SELECT 'D0 REMESSA CONFERENCIA COLUMNS DRIFT: VERMELHO->VERDE OK' AS resultado;
ROLLBACK;
