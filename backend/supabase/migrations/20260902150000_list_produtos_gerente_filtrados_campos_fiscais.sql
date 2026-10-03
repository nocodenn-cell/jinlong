-- Fase C / Hotfix C2.8 (prontidão Focus NFe) — P0: preservação de campos
-- fiscais na edição de produto.
--
-- ACHADO (Gate C2.7, seção 1): `list_produtos_gerente_filtrados` — única
-- fonte de dados da tela `/admin/catalogo` e do fluxo de edição (confirmado:
-- não existe refetch entre o clique em "editar" e a abertura do modal) —
-- não devolve NENHUM campo fiscal no `RETURNS TABLE`. O formulário de edição
-- hidrata a partir dessa linha "fantasma" (ncm/cfop_produto/cest/icms_origem
-- sempre vêm NULL; csosn/cst_pis/cst_cofins sempre vêm no valor DEFAULT do
-- formulário, nunca no valor real gravado). Como o UPDATE
-- (`atualizar_produto_com_faixa_atacado`) só preserva uma coluna quando a
-- CHAVE está AUSENTE do payload — e o cliente sempre envia todas as chaves
-- fiscais presentes — **toda edição salva por essa tela apaga a
-- classificação fiscal real do produto**, mesmo que o operador só tenha
-- mudado o nome ou o preço. TypeScript/mappers (`RpcProdutoFilteredRow`,
-- `mapFilteredRow`, `ProductListFilteredRow`) já esperavam essas colunas
-- desde antes desta migration — ficaram "fantasma" porque só a RPC nunca as
-- devolveu. Fix mínimo: estender a RPC. Zero mudança de TypeScript
-- necessária (fecha a cadeia inteira já cabeada).
--
-- POSTGRES: `CREATE OR REPLACE FUNCTION` NÃO permite adicionar colunas a um
-- `RETURNS TABLE` existente — testado empiricamente contra este mesmo banco
-- antes de escrever esta migration:
--   ERROR: cannot change return type of existing function
--   DETAIL: Row type defined by OUT parameters is different.
--   HINT: Use DROP FUNCTION list_produtos_gerente_filtrados(...) first.
-- Por isso esta migration faz DROP + CREATE (não CREATE OR REPLACE),
-- preservando explicitamente owner (postgres), SECURITY INVOKER
-- (confirmado via pg_proc.prosecdef = false — a RLS de `produtos` é quem
-- isola o tenant, não esta função), STABLE, `search_path = public,
-- pg_catalog`, e o GRANT exato pré-existente (confirmado via
-- pg_proc.proacl): `authenticated` + `service_role` com EXECUTE, PUBLIC/anon
-- sem acesso. Nenhum objeto depende desta função (`pg_depend` confirmado
-- vazio) — DROP é seguro, sem CASCADE necessário.
--
-- NÃO MASCARADO COM DEFAULT/COALESCE: os 7 campos novos são propagados
-- literalmente de `produtos.<coluna>` — nenhum `COALESCE`, nenhum valor
-- inventado. Produto com campo fiscal legitimamente NULL continua
-- devolvendo NULL (provado no bloco de verificação abaixo, contra um
-- produto real, incluindo o caso `icms_origem IS NULL`).
--
-- ÚNICO TRECHO ALTERADO: a lista de colunas selecionadas/devolvidas. Todo o
-- resto do corpo (filtros de tenant/situação/origem/nf/estoque/imagens/tags/
-- categoria/marca/fornecedor/busca, paginação, `total_count` via window
-- function) é copiado verbatim de 20260816140000_rls_produtos_historico_
-- isolamento_por_loja.sql — nenhuma mudança de comportamento de filtro/RLS.
--
-- ROLLBACK: reaplicar o CREATE FUNCTION anterior (preservando GRANT/COMMENT),
-- disponível em 20260816140000_rls_produtos_historico_isolamento_por_loja.sql
-- (linhas 162-336). Como o DROP também remove GRANT/COMMENT, um rollback
-- precisaria reexecutar o bloco de GRANT/COMMENT daquela migration também.

BEGIN;

DROP FUNCTION public.list_produtos_gerente_filtrados(
  uuid, text, text, text, text, text, text[], uuid, uuid, uuid, text, integer, integer
);

