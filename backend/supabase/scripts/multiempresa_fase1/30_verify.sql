-- Multiempresa Fase 1 — VERIFICAÇÃO pós-migration/backfill (SOMENTE LEITURA).
-- Cada linha deve sair com ok = true. Qualquer false aborta (RAISE) e bloqueia a etapa seguinte.
-- Só cria uma VIEW TEMPORÁRIA de sessão; não grava em tabela.

CREATE OR REPLACE TEMP VIEW fase1_verify AS
WITH esperado AS (
  SELECT u.id, u.perfil, u.ativo,
         CASE WHEN u.perfil = 'DONO' THEN NULL ELSE u.loja_id END AS loja_id
  FROM public.usuarios u WHERE u.perfil IN ('DONO', 'GERENTE', 'OPERADOR')
)
SELECT 'todas as lojas têm empresa' AS checagem,
       NOT EXISTS (SELECT 1 FROM public.lojas WHERE empresa_id IS NULL) AS ok
UNION ALL
SELECT 'exatamente 1 empresa (tenant único)', (SELECT count(*) = 1 FROM public.empresas)
UNION ALL
SELECT 'todo DONO/GERENTE/OPERADOR tem vínculo espelhado',
       NOT EXISTS (SELECT 1 FROM esperado e WHERE NOT EXISTS (
         SELECT 1 FROM public.usuario_vinculos v
         WHERE v.usuario_id = e.id AND v.papel = e.perfil AND v.ativo = e.ativo
           AND v.loja_id IS NOT DISTINCT FROM e.loja_id))
UNION ALL
SELECT 'nenhum vínculo sem usuário espelho',
       NOT EXISTS (SELECT 1 FROM public.usuario_vinculos v WHERE NOT EXISTS (
         SELECT 1 FROM esperado e WHERE e.id = v.usuario_id AND e.perfil = v.papel))
UNION ALL
SELECT 'ADMIN legado sem vínculo',
       NOT EXISTS (SELECT 1 FROM public.usuario_vinculos v JOIN public.usuarios u ON u.id = v.usuario_id
                   WHERE u.perfil = 'ADMIN')
UNION ALL
SELECT 'plataforma_admins vazia', NOT EXISTS (SELECT 1 FROM public.plataforma_admins)
UNION ALL
SELECT 'nenhuma policy lê as tabelas novas (comportamento inalterado)',
       NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE coalesce(qual, '') || coalesce(with_check, '') ~ '(usuario_vinculos|plataforma_admins|empresas)')
UNION ALL
SELECT 'nenhuma função lê as tabelas novas (comportamento inalterado)',
       NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname IN ('public', 'internal')
                     AND p.prosrc ~ '(usuario_vinculos|plataforma_admins|public\.empresas)')
UNION ALL
SELECT 'tabelas novas sem acesso para anon/authenticated',
       NOT (has_table_privilege('anon', 'public.usuario_vinculos', 'SELECT')
         OR has_table_privilege('authenticated', 'public.usuario_vinculos', 'SELECT')
         OR has_table_privilege('authenticated', 'public.empresas', 'SELECT')
         OR has_table_privilege('authenticated', 'public.plataforma_admins', 'SELECT'))
UNION ALL
SELECT 'usuarios.perfil e usuarios.loja_id preservados',
       (SELECT count(*) = 2 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name IN ('perfil', 'loja_id'));

SELECT * FROM fase1_verify;

DO $v$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM fase1_verify WHERE ok IS NOT TRUE LOOP
    RAISE EXCEPTION 'FASE1_VERIFY FALHOU: %', r.checagem;
  END LOOP;
  RAISE NOTICE 'FASE1_VERIFY OK';
END
$v$;

DROP VIEW IF EXISTS pg_temp.fase1_verify;
