-- Multiempresa Fase 1 — PREFLIGHT do backfill (SOMENTE LEITURA).
-- Uso: psql "$DB_URL" -f 10_preflight_backfill.sql
-- Não escreve nada. Gera o relatório que precisa ser revisado ANTES de 20_backfill.sql.

\echo '== 1. Pré-requisito: migration 20261003090000 aplicada'
SELECT to_regclass('public.empresas')          IS NOT NULL AS tem_empresas,
       to_regclass('public.usuario_vinculos')  IS NOT NULL AS tem_usuario_vinculos,
       to_regclass('public.plataforma_admins') IS NOT NULL AS tem_plataforma_admins,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'lojas' AND column_name = 'empresa_id') AS tem_lojas_empresa_id;

\echo '== 2. Lojas (esperado em produção hoje: 1, MATRIZ)'
SELECT id, codigo, ativo, (cnpj IS NOT NULL) AS tem_cnpj FROM public.lojas ORDER BY created_at;

\echo '== 3. Empresas já existentes (esperado: 0 antes do primeiro backfill)'
SELECT count(*) AS empresas FROM public.empresas;

\echo '== 4. Usuários por perfil / ativo / loja'
SELECT perfil, ativo, loja_id, count(*) AS n
FROM public.usuarios GROUP BY 1, 2, 3 ORDER BY 1, 2;

\echo '== 5. Vínculos que o backfill vai criar (prévia, sem gravar)'
SELECT u.id AS usuario_id, u.perfil AS papel,
       CASE WHEN u.perfil = 'DONO' THEN NULL ELSE u.loja_id END AS loja_id,
       u.ativo
FROM public.usuarios u
WHERE u.perfil IN ('DONO', 'GERENTE', 'OPERADOR')
ORDER BY u.perfil, u.created_at;

\echo '== 6. EXCEÇÕES (cada linha exige decisão humana antes do backfill)'
SELECT 'ADMIN legado — NÃO recebe vínculo nem plataforma_admins (D9)' AS excecao, u.id::text AS ref, u.ativo::text AS detalhe
  FROM public.usuarios u WHERE u.perfil = 'ADMIN'
UNION ALL
SELECT 'perfil fora do modelo', u.id::text, u.perfil
  FROM public.usuarios u WHERE u.perfil NOT IN ('DONO', 'GERENTE', 'OPERADOR', 'ADMIN')
UNION ALL
SELECT 'usuário sem loja', u.id::text, u.perfil
  FROM public.usuarios u WHERE u.loja_id IS NULL
UNION ALL
SELECT 'usuário em loja inativa', u.id::text, l.codigo
  FROM public.usuarios u JOIN public.lojas l ON l.id = u.loja_id WHERE NOT l.ativo
UNION ALL
SELECT 'auth.users sem linha em usuarios (não migra; já não acessa)', a.id::text, NULL
  FROM auth.users a WHERE NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = a.id)
UNION ALL
SELECT 'loja já vinculada a empresa', l.id::text, l.empresa_id::text
  FROM public.lojas l WHERE l.empresa_id IS NOT NULL
UNION ALL
SELECT 'vínculo já existente', v.usuario_id::text, v.papel
  FROM public.usuario_vinculos v;

\echo '== 7. Contas inativas (migram com vínculo inativo-equivalente: ativo espelha usuarios.ativo)'
SELECT perfil, count(*) FROM public.usuarios WHERE NOT ativo GROUP BY 1 ORDER BY 1;