CREATE FUNCTION public.list_produtos_gerente_filtrados(
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
  id uuid, nome text, codigo_barras text, preco_varejo numeric,
  preco_atacado numeric, quantidade_gatilho_atacado integer, origem text,
  tem_nf boolean, ativo boolean, categoria_id uuid, fornecedor_id uuid,
  marca_id uuid, unidade_medida text, observacao text, imagem_url text,
  tags text[], total_count bigint,
  -- Hotfix C2.8: campos fiscais, propagados literalmente (sem COALESCE/default).
  ncm text, cfop_produto text, csosn text, cest text, cst_pis text,
  cst_cofins text, icms_origem text
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
      pr.preco_atacado,
      pr.quantidade_gatilho_atacado,
      pr.origem::text AS origem,
      pr.tem_nf,
      pr.ativo,
      pr.categoria_id,
      pr.fornecedor_id,
      pr.marca_id,
      pr.unidade_medida,
      pr.observacao,
      pr.imagem_url,
      pr.tags,
      pr.ncm,
      pr.cfop_produto,
      pr.csosn,
      pr.cest,
      pr.cst_pis,
      pr.cst_cofins,
      pr.icms_origem
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
    n.preco_atacado,
    n.quantidade_gatilho_atacado,
    n.origem,
    n.tem_nf,
    n.ativo,
    n.categoria_id,
    n.fornecedor_id,
    n.marca_id,
    n.unidade_medida,
    n.observacao,
    n.imagem_url,
    n.tags,
    n.total_count,
    n.ncm,
    n.cfop_produto,
    n.csosn,
    n.cest,
    n.cst_pis,
    n.cst_cofins,
    n.icms_origem
  FROM numbered n
  ORDER BY n.nome ASC
  LIMIT greatest(coalesce(nullif(p_page_size, 0), 10), 1)
  OFFSET (greatest(coalesce(nullif(p_page, 0), 1), 1) - 1) * greatest(coalesce(nullif(p_page_size, 0), 10), 1);
$function$;

REVOKE EXECUTE ON FUNCTION public.list_produtos_gerente_filtrados(
  uuid, text, text, text, text, text, text[], uuid, uuid, uuid, text, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_produtos_gerente_filtrados(
  uuid, text, text, text, text, text, text[], uuid, uuid, uuid, text, integer, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.list_produtos_gerente_filtrados(
  uuid, text, text, text, text, text, text[], uuid, uuid, uuid, text, integer, integer
) IS
  'Listagem paginada do catálogo por loja. SECURITY INVOKER: a RLS de `produtos` é quem isola o tenant; '
  'o predicado de loja e a validação de p_loja_id são defesa em profundidade. '
  'Hotfix C2.8 (2026-09-02, prontidão Focus NFe): devolve também ncm/cfop_produto/csosn/cest/cst_pis/'
  'cst_cofins/icms_origem — antes ausentes, causando perda silenciosa desses campos em toda edição salva '
  'pela tela /admin/catalogo (a UI de edição usa esta RPC como única fonte, sem refetch).';

NOTIFY pgrst, 'reload schema';

DO $verify$
DECLARE
  v_ret text;
  v_owner text;
  v_secdef boolean;
  v_search_path text[];
  v_acl text[];
  v_loja_id uuid;
  v_uid_teste uuid;
  v_prod_com_dados uuid;
  v_prod_null uuid;
  v_row record;
BEGIN
  -- B2 (go-live): o autoteste roda dentro de um sub-bloco que SEMPRE termina
  -- com a exceção sentinela VRB01. O Postgres desfaz tudo o que o sub-bloco
  -- gravou (vendas, itens, pagamentos, estoque, saldo, kardex, comissões,
  -- documentos fiscais, eventos). As asserções continuam valendo: qualquer
  -- outra exceção (inclusive as RAISE do teste) não é capturada e aborta a
  -- migration, como antes. Os RETURN de pré-condição vêm antes de qualquer
  -- escrita, então não deixam efeito.
  BEGIN
  -- Contrato: assinatura/segurança/dono preservados após DROP+CREATE.
  SELECT pg_get_function_result(p.oid), p.proowner::regrole::text, p.prosecdef, p.proconfig
  INTO v_ret, v_owner, v_secdef, v_search_path
  FROM pg_proc p WHERE p.proname = 'list_produtos_gerente_filtrados';

  IF v_owner IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'C2_8_OWNER_ALTERADO: %', v_owner;
  END IF;
  IF v_secdef IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'C2_8_SECURITY_ALTERADA: esperado INVOKER (prosecdef=false), obtido %', v_secdef;
  END IF;
  IF NOT ('search_path=public, pg_catalog' = ANY(v_search_path)) THEN
    RAISE EXCEPTION 'C2_8_SEARCH_PATH_ALTERADO: %', v_search_path;
  END IF;
  IF position('ncm text' IN v_ret) = 0 OR position('icms_origem text' IN v_ret) = 0
     OR position('cfop_produto text' IN v_ret) = 0 OR position('csosn text' IN v_ret) = 0
     OR position('cest text' IN v_ret) = 0 OR position('cst_pis text' IN v_ret) = 0
     OR position('cst_cofins text' IN v_ret) = 0 THEN
    RAISE EXCEPTION 'C2_8_CAMPOS_FISCAIS_AUSENTES_NO_RETURN: %', v_ret;
  END IF;

  SELECT proacl::text[] INTO v_acl FROM pg_proc WHERE proname = 'list_produtos_gerente_filtrados';
  IF NOT ('authenticated=X/postgres' = ANY(v_acl)) OR NOT ('service_role=X/postgres' = ANY(v_acl)) THEN
    RAISE EXCEPTION 'C2_8_GRANT_ALTERADO: %', v_acl;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_acl) a WHERE a ILIKE '%=X/%' AND a NOT ILIKE 'postgres=%'
             AND a NOT ILIKE 'authenticated=%' AND a NOT ILIKE 'service_role=%') THEN
    RAISE EXCEPTION 'C2_8_GRANT_INESPERADO_EXTRA: %', v_acl;
  END IF;

  -- Prova viva (só roda se houver ao menos um usuário GERENTE/DONO/ADMIN no
  -- ambiente): a RPC é SECURITY INVOKER e seu WHERE depende de
  -- auth_usuario_eh_admin()/auth_usuario_loja_id(), que leem auth.uid() —
  -- sem uma sessão autenticada simulada, o predicado de tenant bloquearia
  -- QUALQUER linha (não é bug desta migration; é o mesmo comportamento que
  -- o app tem para um usuário não-autenticado). Simula a sessão do usuário
  -- de teste via request.jwt.claim.sub (mesmo GUC que auth.uid() lê),
  -- restrito a esta transação (`set_config(..., true)`).
  SELECT u.id, u.loja_id INTO v_uid_teste, v_loja_id
  FROM public.usuarios u WHERE u.perfil IN ('GERENTE', 'DONO', 'ADMIN') LIMIT 1;
  IF v_uid_teste IS NULL THEN
    RAISE NOTICE 'C2_8: sem usuário gerencial para prova viva; verificação estrutural OK';
  ELSE
    PERFORM set_config('request.jwt.claim.sub', v_uid_teste::text, true);
    INSERT INTO public.produtos (
      nome, preco_varejo, origem, tem_nf, loja_id,
      ncm, cfop_produto, csosn, cest, cst_pis, cst_cofins, icms_origem
    ) VALUES (
      'C2.8 verify — com fiscal', 10, 'china_manual', false, v_loja_id,
      '12345678', '5102', '102', '1234567', '01', '01', '3'
    ) RETURNING id INTO v_prod_com_dados;

    INSERT INTO public.produtos (
      nome, preco_varejo, origem, tem_nf, loja_id,
      ncm, cfop_produto, csosn, cest, cst_pis, cst_cofins, icms_origem
    ) VALUES (
      'C2.8 verify — sem fiscal', 10, 'china_manual', false, v_loja_id,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL
    ) RETURNING id INTO v_prod_null;

    SELECT * INTO v_row
    FROM public.list_produtos_gerente_filtrados(
      v_loja_id, 'todos', 'all', 'all', 'todos', 'todos', NULL, NULL, NULL, NULL,
      'C2.8 verify — com fiscal', 1, 10
    )
    WHERE id = v_prod_com_dados;

    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'C2_8_PRODUTO_COM_FISCAL_NAO_RETORNADO';
    END IF;
    IF v_row.ncm IS DISTINCT FROM '12345678' OR v_row.cfop_produto IS DISTINCT FROM '5102'
       OR v_row.csosn IS DISTINCT FROM '102' OR v_row.cest IS DISTINCT FROM '1234567'
       OR v_row.cst_pis IS DISTINCT FROM '01' OR v_row.cst_cofins IS DISTINCT FROM '01'
       OR v_row.icms_origem IS DISTINCT FROM '3' THEN
      RAISE EXCEPTION 'C2_8_VALORES_FISCAIS_DIVERGENTES: ncm=% cfop=% csosn=% cest=% pis=% cofins=% icms_origem=%',
        v_row.ncm, v_row.cfop_produto, v_row.csosn, v_row.cest, v_row.cst_pis, v_row.cst_cofins, v_row.icms_origem;
    END IF;

    SELECT * INTO v_row
    FROM public.list_produtos_gerente_filtrados(
      v_loja_id, 'todos', 'all', 'all', 'todos', 'todos', NULL, NULL, NULL, NULL,
      'C2.8 verify — sem fiscal', 1, 10
    )
    WHERE id = v_prod_null;

    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'C2_8_PRODUTO_SEM_FISCAL_NAO_RETORNADO';
    END IF;
    IF v_row.ncm IS NOT NULL OR v_row.cfop_produto IS NOT NULL OR v_row.csosn IS NOT NULL
       OR v_row.cest IS NOT NULL OR v_row.cst_pis IS NOT NULL OR v_row.cst_cofins IS NOT NULL
       OR v_row.icms_origem IS NOT NULL THEN
      RAISE EXCEPTION 'C2_8_NULL_VIROU_DEFAULT: ncm=% cfop=% csosn=% cest=% pis=% cofins=% icms_origem=%',
        v_row.ncm, v_row.cfop_produto, v_row.csosn, v_row.cest, v_row.cst_pis, v_row.cst_cofins, v_row.icms_origem;
    END IF;

    DELETE FROM public.produtos WHERE id IN (v_prod_com_dados, v_prod_null);
  END IF;
  RAISE EXCEPTION 'VERIFY_ROLLBACK_SENTINELA' USING ERRCODE = 'VRB01';
  EXCEPTION WHEN SQLSTATE 'VRB01' THEN
    RAISE NOTICE '20260902150000: autoteste concluído; efeitos desfeitos (rollback do sub-bloco)';
  END;
END
$verify$;

COMMIT;
