-- ============================================================================
-- Seed local determinístico — Jīn Lóng / FastProduct
--
-- Referenciado por `supabase/config.toml` ([db.seed].sql_paths) e exigido
-- nominalmente por `backend/scripts/financial-adversarial-gates.test.sql`
-- ("Exige o seed local determinístico"). Até a Fase 6 o arquivo não existia em
-- nenhum branch: `supabase db reset` emitia
--   WARN: no files matched pattern: supabase/seed.sql
-- e 5 das 6 suítes do gate financeiro abortavam com
--   fixture: nenhuma loja elegível encontrada (rode o seed local antes)
--
-- ---------------------------------------------------------------------------
-- Contrato de fixture (derivado dos próprios testes, não inventado)
--
-- As 6 suítes de `npm run test:financial` selecionam a loja de trabalho com a
-- MESMA consulta de elegibilidade: uma loja que tenha simultaneamente
--   * ao menos um produto com `preco_varejo > 0`; e
--   * usuários ATIVOS nos três perfis GERENTE, OPERADOR e DONO.
--
-- As migrations sozinhas nunca satisfazem isso:
--   * `Matriz`         (a0000001) → 16 produtos, ZERO usuários
--   * `Loja Teste RLS` (b0000001) → 4 perfis, ZERO produtos (criada por
--                                   `test:rls-scope`, não por migration)
-- Nenhuma das duas é elegível. Este seed fecha a lacuna criando os três
-- perfis DENTRO da Matriz, que já traz produtos e formas de pagamento.
--
-- É exatamente o cenário descrito no comentário do gate adversarial:
--   "`test:rls-scope` cria usuários numa loja sem produtos, e a suíte caía nela."
--
-- ---------------------------------------------------------------------------
-- Idempotência
--
-- Todo o arquivo roda sob UUIDs fixos + ON CONFLICT. Pode ser reaplicado sobre
-- um banco já semeado sem duplicar linha alguma, e é reaplicado automaticamente
-- a cada `supabase db reset`.
--
-- NÃO É PARA PRODUÇÃO. Só é carregado no stack local (`[db.seed]`).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Loja de trabalho
--
-- `a0000001-…-000000000001` é o DEFAULT de `usuarios.loja_id`, `produtos.loja_id`
-- e `estoque.loja_id` no schema — é a loja canônica de fixture, não um valor
-- arbitrário. Criada pelas migrations; o INSERT abaixo é só uma rede de
-- segurança para o caso de o seed rodar antes delas.
--
-- Multiempresa (M1/F1): a Matriz recebe a empresa `LEGADA_M1` no backfill da
-- M1, e o trigger BEFORE INSERT `lojas_empresa_obrigatoria` recusa loja sem
-- empresa. Trigger BEFORE dispara ANTES da checagem de conflito, então um
-- `INSERT ... ON CONFLICT DO NOTHING` sem empresa abortava o seed INTEIRO
-- (LOJA_SEM_EMPRESA) mesmo com a Matriz já existente — e sem seed não havia
-- usuários nem vínculos, e a cerca RLS escondia os produtos da Matriz.
-- Por isso: só insere se faltar, e já com a empresa legada.
-- ---------------------------------------------------------------------------
INSERT INTO public.lojas (id, nome, codigo, empresa_id)
SELECT 'a0000001-0000-4000-8000-000000000001', 'Matriz', 'MATRIZ',
       (SELECT e.id FROM public.empresas e WHERE e.origem = 'LEGADA_M1')
WHERE NOT EXISTS (
  SELECT 1 FROM public.lojas WHERE id = 'a0000001-0000-4000-8000-000000000001'
);

