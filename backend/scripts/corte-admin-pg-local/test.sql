\set ON_ERROR_STOP 1
CREATE TEMP TABLE r(caso text, ok boolean);
-- remapeamento
INSERT INTO r SELECT 'ADMIN sem vínculo ⇒ desativado (perfil mantido)', perfil='ADMIN' AND NOT ativo FROM usuarios WHERE id='11111111-1111-4111-8111-111111111111';
INSERT INTO r SELECT 'ADMIN com vínculo DONO ⇒ DONO ativo', perfil='DONO' AND ativo FROM usuarios WHERE id='22222222-2222-4222-8222-222222222222';
INSERT INTO r SELECT 'ADMIN já inativo continua inativo', perfil='ADMIN' AND NOT ativo FROM usuarios WHERE id='55555555-5555-4555-8555-555555555555';
INSERT INTO r SELECT 'backup com 3 ex-ADMIN', count(*)=3 FROM internal.usuarios_admin_corte_backup;
INSERT INTO r SELECT 'nenhum ADMIN ativo', NOT EXISTS (SELECT 1 FROM usuarios WHERE perfil='ADMIN' AND ativo);
INSERT INTO r SELECT 'outros perfis intactos', (SELECT count(*) FROM usuarios WHERE perfil IN ('DONO','GERENTE') AND ativo)=3;
-- helpers
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
INSERT INTO r SELECT 'fp_admin_legado = false', NOT fp_admin_legado();
INSERT INTO r SELECT 'auth_usuario_eh_admin = false', NOT auth_usuario_eh_admin();
INSERT INTO r SELECT 'ex-ADMIN sem vínculo não pode loja B', NOT fp_pode_loja('b0000001-0000-4000-8000-000000000001');
INSERT INTO r SELECT 'ex-ADMIN sem vínculo não pode a própria loja A1', NOT fp_pode_loja('a0000001-0000-4000-8000-000000000001');
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
INSERT INTO r SELECT 'ex-ADMIN virou DONO: pode lojas da E1', fp_pode_loja('a0000001-0000-4000-8000-000000000001') AND fp_pode_loja('a0000002-0000-4000-8000-000000000002');
INSERT INTO r SELECT 'ex-ADMIN virou DONO: NÃO pode loja da E2', NOT fp_pode_loja('b0000001-0000-4000-8000-000000000001');
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
INSERT INTO r SELECT 'GERENTE só a própria loja', fp_pode_loja('a0000001-0000-4000-8000-000000000001') AND NOT fp_pode_loja('a0000002-0000-4000-8000-000000000002');
SELECT set_config('request.jwt.claim.sub','',false);
-- token
INSERT INTO r SELECT 'token de ex-ADMIN fora da loja B', internal.token_gerente_fora_da_loja('tAdmB','b0000001-0000-4000-8000-000000000001');
INSERT INTO r SELECT 'token de ex-ADMIN na própria loja A1 ainda casa a loja', NOT internal.token_gerente_fora_da_loja('tAdmA1','a0000001-0000-4000-8000-000000000001');
INSERT INTO r SELECT 'token do DONO da E2 vale na loja B', NOT internal.token_gerente_fora_da_loja('tDonoB','b0000001-0000-4000-8000-000000000001');
INSERT INTO r SELECT 'token do DONO da E2 NÃO vale na loja A1 (outra empresa)', internal.token_gerente_fora_da_loja('tDonoA1','a0000001-0000-4000-8000-000000000001');
INSERT INTO r SELECT 'token do GERENTE fora da própria loja', internal.token_gerente_fora_da_loja('tGerA2','a0000002-0000-4000-8000-000000000002');
-- vincular_usuario_loja
INSERT INTO usuarios VALUES ('66666666-6666-4666-8666-666666666666','a0000001-0000-4000-8000-000000000001','OPERADOR',true);
DO $$ BEGIN
  PERFORM vincular_usuario_loja('66666666-6666-4666-8666-666666666666','a0000001-0000-4000-8000-000000000001','OPERADOR','11111111-1111-4111-8111-111111111111');
  INSERT INTO r VALUES ('ex-ADMIN não vincula funcionário', false);
EXCEPTION WHEN OTHERS THEN INSERT INTO r VALUES ('ex-ADMIN não vincula funcionário', SQLERRM LIKE '%VINCULO_ATOR_SEM_ACESSO_LOJA%'); END $$;
INSERT INTO r SELECT 'DONO vincula funcionário na própria empresa', vincular_usuario_loja('66666666-6666-4666-8666-666666666666','a0000001-0000-4000-8000-000000000001','OPERADOR','22222222-2222-4222-8222-222222222222') IS NOT NULL;
-- bloqueio de ADMIN novo / promoção / reativação
DO $$ BEGIN
  INSERT INTO usuarios VALUES ('77777777-7777-4777-8777-777777777777',NULL,'ADMIN',true); INSERT INTO r VALUES ('INSERT ADMIN bloqueado', false);
EXCEPTION WHEN OTHERS THEN INSERT INTO r VALUES ('INSERT ADMIN bloqueado', SQLERRM LIKE '%PERFIL_ADMIN_DESCONTINUADO%'); END $$;
DO $$ BEGIN
  UPDATE usuarios SET perfil='ADMIN' WHERE id='44444444-4444-4444-8444-444444444444'; INSERT INTO r VALUES ('promover a ADMIN bloqueado', false);
EXCEPTION WHEN OTHERS THEN INSERT INTO r VALUES ('promover a ADMIN bloqueado', SQLERRM LIKE '%PERFIL_ADMIN_DESCONTINUADO%'); END $$;
DO $$ BEGIN
  UPDATE usuarios SET ativo=true WHERE id='11111111-1111-4111-8111-111111111111'; INSERT INTO r VALUES ('reativar ADMIN bloqueado', false);
EXCEPTION WHEN OTHERS THEN INSERT INTO r VALUES ('reativar ADMIN bloqueado', SQLERRM LIKE '%PERFIL_ADMIN_DESCONTINUADO%'); END $$;
UPDATE usuarios SET perfil='DONO' WHERE id='11111111-1111-4111-8111-111111111111';
INSERT INTO r SELECT 'ex-ADMIN pode ser trocado para outro perfil', perfil='DONO' FROM usuarios WHERE id='11111111-1111-4111-8111-111111111111';
UPDATE usuarios SET perfil='OPERADOR' WHERE id='44444444-4444-4444-8444-444444444444';
INSERT INTO r SELECT 'troca entre perfis do cliente segue livre', perfil='OPERADOR' FROM usuarios WHERE id='44444444-4444-4444-8444-444444444444';
SELECT CASE WHEN ok THEN 'OK      ' ELSE 'FALHOU  ' END || caso FROM r;
SELECT count(*) FILTER (WHERE ok) || ' de ' || count(*) || ' passaram' FROM r;
