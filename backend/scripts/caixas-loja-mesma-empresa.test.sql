-- 20261028140000: caixas.loja_id explícito (sem default da loja piloto) e da mesma empresa do operador.
-- Fixture SINTÉTICA, transação com ROLLBACK. psql "$DB_URL" -v ON_ERROR_STOP=1 -f backend/scripts/caixas-loja-mesma-empresa.test.sql
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL client_min_messages = notice;
\pset tuples_only on
\pset format unaligned
CREATE OR REPLACE FUNCTION pg_temp.tenta(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_msg text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'DESFAZ_OK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RETURN CASE WHEN v_msg = 'DESFAZ_OK' THEN 'OK' ELSE v_msg END;
  END;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.espera(p_nome text, p_obtido text, p_esperado text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_obtido IS DISTINCT FROM p_esperado AND position(p_esperado IN coalesce(p_obtido, '')) = 0 THEN
    RAISE EXCEPTION 'FALHOU %: esperado %, obtido %', p_nome, p_esperado, p_obtido;
  END IF;
  RAISE NOTICE 'ok - %', p_nome;
END $$;

INSERT INTO public.empresas (id, nome) VALUES
  ('ce000001-0000-4000-8000-000000000001', 'Empresa CX teste'), ('ce000002-0000-4000-8000-000000000002', 'Empresa CY teste');
INSERT INTO public.lojas (id, nome, codigo, empresa_id) VALUES
  ('ca000001-0000-4000-8000-000000000001', 'CX1', 'CX1T', 'ce000001-0000-4000-8000-000000000001'),
  ('ca000002-0000-4000-8000-000000000002', 'CX2', 'CX2T', 'ce000001-0000-4000-8000-000000000001'),
  ('cb000001-0000-4000-8000-000000000001', 'CY1', 'CY1T', 'ce000002-0000-4000-8000-000000000002');
INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT x::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cx-' || x || '@t.local'
  FROM unnest(ARRAY['c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001',
                    'c3000000-0000-4000-8000-000000000001']) x;
INSERT INTO public.usuarios (id, nome, perfil, loja_id) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'Operador CX1', 'OPERADOR', 'ca000001-0000-4000-8000-000000000001'),
  ('c2000000-0000-4000-8000-000000000001', 'Operador CY1', 'OPERADOR', 'cb000001-0000-4000-8000-000000000001');
INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES
  ('c3000000-0000-4000-8000-000000000001', 'Operador CY1 inativo com vínculo em CX', 'OPERADOR', 'cb000001-0000-4000-8000-000000000001', false);
INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo) VALUES
  ('c3000000-0000-4000-8000-000000000001', 'ce000001-0000-4000-8000-000000000001', 'ca000002-0000-4000-8000-000000000002', 'OPERADOR', false);

SELECT pg_temp.espera('coluna sem default da loja piloto',
  coalesce((SELECT column_default FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'caixas' AND column_name = 'loja_id'), 'SEM_DEFAULT'), 'SEM_DEFAULT');
SELECT pg_temp.espera('INSERT sem loja_id falha (não cai na piloto)',
  pg_temp.tenta($q$INSERT INTO public.caixas (operador_id, valor_inicial) VALUES ('c1000000-0000-4000-8000-000000000001', 0)$q$),
  'CAIXA_LOJA_OBRIGATORIA');
SELECT pg_temp.espera('loja inexistente: recusada',
  pg_temp.tenta($q$INSERT INTO public.caixas (operador_id, loja_id) VALUES ('c1000000-0000-4000-8000-000000000001', 'cf000009-0000-4000-8000-000000000009')$q$),
  'CAIXA_LOJA_SEM_EMPRESA');
SELECT pg_temp.espera('operador da empresa Y em loja da empresa X: recusado',
  pg_temp.tenta($q$INSERT INTO public.caixas (operador_id, loja_id) VALUES ('c2000000-0000-4000-8000-000000000001', 'ca000001-0000-4000-8000-000000000001')$q$),
  'CAIXA_OPERADOR_DE_OUTRA_EMPRESA');
SELECT pg_temp.espera('operador da loja, mesma empresa: aceito',
  pg_temp.tenta($q$INSERT INTO public.caixas (operador_id, loja_id) VALUES ('c1000000-0000-4000-8000-000000000001', 'ca000001-0000-4000-8000-000000000001')$q$),
  'OK');
SELECT pg_temp.espera('operador de outra loja da MESMA empresa (via cadastro): aceito',
  pg_temp.tenta($q$INSERT INTO public.caixas (operador_id, loja_id) VALUES ('c1000000-0000-4000-8000-000000000001', 'ca000002-0000-4000-8000-000000000002')$q$),
  'OK');
SELECT pg_temp.espera('operador com vínculo (mesmo inativo) na empresa: aceito (atividade é checada em outra camada)',
  pg_temp.tenta($q$INSERT INTO public.caixas (operador_id, loja_id) VALUES ('c3000000-0000-4000-8000-000000000001', 'ca000002-0000-4000-8000-000000000002')$q$),
  'OK');

-- caixa existente (como os 56 de produção): fecha/atualiza sem mexer em loja/operador
INSERT INTO public.caixas (id, operador_id, loja_id) VALUES
  ('cc000001-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'ca000001-0000-4000-8000-000000000001');
SELECT pg_temp.espera('mover caixa para loja de outra empresa: recusado',
  pg_temp.tenta($q$UPDATE public.caixas SET loja_id = 'cb000001-0000-4000-8000-000000000001' WHERE id = 'cc000001-0000-4000-8000-000000000001'$q$),
  'CAIXA_TROCA_DE_EMPRESA');
SELECT pg_temp.espera('trocar operador para um de outra empresa: recusado',
  pg_temp.tenta($q$UPDATE public.caixas SET operador_id = 'c2000000-0000-4000-8000-000000000001' WHERE id = 'cc000001-0000-4000-8000-000000000001'$q$),
  'CAIXA_OPERADOR_DE_OUTRA_EMPRESA');
SELECT pg_temp.espera('mover caixa entre lojas da mesma empresa: aceito',
  pg_temp.tenta($q$UPDATE public.caixas SET loja_id = 'ca000002-0000-4000-8000-000000000002' WHERE id = 'cc000001-0000-4000-8000-000000000001'$q$),
  'OK');
SELECT pg_temp.espera('UPDATE que não toca loja/operador: aceito',
  pg_temp.tenta($q$UPDATE public.caixas SET fechamento_observacao = 'x' WHERE id = 'cc000001-0000-4000-8000-000000000001'$q$),
  'OK');
-- linha legada com operador NULL (6 em produção) continua atualizável
ALTER TABLE public.caixas DISABLE TRIGGER trg_caixas_loja_mesma_empresa;
INSERT INTO public.caixas (id, operador_id, loja_id) VALUES ('cc000002-0000-4000-8000-000000000002', NULL, 'ca000001-0000-4000-8000-000000000001');
ALTER TABLE public.caixas ENABLE TRIGGER trg_caixas_loja_mesma_empresa;
SELECT pg_temp.espera('linha legada (operador NULL) segue atualizável',
  pg_temp.tenta($q$UPDATE public.caixas SET fechamento_observacao = 'legado' WHERE id = 'cc000002-0000-4000-8000-000000000002'$q$),
  'OK');
SELECT pg_temp.espera('trigger instalado', (SELECT count(*)::text FROM pg_trigger
  WHERE tgrelid = 'public.caixas'::regclass AND tgname = 'trg_caixas_loja_mesma_empresa'), '1');
\echo 'caixas-loja-mesma-empresa: 13 casos ok'
ROLLBACK;