-- ---------------------------------------------------------------------------
-- 2. Identidades (auth.users)
--
-- `public.usuarios.id` é FK para `auth.users(id) ON DELETE CASCADE`: sem a
-- linha em `auth` o perfil não pode existir. Só `id` é NOT NULL sem default;
-- email/role/aud vão junto para que as contas também sirvam a testes manuais
-- de login no Studio local.
--
-- `confirmation_token`, `recovery_token`, `email_change_token_new` e
-- `email_change` são NULLABLE e SEM DEFAULT no schema do GoTrue — sem setá-los
-- aqui, ficam NULL, e o driver Go do GoTrue não sabe fazer scan de NULL nessas
-- colunas: QUALQUER chamada a `admin.listUsers()`/`GET /admin/users` (usada
-- pelo readiness check e por `seed-dev-users.mjs`) quebra com
--   error_code: unexpected_failure, status 500,
--   "unable to fetch records: sql: Scan error on column index 3,
--    name \"confirmation_token\": converting NULL to string is unsupported"
-- de forma 100% determinística (não é flakiness) em TODO `db reset` que rode
-- este seed. As demais colunas de token (`phone_change_token`,
-- `email_change_token_current`, `reauthentication_token`) já têm default
-- `''` no schema do GoTrue e por isso nunca quebraram.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
VALUES
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dono.seed@local.test',     now(), now(), now(), '', '', '', ''),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gerente.seed@local.test',  now(), now(), now(), '', '', '', ''),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador.seed@local.test', now(), now(), now(), '', '', '', ''),
  ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador2.seed@local.test', now(), now(), now(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Perfis (public.usuarios)
--
-- Os três perfis exigidos pela consulta de elegibilidade. `ativo = true` é
-- parte do contrato: a consulta filtra por `u.ativo`.
--
-- O DONO existe por exigência da fixture, mas também é o ator do GATE 6, que
-- prova que NEM o perfil mais alto atravessa a fronteira de loja em AR.
-- ---------------------------------------------------------------------------
INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'Dono Seed',     'DONO',     true, 'a0000001-0000-4000-8000-000000000001'),
  ('22222222-2222-4222-8222-222222222222', 'Gerente Seed',  'GERENTE',  true, 'a0000001-0000-4000-8000-000000000001'),
  ('33333333-3333-4333-8333-333333333333', 'Operador Seed',   'OPERADOR', true, 'a0000001-0000-4000-8000-000000000001'),
  -- Segundo OPERADOR, DELIBERADAMENTE sem caixa aberto (ver seção 4).
  ('44444444-4444-4444-8444-444444444444', 'Operador Seed 2', 'OPERADOR', true, 'a0000001-0000-4000-8000-000000000001')
ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      perfil = EXCLUDED.perfil,
      ativo = EXCLUDED.ativo,
      loja_id = EXCLUDED.loja_id;

-- ---------------------------------------------------------------------------
-- 4. Caixa ABERTO do OPERADOR
--
-- O gate adversarial documenta esta linha explicitamente ao justificar por que
-- o caixa DELE fica com `operador_id` NULL:
--
--   "`operador_id` fica NULL: `uq_caixas_operador_aberto` impede um segundo
--    caixa ABERTO para o mesmo operador, e o seed já abre um para o OPERADOR."
--
-- `uq_caixas_operador_aberto` é UNIQUE parcial em (operador_id) WHERE
-- status='ABERTO'. Em Postgres NULLs são distintos entre si, então o caixa
-- anônimo da suíte convive com este. As duas pontas são necessárias:
-- aqui `operador_id` PRECISA estar preenchido; lá PRECISA ser NULL.
--
-- ---------------------------------------------------------------------------
-- POR QUE EXISTE UM SEGUNDO OPERADOR SEM CAIXA (não remover)
--
-- `sale-totals-invariant.test.sql` abre o próprio caixa escolhendo um OPERADOR
-- que ainda NÃO tenha caixa aberto:
--
--   SELECT u.id FROM public.usuarios u
--    WHERE ... AND NOT EXISTS (SELECT 1 FROM public.caixas c2
--                              WHERE c2.operador_id = u.id AND c2.status='ABERTO')
--
-- Se o único OPERADOR já estiver ocupado por este caixa, a subconsulta devolve
-- NULL e a suíte insere um caixa com `operador_id` NULL. Esse caixa é o mais
-- recente, ganha o `ORDER BY c.data_abertura DESC` do \gset seguinte e faz
-- `test_user` vir NULL — e o psql DESDEFINE a variável quando o valor é NULL.
-- `:'test_user'` sobrevive literal até o servidor e o erro emerge como
--
--   syntax error at or near ":"
--
-- ...a três linhas de distância da causa real. Manter um OPERADOR livre é o
-- que mantém esse caminho determinístico.
-- ---------------------------------------------------------------------------
INSERT INTO public.caixas (id, operador_id, loja_id, status, valor_inicial, saldo_atual)
VALUES ('cadeca11-0000-4000-8000-000000000001',
        '33333333-3333-4333-8333-333333333333',
        'a0000001-0000-4000-8000-000000000001',
        'ABERTO', 0, 0)
