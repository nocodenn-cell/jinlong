-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260806000032
-- name: 297_configuracoes_gerais_whitelist
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

BEGIN;

ALTER TABLE public.configuracoes_gerais
  ADD CONSTRAINT chk_configuracoes_gerais_chave
  CHECK (chave IN (
    'cancelamento_maximo_valor_sem_gerente',
    'comissao_padrao_percentual',
    'desconto_maximo_operador_percentual',
    'estoque_minimo_padrao',
    'lead_time_max_dias',
    'lead_time_min_dias',
    'motivo_suspensao',
    'vendas_suspensas'
  ));

COMMENT ON CONSTRAINT chk_configuracoes_gerais_chave ON public.configuracoes_gerais IS
  'F1-06 (2026-08-05). Whitelist na autoridade — mesma lista de app/gerente/configuracoes/actions.ts. Qualquer chave nova precisa desta migration E da whitelist em app antes de existir.';

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_configuracoes_gerais_chave'
  ) THEN
    RAISE EXCEPTION 'MIG297_CHECK_AUSENTE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.configuracoes_gerais
    WHERE chave NOT IN (
      'cancelamento_maximo_valor_sem_gerente','comissao_padrao_percentual',
      'desconto_maximo_operador_percentual','estoque_minimo_padrao',
      'lead_time_max_dias','lead_time_min_dias','motivo_suspensao','vendas_suspensas'
    )
  ) THEN
    RAISE EXCEPTION 'MIG297_LINHA_FORA_DA_WHITELIST';
  END IF;

  RAISE NOTICE '297 OK — F1-06/F1-14 whitelist verificada';
END
$verify$;

COMMIT;
