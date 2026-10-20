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