ON CONFLICT (id) DO UPDATE
  SET status = 'ABERTO',
      operador_id = EXCLUDED.operador_id,
      loja_id = EXCLUDED.loja_id;

-- ---------------------------------------------------------------------------
-- 5. Estoque das fixtures
--
-- As suítes repõem estoque dos produtos que usam, mas partem do princípio de
-- que a linha (produto, loja) existe. Garante cobertura para toda a Matriz.
-- ---------------------------------------------------------------------------
INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual)
SELECT p.id, p.loja_id, 10000
FROM public.produtos p
WHERE p.loja_id = 'a0000001-0000-4000-8000-000000000001'
ON CONFLICT (produto_id, loja_id) DO UPDATE
  SET quantidade_atual = GREATEST(public.estoque.quantidade_atual, 10000);

-- ---------------------------------------------------------------------------
-- 6. Comissão padrão
--
-- As suítes de comissão fazem seu próprio UPSERT desta chave; fixá-la aqui
-- torna determinístico o estado de partida de quem NÃO a sobrescreve.
-- ---------------------------------------------------------------------------
INSERT INTO public.configuracoes_gerais (chave, valor, tipo_dado)
VALUES ('comissao_padrao_percentual', '5', 'percent')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;

-- ---------------------------------------------------------------------------
-- 7. Vínculos multiempresa dos usuários-semente (F1)
--
-- O trigger `usuarios_sincroniza_vinculo` cria o vínculo LEGADO no INSERT da
-- seção 3, desde que a loja já tenha empresa. A chamada explícita cobre o
-- reaplicar sobre um banco antigo (usuários anteriores ao trigger) e o
-- DO-bloco falha o seed em voz alta se algum usuário-semente ficar sem
-- vínculo ativo — sem ele a cerca `fp_empresas_cerca()` esconde a Matriz e os
-- testes de integração falham longe da causa ("permission denied"/0 linhas).
-- ---------------------------------------------------------------------------
DO $seed_vinculos$
DECLARE
  v_sem_vinculo int;
BEGIN
  PERFORM public.m1_sincronizar_vinculo_usuario(u.id)
  FROM public.usuarios u
  WHERE u.id IN ('11111111-1111-4111-8111-111111111111',
                 '22222222-2222-4222-8222-222222222222',
                 '33333333-3333-4333-8333-333333333333',
                 '44444444-4444-4444-8444-444444444444');

  SELECT count(*) INTO v_sem_vinculo
  FROM public.usuarios u
  JOIN public.lojas l ON l.id = u.loja_id
  WHERE u.id IN ('11111111-1111-4111-8111-111111111111',
                 '22222222-2222-4222-8222-222222222222',
                 '33333333-3333-4333-8333-333333333333',
                 '44444444-4444-4444-8444-444444444444')
    AND NOT EXISTS (
      SELECT 1 FROM public.usuario_vinculos v
      WHERE v.usuario_id = u.id AND v.empresa_id = l.empresa_id AND v.ativo
    );
  IF v_sem_vinculo > 0 THEN
    RAISE EXCEPTION 'SEED_SEM_VINCULO: % usuário(s)-semente sem vínculo ativo na empresa da Matriz', v_sem_vinculo;
  END IF;
END
$seed_vinculos$;

COMMIT;
