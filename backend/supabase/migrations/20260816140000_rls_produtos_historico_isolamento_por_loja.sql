-- Isolamento por loja em `produtos` e `historico_precos_produto`.
--
-- PROBLEMA (comprovado empiricamente em 2026-08-16, transação revertida no
-- projeto de produção): as policies destas duas tabelas não têm predicado de
-- loja. `produtos_leitura` usa `auth.role() = 'authenticated'`;
-- `produtos_escrita` (cmd ALL) e `historico_precos_produto_leitura` verificam
-- apenas o perfil. Um GERENTE da loja A conseguiu, via Data API:
--   - SELECT em produto da loja B (nome, preço, criado_por);
--   - SELECT no histórico de preços da loja B;
--   - UPDATE do preço de produto da loja B.
-- O guard de aplicação (`lib/gerente/assertProdutoDaLojaSessao.ts`) fechou os
-- fluxos que passam por ele, mas acesso direto ao PostgREST seguia aberto.
-- Esta migration fecha na origem.
--
-- REGRA (decisão de produto tomada em 2026-08-16): ADMIN mantém acesso global
-- — alinhado à governança já existente (`docs/AUTHORIZATION_MATRIX.md`, e a
-- função `auth_usuario_gerencial_loja`, que já trata ADMIN como global). Os
-- demais perfis ficam restritos à própria loja, inclusive DONO: a "visão
-- macro" de DONO está documentada para vendas/estoque/caixas, não para
-- catálogo, e na dúvida restringe-se.
--
-- LEITURA vs ESCRITA: leitura é aberta a QUALQUER perfil da mesma loja
-- (OPERADOR precisa ler catálogo no PDV); escrita continua restrita a
-- GERENTE/DONO/ADMIN, agora amarrada à loja.
--
-- FORA DE ESCOPO: as policies `caixa_policy`/`painel_policy` de `produtos`
-- (presentes só em produção — drift; não existem no schema local) usam
-- `auth.jwt() ->> 'role'`, que não é alcançável por um usuário autenticado
-- comum (exigiria forjar JWT com o segredo do projeto). Não são tocadas aqui;
-- ficam registradas em `docs/RLS_POLICY_DIAGNOSTIC.md` para avaliação própria.

-- ─────────────────────────────────────────────────────────────────────────────
-- Helpers (SECURITY DEFINER para não recursar na RLS de `usuarios`)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auth_usuario_eh_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = (SELECT auth.uid()) AND u.perfil = 'ADMIN'
  );
$$;

COMMENT ON FUNCTION public.auth_usuario_eh_admin() IS
  'True quando o usuário da sessão é ADMIN (perfil global). Usado em policies de escopo por loja.';

CREATE OR REPLACE FUNCTION public.auth_usuario_loja_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.loja_id FROM public.usuarios u WHERE u.id = (SELECT auth.uid());
$$;

COMMENT ON FUNCTION public.auth_usuario_loja_id() IS
  'Loja do usuário da sessão (NULL se não houver sessão/usuário). Usado em policies de escopo por loja.';

-- Escopo gerencial de um produto, resolvido pelo id — evita subquery em
-- `produtos` dentro da policy de `historico_precos_produto` (que aplicaria a
-- RLS de produtos recursivamente e complicaria o plano).
CREATE OR REPLACE FUNCTION public.auth_pode_ver_produto_gerencial(p_produto_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.produtos p
    WHERE p.id = p_produto_id
      AND public.auth_usuario_gerencial_loja(p.loja_id)
  );
$$;

COMMENT ON FUNCTION public.auth_pode_ver_produto_gerencial(uuid) IS
  'True quando a sessão tem perfil gerencial na loja do produto informado (ADMIN é global).';

-- ─────────────────────────────────────────────────────────────────────────────
-- produtos
-- ─────────────────────────────────────────────────────────────────────────────

