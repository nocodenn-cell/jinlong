-- Item 7 — regressão de 20260904100000_storage_produto_imagens_tenant_isolation.sql
-- (achado P1 da auditoria Jīn Lóng: Storage de produto-imagens sem
-- isolamento por loja em UPDATE/DELETE).
--
-- NOTA IMPORTANTE (achado durante a implementação, não no diagnóstico
-- inicial): a policy de INSERT já era protegida contra cross-loja, porque
-- seu EXISTS(SELECT FROM produtos ...) roda como o papel `authenticated` e
-- já é filtrado pela RLS de `produtos` (`produtos_leitura`:
-- `auth_usuario_eh_admin() OR loja_id = auth_usuario_loja_id()`). O gap
-- real era só em UPDATE/DELETE, que nunca referenciavam `produtos`. Este
-- teste prova os dois lados: INSERT (já protegido, sem mudança) e
-- UPDATE/DELETE (corrigidos nesta migration).
--
-- Prova, com dados sintéticos (2 lojas, 1 GERENTE por loja, 1 ADMIN,
-- 1 produto por loja), os cenários:
--   1. GERENTE loja A tenta INSERT em objeto de produto da loja B -> NEGADO
--      (proteção pré-existente, via RLS de produtos).
--   2. GERENTE loja A tenta UPDATE em objeto de produto da loja B -> NEGADO
--      (proteção NOVA desta migration).
--   3. GERENTE loja A tenta DELETE em objeto de produto da loja B -> NEGADO
--      (proteção NOVA desta migration).
--   4. GERENTE loja A consegue INSERT em objeto do produto da própria
--      loja -> PERMITIDO (fluxo real não pode quebrar).
--   5. ADMIN consegue UPDATE cross-loja -> PERMITIDO (produtos_leitura já
--      trata ADMIN como global — não é uma regra nova desta migration,
--      é o mesmo padrão de visibilidade que produtos sempre teve).
-- Tudo dentro de uma transação com ROLLBACK final — nada persiste (nem
-- linha em storage.objects, nem arquivo real — não é upload de verdade).

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja_a uuid := 'f000000c-0000-4000-8000-00000000000a';
  v_loja_b uuid := 'f000000c-0000-4000-8000-00000000000b';
  v_gerente_a uuid := 'f000000c-0000-4000-8000-00000000000c';
  v_gerente_b uuid := 'f000000c-0000-4000-8000-00000000000d';
  v_admin uuid := 'f000000c-0000-4000-8000-0000000000ad';
  v_categoria uuid := 'f000000c-0000-4000-8000-000000000003';
  v_produto_a uuid := 'f000000c-0000-4000-8000-000000000004';
  v_produto_b uuid := 'f000000c-0000-4000-8000-000000000005';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente_a), (v_gerente_b), (v_admin)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES
    (v_loja_a, 'Item7 Loja A', 'ITEM7-A', true),
    (v_loja_b, 'Item7 Loja B', 'ITEM7-B', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id, idioma_preferido) VALUES
    (v_gerente_a, 'Item7 Gerente A', 'GERENTE', true, v_loja_a, 'pt'),
    (v_gerente_b, 'Item7 Gerente B', 'GERENTE', true, v_loja_b, 'pt'),
    (v_admin, 'Item7 Admin', 'ADMIN', true, v_loja_a, 'pt')
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  INSERT INTO public.categorias (id, nome) VALUES (v_categoria, 'Item7 Categoria')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id)
  VALUES
    (v_produto_a, '7899999990394', 'Item7 Produto A', v_categoria, 10.00, 'china_manual', false, true, v_loja_a),
    (v_produto_b, '7899999990493', 'Item7 Produto B', v_categoria, 10.00, 'china_manual', false, true, v_loja_b)
  ON CONFLICT (id) DO UPDATE SET ativo = true, loja_id = EXCLUDED.loja_id;
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 1/2/3 — GERENTE loja A tenta INSERT/UPDATE/DELETE em objeto do
-- produto da loja B
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_cross_loja$
DECLARE
  v_gerente_a uuid := 'f000000c-0000-4000-8000-00000000000c';
  v_produto_b uuid := 'f000000c-0000-4000-8000-000000000005';
  v_path text := v_produto_b::text || '/foto.jpg';
