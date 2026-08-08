-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260806005804
-- name: 301_revoke_anon_execute_finalizar_venda_v4_pos_br01
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric,
  boolean, boolean, text, text, text, text, uuid, motivo_desconto_enum_tipo, text, text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric,
  boolean, boolean, text, text, text, text, uuid, motivo_desconto_enum_tipo, text, text
) FROM anon;

GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric,
  boolean, boolean, text, text, text, text, uuid, motivo_desconto_enum_tipo, text, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.finalizar_venda_transacional_canonica_v4 IS
  'BR-03 (2026-08-05): custo_unitario_snap derivado de produtos.preco_custo no servidor, nunca aceito do payload do cliente. NULL quando custo ausente (ADR-007) — nunca 0. SEGURANÇA (migration 301, 2026-08-05): EXECUTE restrito a authenticated e service_role; PUBLIC e anon revogados — a migration 298 (DROP+CREATE para o parâmetro de limite de crédito) tinha reintroduzido o grant default de PUBLIC que a 277 já havia fechado. Chamador único autorizado: pdv-importados/app/caixa/server/caixaVendas.impl.ts (sessão obrigatória).';

NOTIFY pgrst, 'reload schema';