-- Leitura: qualquer perfil autenticado da MESMA loja (OPERADOR lê catálogo no
-- PDV). ADMIN global. Substitui `auth.role() = 'authenticated'`.
DROP POLICY IF EXISTS "produtos_leitura" ON public.produtos;
CREATE POLICY "produtos_leitura"
  ON public.produtos FOR SELECT
  USING (
    public.auth_usuario_eh_admin()
    OR loja_id = public.auth_usuario_loja_id()
  );

-- Escrita: GERENTE/DONO da mesma loja; ADMIN global (auth_usuario_gerencial_loja
-- já implementa essa semântica). WITH CHECK explícito impede dois abusos que o
-- USING sozinho não pega: INSERT de produto já apontando para outra loja, e
-- UPDATE que MOVE um produto da própria loja para outra.
DROP POLICY IF EXISTS "produtos_escrita" ON public.produtos;
CREATE POLICY "produtos_escrita"
  ON public.produtos FOR ALL
  USING (public.auth_usuario_gerencial_loja(loja_id))
  WITH CHECK (public.auth_usuario_gerencial_loja(loja_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- historico_precos_produto
-- ─────────────────────────────────────────────────────────────────────────────

-- Antes: qualquer GERENTE/DONO lia o histórico de QUALQUER produto.
-- Agora: só de produto da própria loja (ADMIN global).
DROP POLICY IF EXISTS "historico_precos_produto_leitura" ON public.historico_precos_produto;
CREATE POLICY "historico_precos_produto_leitura"
  ON public.historico_precos_produto FOR SELECT
  USING (public.auth_pode_ver_produto_gerencial(produto_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- list_produtos_gerente_filtrados — filtro de loja explícito
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A função filtra `estoque` por `p_loja_id`, mas NUNCA filtrou `produtos.loja_id`
-- — dependia inteiramente da RLS. No schema local ela é SECURITY INVOKER (RLS
-- aplica), mas o advisor de produção a reporta como SECURITY DEFINER: nesse
-- estado ela bypassa a RLS e lista produtos de todas as lojas, tornando o
-- hardening acima inútil justamente no caminho da tela de catálogo.
--
-- Correção em duas camadas:
--   1. `SECURITY INVOKER` explícito, para que a RLS acima sempre valha e os
--      dois ambientes convirjam;
--   2. predicado próprio de loja + validação de que `p_loja_id` é mesmo a loja
--      do chamador (ou que ele é ADMIN). Sendo função SQL, a checagem entra
--      como predicado: chamador não autorizado recebe zero linhas em vez de
--      erro — sem oráculo de existência.

CREATE OR REPLACE FUNCTION public.list_produtos_gerente_filtrados(
  p_loja_id uuid,
  p_situacao text,
  p_origem_filtro text,
  p_nf_filtro text,
  p_estoque_filtro text,
  p_imagens_filtro text,
  p_tags_filtro text[],
  p_categoria_id uuid,
  p_marca_id uuid,
  p_fornecedor_id uuid,
  p_busca text,
  p_page integer,
  p_page_size integer
)
RETURNS TABLE(
  id uuid, nome text, codigo_barras text, preco_varejo numeric, origem text,
  tem_nf boolean, ativo boolean, categoria_id uuid, fornecedor_id uuid,
  marca_id uuid, imagem_url text, tags text[], total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  WITH base AS (
    SELECT
      pr.id,
      pr.nome,
      pr.codigo_barras,
      pr.preco_varejo,
      pr.origem::text AS origem,
      pr.tem_nf,
      pr.ativo,
      pr.categoria_id,
      pr.fornecedor_id,
      pr.marca_id,
      pr.imagem_url,
      pr.tags
    FROM public.produtos pr
    WHERE
      -- Escopo de tenant: o produto tem de ser da loja pedida, e a loja pedida
      -- tem de ser a do próprio chamador (ADMIN pode consultar qualquer uma).
      pr.loja_id = p_loja_id
      AND (
        public.auth_usuario_eh_admin()
        OR p_loja_id = public.auth_usuario_loja_id()
      )
      AND (p_situacao = 'todos' OR (p_situacao = 'ativos' AND pr.ativo) OR (p_situacao = 'inativos' AND NOT pr.ativo))
      AND (p_origem_filtro = 'all' OR pr.origem::text = p_origem_filtro)
      AND (
        p_nf_filtro = 'all'
        OR (p_nf_filtro = 'sim' AND pr.tem_nf)
        OR (p_nf_filtro = 'nao' AND NOT pr.tem_nf)
      )
      AND (
        p_estoque_filtro = 'todos'
        OR (
          p_estoque_filtro = 'abaixo_minimo'
          AND EXISTS (
            SELECT 1
            FROM public.estoque e
            WHERE e.produto_id = pr.id
              AND e.loja_id = p_loja_id
              AND e.quantidade_atual <= e.estoque_minimo
          )
        )
        OR (
          p_estoque_filtro = 'em_falta'
          AND EXISTS (
            SELECT 1
            FROM public.estoque e
            WHERE e.produto_id = pr.id
              AND e.loja_id = p_loja_id
              AND e.quantidade_atual <= 0::numeric
          )
        )
      )
      AND (
        p_imagens_filtro = 'todos'
        OR (
          p_imagens_filtro = 'com_imagem'
          AND pr.imagem_url IS NOT NULL
          AND btrim(pr.imagem_url) <> ''
        )
        OR (
          p_imagens_filtro = 'sem_imagem'
          AND (pr.imagem_url IS NULL OR btrim(pr.imagem_url) = '')
        )
      )
      AND (
        p_tags_filtro IS NULL
        OR cardinality(p_tags_filtro) = 0
        OR (COALESCE(pr.tags, '{}'::text[]) && p_tags_filtro)
      )
      AND (p_categoria_id IS NULL OR pr.categoria_id = p_categoria_id)
      AND (p_marca_id IS NULL OR pr.marca_id = p_marca_id)
      AND (p_fornecedor_id IS NULL OR pr.fornecedor_id = p_fornecedor_id)
      AND (
        p_busca IS NULL
        OR length(trim(p_busca)) = 0
        OR pr.nome ILIKE '%' || trim(p_busca) || '%'
        OR (pr.codigo_barras IS NOT NULL AND pr.codigo_barras ILIKE '%' || trim(p_busca) || '%')
        OR pr.id::text ILIKE '%' || trim(p_busca) || '%'
      )
  ),
  numbered AS (
    SELECT
      b.*,
      count(*) OVER () AS total_count
    FROM base b
  )
  SELECT
    n.id,
    n.nome,
    n.codigo_barras,
    n.preco_varejo,
    n.origem,
    n.tem_nf,
    n.ativo,
    n.categoria_id,
    n.fornecedor_id,
    n.marca_id,
    n.imagem_url,
    n.tags,
    n.total_count
  FROM numbered n
  ORDER BY n.nome ASC
  LIMIT greatest(coalesce(nullif(p_page_size, 0), 10), 1)
  OFFSET (greatest(coalesce(nullif(p_page, 0), 1), 1) - 1) * greatest(coalesce(nullif(p_page_size, 0), 10), 1);
$function$;

-- Grants dos helpers.
--
-- ATENÇÃO (achado no smoke de integração, 2026-08-16): estas funções são
-- avaliadas DENTRO das policies, no contexto do usuário que consulta — ou seja,
-- `authenticated` precisa de EXECUTE, senão toda leitura/escrita passa a ser
-- negada. Revogar de PUBLIC sem conceder explicitamente a `authenticated`
-- derruba o grant implícito que ele herdava via PUBLIC e bloqueia o app
-- inteiro. O smoke pegou isso: todos os checks negativos "passaram" (porque
-- tudo estava negado) enquanto os de não-regressão falharam.
--
-- Mesmo padrão de `auth_usuario_gerencial_loja`, que já é
-- {authenticated, service_role}.
REVOKE EXECUTE ON FUNCTION public.auth_usuario_eh_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_usuario_loja_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_pode_ver_produto_gerencial(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.auth_usuario_eh_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_usuario_loja_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_pode_ver_produto_gerencial(uuid) TO authenticated, service_role;
