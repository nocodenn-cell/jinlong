-- Regressão: empresa nova precisa semear pdv_config SEM violar NOT NULL de gerente_senha_sha256.
-- A coluna é legada (auth do gerente usa gerente_senha_bcrypt, migration 067); seu valor não é lido
-- para autenticar. Teste roda em BEGIN … ROLLBACK e não altera dados existentes.
-- Banco LOCAL/descartável apenas.
\set ON_ERROR_STOP 1
BEGIN;

-- 1) empresa nova: o trigger/função de semeadura cria a linha padrão (loja_id NULL)
INSERT INTO public.empresas (nome) VALUES ('PDVFIX Empresa Nova') RETURNING id AS emp \gset
SELECT (count(*) = 1) AS ok FROM public.pdv_config WHERE empresa_id = :'emp' AND loja_id IS NULL \gset
\if :ok
  \echo PDVFIX OK: 1-empresa nova semeia pdv_config sem gerente_senha_sha256
\else
  \echo PDVFIX FALHOU: 1-empresa nova não semeou pdv_config
  \quit 1
\endif

-- 2) coluna legada aceita NULL; coluna de auth (bcrypt) preservada
SELECT (is_nullable = 'YES') AS ok FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'pdv_config' AND column_name = 'gerente_senha_sha256' \gset
\if :ok
  \echo PDVFIX OK: 2-gerente_senha_sha256 aceita NULL
\else
  \echo PDVFIX FALHOU: 2-gerente_senha_sha256 continua NOT NULL
  \quit 1
\endif
SELECT (data_type = 'text') AS ok FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'pdv_config' AND column_name = 'gerente_senha_bcrypt' \gset
\if :ok
  \echo PDVFIX OK: 3-gerente_senha_bcrypt (auth ativo) intacta
\else
  \echo PDVFIX FALHOU: 3-gerente_senha_bcrypt ausente ou alterada
  \quit 1
\endif

-- 4) dado legado preservado: linha com hash existente continua igual
INSERT INTO public.lojas (nome, codigo, empresa_id) VALUES ('PDVFIX Loja Legado', 'PDVFIX-L1', :'emp') RETURNING id AS loja \gset
INSERT INTO public.pdv_config (id, empresa_id, loja_id, gerente_id, gerente_senha_sha256)
VALUES ((SELECT coalesce(max(id), 0) + 1 FROM public.pdv_config), :'emp', :'loja', 'pdvfix-gerente', 'hash-legado-preservado') RETURNING id AS cfg \gset
SELECT (gerente_senha_sha256 = 'hash-legado-preservado') AS ok FROM public.pdv_config WHERE id = :cfg \gset
\if :ok
  \echo PDVFIX OK: 4-linha legada com hash preservada
\else
  \echo PDVFIX FALHOU: 4-hash legado alterado
  \quit 1
\endif

ROLLBACK;
