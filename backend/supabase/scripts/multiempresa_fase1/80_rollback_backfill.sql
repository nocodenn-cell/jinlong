-- Multiempresa Fase 1 — ROLLBACK do backfill (ESCREVE). Executar com: psql "$DB_URL" -1 -v ON_ERROR_STOP=1 -f 80_rollback_backfill.sql
-- Desfaz apenas o que 20_backfill.sql criou. Não toca `usuarios` (nunca foi alterado).
-- Seguro só enquanto nenhuma policy/RPC/código ler `usuario_vinculos` (Fase 1).

DO $rb$
DECLARE
  c_empresa constant uuid := 'e0000001-0000-4000-8000-000000000001';
BEGIN
  IF EXISTS (SELECT 1 FROM public.empresas WHERE id <> c_empresa) THEN
    RAISE EXCEPTION 'FASE1_ROLLBACK: existem outras empresas — rollback do backfill de tenant único não se aplica';
  END IF;
  IF EXISTS (SELECT 1 FROM public.plataforma_admins) THEN
    RAISE EXCEPTION 'FASE1_ROLLBACK: plataforma_admins não está vazia — revisar manualmente';
  END IF;

  DELETE FROM public.usuario_vinculos WHERE empresa_id = c_empresa;
  UPDATE public.lojas SET empresa_id = NULL WHERE empresa_id = c_empresa;
  DELETE FROM public.empresas WHERE id = c_empresa;

  RAISE NOTICE 'FASE1_ROLLBACK_BACKFILL OK';
END
$rb$;
