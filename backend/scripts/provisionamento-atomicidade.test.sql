-- FASE 3.1 — atomicidade e permissões do provisionamento (contrato 20261028121000).
--
-- Critério: nenhuma empresa pode ser criada parcialmente nem com permissões incorretas.
-- Cada cenário força uma falha em um ponto do fluxo e confere que NADA ficou gravado
-- (empresas, lojas, usuarios, usuario_vinculos, trilha de contingência).
--
-- Executar somente em banco descartável ou local. Termina com ROLLBACK.
--   docker exec -i supabase_db_fastproduct psql -U postgres -d postgres -v ON_ERROR_STOP=1 < backend/scripts/provisionamento-atomicidade.test.sql

BEGIN;

CREATE TEMP TABLE IF NOT EXISTS atom_res (caso text PRIMARY KEY, ok boolean, detalhe text) ON COMMIT DROP;

-- Snapshot de contagens para comparar antes/depois.
CREATE OR REPLACE FUNCTION pg_temp.snap() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'empresas', (SELECT count(*) FROM public.empresas),
    'lojas', (SELECT count(*) FROM public.lojas),
    'usuarios', (SELECT count(*) FROM public.usuarios),
    'vinculos', (SELECT count(*) FROM public.usuario_vinculos),
    'trilha', (SELECT count(*) FROM internal.provisionamento_contingencia_log)
  )
$$;

-- Executa a provisão em contingência autorizada e devolve o erro (ou NULL se passou).
CREATE OR REPLACE FUNCTION pg_temp.tenta(p jsonb) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('fp.provisionamento_contingencia', 'CH-ATOM', true);
  PERFORM set_config('fp.provisionamento_responsavel', 'teste-atomicidade', true);
  PERFORM public.plataforma_provisionar_empresa(p, NULL);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

-- Usuários de teste (auth.users exigido pela FK de usuarios).
DO $$
DECLARE
  ids uuid[] := ARRAY[
    'a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-000000000006'
  ]::uuid[];
  i int;
BEGIN
  FOR i IN 1..array_length(ids,1) LOOP
    INSERT INTO auth.users (id) VALUES (ids[i]) ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

-- Payload base: uma loja, um DONO válido.
CREATE OR REPLACE FUNCTION pg_temp.base(extra_users jsonb DEFAULT '[]'::jsonb, lojas jsonb DEFAULT '[{"nome":"Loja Atom","codigo":"ATOM1"}]'::jsonb)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'empresa', jsonb_build_object('nome','Empresa Atom ' || substr(md5(random()::text),1,6), 'plano','PILOTO'),
    'lojas', lojas,
    'usuarios', jsonb_build_array(jsonb_build_object('id','a1000000-0000-4000-8000-000000000001','nome','Dono Atom','papel','DONO'))
                || extra_users
  )
$$;

DO $$
DECLARE
  antes jsonb; erro text; r record;
  dono jsonb := '{"id":"a1000000-0000-4000-8000-000000000001","nome":"Dono Atom","papel":"DONO"}';
