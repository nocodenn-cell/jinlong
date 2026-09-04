-- Item 7 do plano de fechamento de gaps (auditoria Jīn Lóng, achado P1 —
-- Storage do bucket `produto-imagens` sem isolamento por loja em
-- UPDATE/DELETE).
--
-- CAUSA RAIZ (revisada por teste real — corrige a leitura inicial do
-- achado em dois pontos)
-- ---------------------------------------------------------------------
-- 1. A policy de INSERT (088_produto_imagens_storage_bucket.sql) já tinha
--    `EXISTS (SELECT 1 FROM public.produtos p WHERE p.id::text =
--    split_part(name,'/',1))`. Essa subquery roda como o papel
--    `authenticated` que está fazendo o INSERT — logo já é filtrada pela
--    RLS de `produtos` (`produtos_leitura`: `auth_usuario_eh_admin() OR
--    loja_id = auth_usuario_loja_id()`). Prova empírica (psql, sessão
--    authenticated real): `SELECT id FROM produtos WHERE id::text =
--    '<produto de outra loja>'` retorna 0 linhas para GERENTE/DONO de
--    outra loja — ou seja, o INSERT já era protegido contra cross-loja.
--
-- 2. UPDATE e DELETE nunca tinham esse EXISTS — checavam só `bucket_id` +
--    perfil, sem nenhuma referência a `produtos`.
--
-- 3. Achado adicional durante a implementação (não estava no diagnóstico
--    original): `storage.objects` NUNCA teve uma policy `FOR SELECT`.
--    Em Postgres, UPDATE/DELETE precisam localizar a linha-alvo por uma
--    via equivalente a SELECT — sem NENHUMA policy de SELECT/ALL
--    aplicável ao papel, o planner prova a visibilidade como falsa
--    incondicionalmente (`EXPLAIN` mostra "One-Time Filter: false" mesmo
--    com `USING (true)` nas policies de UPDATE/DELETE). Confirmado que
--    produção tem exatamente as mesmas 3 policies (sem SELECT) — não é
--    drift local. Ou seja: hoje, UPDATE/DELETE via `authenticated` nunca
--    afetam nenhuma linha nesta tabela, para ninguém, loja própria ou
--    alheia — o gap de isolamento por loja nunca chegou a ser
--    explorável por essa via específica, mas a ausência de SELECT também
--    significa que a própria funcionalidade de UPDATE/DELETE está inerte.
--    Reads normais de exibição de imagem não dependem disso (o bucket é
--    `public: true`, servido por URL pública fora do caminho de RLS).
--
-- CORREÇÃO
-- --------
-- 1. Replica em UPDATE/DELETE o MESMO EXISTS que INSERT já usa (não
--    inventa uma condição de loja nova; reaproveita a RLS de `produtos`,
--    que já resolve GERENTE/DONO restritos à própria loja e ADMIN
--    global — mesmo padrão de visibilidade que este bucket sempre teve).
-- 2. Adiciona a policy de SELECT que faltava, com a mesma condição — sem
--    ela, a correção de UPDATE/DELETE seria apenas textual (a tabela
--    continuaria sem visibilidade nenhuma para esses comandos).
--
-- ROLLBACK
-- --------
-- Recriar `produto_imagens_update_gerencial` e `produto_imagens_delete_
-- gerencial` exatamente como em 088_produto_imagens_storage_bucket.sql
-- (sem o EXISTS de produtos); `DROP POLICY produto_imagens_select_
-- gerencial` (não existia antes desta migration).

BEGIN;

CREATE POLICY "produto_imagens_select_gerencial"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'produto-imagens'
    AND EXISTS (
      SELECT 1 FROM public.produtos p WHERE p.id::text = split_part(name, '/', 1)
    )
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "produto_imagens_update_gerencial" ON storage.objects;
CREATE POLICY "produto_imagens_update_gerencial"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'produto-imagens'
    AND EXISTS (
      SELECT 1 FROM public.produtos p WHERE p.id::text = split_part(name, '/', 1)
    )
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  )
  WITH CHECK (
    bucket_id = 'produto-imagens'
    AND EXISTS (
      SELECT 1 FROM public.produtos p WHERE p.id::text = split_part(name, '/', 1)
    )
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "produto_imagens_delete_gerencial" ON storage.objects;
CREATE POLICY "produto_imagens_delete_gerencial"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'produto-imagens'
    AND EXISTS (
      SELECT 1 FROM public.produtos p WHERE p.id::text = split_part(name, '/', 1)
    )
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — falha a transação se as 3 policies não existirem
-- referenciando `produtos` (checagem estrutural).
-- ═══════════════════════════════════════════════════════════════════════════

DO $verify$
DECLARE
  v_select text;
  v_update_using text;
  v_delete text;
BEGIN
  SELECT qual INTO v_select FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'produto_imagens_select_gerencial';
  SELECT qual INTO v_update_using FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'produto_imagens_update_gerencial';
  SELECT qual INTO v_delete FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'produto_imagens_delete_gerencial';

  IF v_select IS NULL OR v_select NOT LIKE '%FROM produtos p%' THEN
    RAISE EXCEPTION 'STORAGE_PRODUTO_IMAGENS_SELECT_AUSENTE_OU_SEM_JOIN: %', v_select;
  END IF;
  IF v_update_using IS NULL OR v_update_using NOT LIKE '%FROM produtos p%' THEN
    RAISE EXCEPTION 'STORAGE_PRODUTO_IMAGENS_UPDATE_SEM_JOIN_PRODUTOS: %', v_update_using;
  END IF;
  IF v_delete IS NULL OR v_delete NOT LIKE '%FROM produtos p%' THEN
    RAISE EXCEPTION 'STORAGE_PRODUTO_IMAGENS_DELETE_SEM_JOIN_PRODUTOS: %', v_delete;
  END IF;

  RAISE NOTICE 'Storage produto-imagens: SELECT criada (faltava) + UPDATE/DELETE agora exigem que o produto referenciado exista e seja visível ao ator (RLS de produtos já resolve loja/ADMIN).';
END
$verify$;

COMMIT;
