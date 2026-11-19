-- Homologação/CI (20261030100000): token de dispositivo (sem emissor) vale só na própria loja e com aprovador ativo
-- da empresa; sem aprovador, aprovador inativo, loja divergente ou sem loja ⇒ fora. Emissor presente segue a regra antiga.
-- Fixture SINTÉTICA numa transação com ROLLBACK (não deixa dados). Rodar: psql "$DB_URL" -v ON_ERROR_STOP=1 -f
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL client_min_messages = warning;

-- Empresa D (lojas D1, D2) e Empresa E (loja E1).
INSERT INTO public.empresas (id, nome) VALUES
  ('fd000001-0000-4000-8000-000000000001', 'Empresa D teste'), ('fd000002-0000-4000-8000-000000000002', 'Empresa E teste');
INSERT INTO public.lojas (id, nome, codigo, empresa_id) VALUES
  ('fd100001-0000-4000-8000-000000000001', 'D1', 'TD1', 'fd000001-0000-4000-8000-000000000001'),
  ('fd100002-0000-4000-8000-000000000002', 'D2', 'TD2', 'fd000001-0000-4000-8000-000000000001'),
  ('fe100001-0000-4000-8000-000000000001', 'E1', 'TE1', 'fd000002-0000-4000-8000-000000000002');
INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT x::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tst-' || x || '@t.local'
  FROM unnest(ARRAY['fd200000-0000-4000-8000-000000000001','fd200000-0000-4000-8000-000000000002',
                    'fd200000-0000-4000-8000-000000000003','fe200000-0000-4000-8000-000000000001']) x;
-- D1: gerente ativo (G1) e gerente inativo (G2). E1: gerente (G3).
INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES
  ('fd200000-0000-4000-8000-000000000001', 'Gerente D1', 'GERENTE', 'fd100001-0000-4000-8000-000000000001', true),
  ('fd200000-0000-4000-8000-000000000002', 'Gerente D1 inativo', 'GERENTE', 'fd100001-0000-4000-8000-000000000001', false),
  ('fd200000-0000-4000-8000-000000000003', 'Gerente D2', 'GERENTE', 'fd100002-0000-4000-8000-000000000002', true),
  ('fe200000-0000-4000-8000-000000000001', 'Gerente E1', 'GERENTE', 'fe100001-0000-4000-8000-000000000001', true);
INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo) VALUES
  ('fd200000-0000-4000-8000-000000000001', 'fd000001-0000-4000-8000-000000000001', 'fd100001-0000-4000-8000-000000000001', 'GERENTE', true),
  ('fd200000-0000-4000-8000-000000000002', 'fd000001-0000-4000-8000-000000000001', 'fd100001-0000-4000-8000-000000000001', 'GERENTE', false),
  ('fd200000-0000-4000-8000-000000000003', 'fd000001-0000-4000-8000-000000000001', 'fd100002-0000-4000-8000-000000000002', 'GERENTE', true),
  ('fe200000-0000-4000-8000-000000000001', 'fd000002-0000-4000-8000-000000000002', 'fe100001-0000-4000-8000-000000000001', 'GERENTE', true)
  -- o gatilho de usuarios já cria vínculos pelo perfil/loja: não duplicar
ON CONFLICT DO NOTHING;

-- Tokens de dispositivo (criado_por NULL): T1 válido em D1; T2 sem aprovador; T3 aprovador inativo; T4 sem loja.
INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, loja_id, criado_por, aprovador_id) VALUES
  ('sec-disp-t1', now() + interval '5 min', false, 'fd100001-0000-4000-8000-000000000001', NULL, 'fd200000-0000-4000-8000-000000000001'),
  ('sec-disp-t2', now() + interval '5 min', false, 'fd100001-0000-4000-8000-000000000001', NULL, NULL),
  ('sec-disp-t3', now() + interval '5 min', false, 'fd100001-0000-4000-8000-000000000001', NULL, 'fd200000-0000-4000-8000-000000000002'),
  ('sec-disp-t4', now() + interval '5 min', false, NULL, NULL, 'fd200000-0000-4000-8000-000000000001');

DO $t$
DECLARE
  d1 uuid := 'fd100001-0000-4000-8000-000000000001';
  d2 uuid := 'fd100002-0000-4000-8000-000000000002';
  e1 uuid := 'fe100001-0000-4000-8000-000000000001';
BEGIN
  IF NOT public.fp_token_gerente_vale_na_loja('sec-disp-t1', d1) THEN
    RAISE EXCEPTION 'DISP_FALHOU: token de dispositivo válido deveria valer na própria loja';
  END IF;
  IF public.fp_token_gerente_vale_na_loja('sec-disp-t1', d2) THEN
    RAISE EXCEPTION 'DISP_FALHOU: token de D1 não pode valer em D2';
  END IF;
  IF public.fp_token_gerente_vale_na_loja('sec-disp-t1', e1) THEN
    RAISE EXCEPTION 'DISP_FALHOU: token de D1 não pode valer em outra empresa';
  END IF;
  IF public.fp_token_gerente_vale_na_loja('sec-disp-t2', d1) THEN
    RAISE EXCEPTION 'DISP_FALHOU: token sem aprovador não pode valer';
  END IF;
  IF public.fp_token_gerente_vale_na_loja('sec-disp-t3', d1) THEN
    RAISE EXCEPTION 'DISP_FALHOU: aprovador inativo não pode validar token';
  END IF;
  IF public.fp_token_gerente_vale_na_loja('sec-disp-t4', d1) THEN
    RAISE EXCEPTION 'DISP_FALHOU: token sem loja não pode valer em loja nenhuma';
  END IF;
  IF public.fp_token_gerente_vale_na_loja('sec-disp-t1', NULL) THEN
    RAISE EXCEPTION 'DISP_FALHOU: loja nula nunca valida';
  END IF;
  RAISE NOTICE 'DISP OK: token de dispositivo vale só na própria loja, com aprovador ativo';
END
$t$;

ROLLBACK;
