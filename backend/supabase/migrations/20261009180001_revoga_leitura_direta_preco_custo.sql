-- N1 (fase B, FECHAMENTO) — revoga a leitura direta de produtos.preco_custo / preco_custo_medio.
--
-- Pré-requisitos (fase A + app novo): migration 20261009180000 aplicada (view `produtos_custos`) E o app novo
-- em produção (nenhum código seleciona o custo em `produtos`). Aplicar antes do app novo derruba catálogo/edição/
-- NF-e do app antigo para GERENTE (erro 42501).
--
-- RLS controla linhas, não colunas, e o papel de banco `authenticated` é o mesmo para todos os perfis: a única forma
-- de impedir o OPERADOR de ler o custo é retirar o privilégio de COLUNA para `authenticated`/`anon` e servir o custo
-- por objeto com autorização por perfil (a view `produtos_custos`). Funções/triggers SECURITY DEFINER e service_role
-- não são afetados.
--
-- ATENÇÃO (futuro): colunas NOVAS em `produtos` não ficam legíveis por padrão (grant por coluna). Quem criar uma
-- coluna precisa conceder SELECT à coluna (anon, authenticated). O smoke `n1-preco-custo-authz-smoke.mjs` e a guarda
-- `tests/n1-preco-custo-guard.test.ts` acusam o problema.
--
-- ROLLBACK (idempotente):  GRANT SELECT ON public.produtos TO anon, authenticated;  NOTIFY pgrst, 'reload schema';

DO $priv$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
    INTO v_cols
  FROM pg_attribute a
  WHERE a.attrelid = 'public.produtos'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attname NOT IN ('preco_custo', 'preco_custo_medio');

  IF v_cols IS NULL OR position('id' IN v_cols) = 0 THEN
    RAISE EXCEPTION 'produtos: lista de colunas sem custo inválida — abortado sem alterar nada';
  END IF;

  EXECUTE 'REVOKE SELECT ON public.produtos FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.produtos TO anon, authenticated', v_cols);
END
$priv$;

NOTIFY pgrst, 'reload schema';