BEGIN
  -- Semente do objeto (como se já existisse, gravado por outra sessão) —
  -- via role postgres, sem RLS, só para existir uma linha para tentar
  -- UPDATE/DELETE.
  -- Sem ON CONFLICT: o índice único de storage.objects muda entre versões do Storage
  -- (na stack do CLI 2.121 não há mais índice em (bucket_id, name)); NOT EXISTS vale para todas.
  INSERT INTO storage.objects (bucket_id, name, owner)
  SELECT 'produto-imagens', v_path, v_produto_b
  WHERE NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'produto-imagens' AND o.name = v_path);

  PERFORM set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  -- Só desarma o protetor genérico storage.protect_delete() (bloqueia
  -- QUALQUER DELETE direto, de qualquer role, por padrão) — o que este
  -- teste quer exercitar é a policy RLS por trás, não essa segunda trava.
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('produto-imagens', v_produto_b::text || '/foto2.jpg', v_gerente_a);
    RAISE EXCEPTION 'ITEM7_FALHOU: GERENTE loja A inseriu objeto de produto da loja B';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE != '42501' THEN RAISE; END IF;
      RAISE NOTICE 'Negativo 1 OK: INSERT cross-loja negado — proteção pré-existente via RLS de produtos (%).', SQLERRM;
  END;

  UPDATE storage.objects SET metadata = '{"x":1}'::jsonb WHERE bucket_id = 'produto-imagens' AND name = v_path;
  IF FOUND THEN
    RAISE EXCEPTION 'ITEM7_FALHOU: GERENTE loja A conseguiu UPDATE em objeto de produto da loja B';
  END IF;
  RAISE NOTICE 'Negativo 2 OK: UPDATE cross-loja negado (0 linhas afetadas) — correção desta migration.';

  DELETE FROM storage.objects WHERE bucket_id = 'produto-imagens' AND name = v_path;
  IF FOUND THEN
    RAISE EXCEPTION 'ITEM7_FALHOU: GERENTE loja A conseguiu DELETE em objeto de produto da loja B';
  END IF;
  RAISE NOTICE 'Negativo 3 OK: DELETE cross-loja negado (0 linhas afetadas) — correção desta migration.';

  RESET ROLE;
END
$neg_cross_loja$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Positivo 1 — GERENTE loja A consegue INSERT no próprio produto
-- ═══════════════════════════════════════════════════════════════════════════

DO $pos_mesma_loja$
DECLARE
  v_gerente_a uuid := 'f000000c-0000-4000-8000-00000000000c';
  v_produto_a uuid := 'f000000c-0000-4000-8000-000000000004';
  v_linhas int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('produto-imagens', v_produto_a::text || '/foto.jpg', v_gerente_a);
  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  RESET ROLE;

  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'ITEM7_FALHOU: GERENTE não conseguiu INSERT em objeto do próprio produto (linhas=%)', v_linhas;
  END IF;
  RAISE NOTICE 'Positivo 1 OK: GERENTE loja A insere imagem do próprio produto normalmente.';
END
$pos_mesma_loja$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Positivo 2 — ADMIN consegue UPDATE cross-loja (produtos_leitura já
-- trata ADMIN como global — padrão pré-existente, não introduzido aqui)
-- ═══════════════════════════════════════════════════════════════════════════

DO $pos_admin_cross_loja$
DECLARE
  v_admin uuid := 'f000000c-0000-4000-8000-0000000000ad';
  v_produto_b uuid := 'f000000c-0000-4000-8000-000000000005';
  v_path text := v_produto_b::text || '/foto-admin.jpg';
  v_linhas int;
BEGIN
  -- Sem ON CONFLICT: o índice único de storage.objects muda entre versões do Storage
  -- (na stack do CLI 2.121 não há mais índice em (bucket_id, name)); NOT EXISTS vale para todas.
  INSERT INTO storage.objects (bucket_id, name, owner)
  SELECT 'produto-imagens', v_path, v_produto_b
  WHERE NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'produto-imagens' AND o.name = v_path);

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  UPDATE storage.objects SET metadata = '{"ok":1}'::jsonb WHERE bucket_id = 'produto-imagens' AND name = v_path;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  RESET ROLE;

  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'ITEM7_FALHOU: ADMIN não conseguiu UPDATE cross-loja (linhas=%)', v_linhas;
  END IF;
  RAISE NOTICE 'Positivo 2 OK: ADMIN atualiza imagem de produto de outra loja normalmente (mesmo padrão de produtos_leitura).';
END
$pos_admin_cross_loja$;

SELECT 'ITEM7 STORAGE PRODUTO-IMAGENS TENANT ISOLATION: OK' AS resultado;
ROLLBACK;