BEGIN
  -- CASO 1: DONO válido + segundo usuário com papel inválido → nada deve ficar gravado.
  antes := pg_temp.snap();
  erro := pg_temp.tenta(jsonb_build_object(
    'empresa', jsonb_build_object('nome','Atom C1'),
    'lojas', '[{"nome":"L1","codigo":"AC1A"}]'::jsonb,
    'usuarios', jsonb_build_array(dono, jsonb_build_object('id','a1000000-0000-4000-8000-000000000002','nome','X','papel','ADMIN'))));
  INSERT INTO atom_res VALUES ('C1 papel ADMIN no meio do lote', erro IS NOT NULL AND pg_temp.snap() = antes,
    coalesce(erro,'passou (FALHA)'));

  -- CASO 2: OPERADOR com duas lojas → recusa; DONO e loja já inseridos precisam sumir.
  antes := pg_temp.snap();
  erro := pg_temp.tenta(jsonb_build_object(
    'empresa', jsonb_build_object('nome','Atom C2'),
    'lojas', '[{"nome":"L1","codigo":"AC2A"},{"nome":"L2","codigo":"AC2B"}]'::jsonb,
    'usuarios', jsonb_build_array(dono, jsonb_build_object('id','a1000000-0000-4000-8000-000000000003','nome','Op','papel','OPERADOR','lojas','["L1","L2"]'::jsonb))));
  INSERT INTO atom_res VALUES ('C2 OPERADOR com 2 lojas', erro LIKE '%PROVISIONAR_OPERADOR_UMA_LOJA%' AND pg_temp.snap() = antes, coalesce(erro,'passou (FALHA)'));

  -- CASO 3: sem DONO → recusa depois de inserir empresa, lojas e usuários.
  antes := pg_temp.snap();
  erro := pg_temp.tenta(jsonb_build_object(
    'empresa', jsonb_build_object('nome','Atom C3'),
    'lojas', '[{"nome":"L1","codigo":"AC3A"}]'::jsonb,
    'usuarios', jsonb_build_array(jsonb_build_object('id','a1000000-0000-4000-8000-000000000004','nome','G','papel','GERENTE','lojas','["L1"]'::jsonb))));
  INSERT INTO atom_res VALUES ('C3 sem DONO', erro LIKE '%PROVISIONAR_SEM_DONO%' AND pg_temp.snap() = antes, coalesce(erro,'passou (FALHA)'));

  -- CASO 4: loja de código duplicado não pode vazar código entre empresas (sufixo), mas a
  -- criação precisa ser inteira ou nada. Aqui a loja é válida: deve PASSAR e gravar tudo certo.
  antes := pg_temp.snap();
  erro := pg_temp.tenta(pg_temp.base());
  INSERT INTO atom_res VALUES ('C4 caminho feliz grava empresa, loja, DONO e vínculo',
    erro IS NULL AND (pg_temp.snap()->>'empresas')::int = (antes->>'empresas')::int + 1
    AND (pg_temp.snap()->>'lojas')::int = (antes->>'lojas')::int + 1
    AND (pg_temp.snap()->>'vinculos')::int = (antes->>'vinculos')::int + 1,
    coalesce(erro,'ok'));

  -- CASO 5: usuário JÁ existente com vínculo ATIVO em outra empresa → recusa (regra atual).
  -- Pré-condição: o DONO do caso 4 já é um usuário ativo da empresa criada no caso 4.
  antes := pg_temp.snap();
  erro := pg_temp.tenta(jsonb_build_object(
    'empresa', jsonb_build_object('nome','Atom C5'),
    'lojas', '[{"nome":"L1","codigo":"AC5A"}]'::jsonb,
    'usuarios', jsonb_build_array(dono)));
  INSERT INTO atom_res VALUES ('C5 usuário com vínculo ativo em outra empresa',
    erro LIKE '%PROVISIONAR_USUARIO_DE_OUTRA_EMPRESA%' AND pg_temp.snap() = antes, coalesce(erro,'passou (FALHA)'));

  -- CASO 6 (achado): usuário EXISTENTE, ATIVO, da empresa do caso 4, mas SEM vínculo ativo.
  -- A checagem de vínculo não enxerga usuarios.loja_id/empresa. O ON CONFLICT reatribui o
  -- usuário para a nova empresa. Esperado pelo critério: recusar.
  UPDATE public.usuario_vinculos SET ativo = false
   WHERE usuario_id = 'a1000000-0000-4000-8000-000000000001';
  antes := pg_temp.snap();
  erro := pg_temp.tenta(jsonb_build_object(
    'empresa', jsonb_build_object('nome','Atom C6'),
    'lojas', '[{"nome":"L1","codigo":"AC6A"}]'::jsonb,
    'usuarios', jsonb_build_array(dono)));
  INSERT INTO atom_res VALUES ('C6 usuário ativo sem vínculo ativo em outra empresa (achado)',
    erro LIKE '%PROVISIONAR_USUARIO_DE_OUTRA_EMPRESA%' AND pg_temp.snap() = antes,
    coalesce(erro,'PASSOU: usuário de outra empresa reatribuído (FALHA DE PERMISSÃO)'));

  -- CASO 7: atomicidade mesmo com falha no ÚLTIMO passo (após gravar tudo).
  antes := pg_temp.snap();
  erro := pg_temp.tenta(jsonb_build_object(
    'empresa', jsonb_build_object('nome','Atom C7'),
    'lojas', '[{"nome":"L1","codigo":"AC7A"}]'::jsonb,
    'usuarios', jsonb_build_array(jsonb_build_object('id','a1000000-0000-4000-8000-000000000005','nome','G7','papel','GERENTE','lojas','["NAO-EXISTE"]'::jsonb))));
  INSERT INTO atom_res VALUES ('C7 loja desconhecida no fim do lote', erro LIKE '%PROVISIONAR_LOJA_DESCONHECIDA%' AND pg_temp.snap() = antes, coalesce(erro,'passou (FALHA)'));
END $$;

SELECT caso, CASE WHEN ok THEN 'OK' ELSE 'FALHOU' END AS resultado, detalhe FROM atom_res ORDER BY caso;

ROLLBACK;
