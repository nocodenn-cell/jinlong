-- Fuso dos relatórios configurável: parâmetro p_tz validado contra pg_timezone_names;
-- tabela relatorio_settings (1 linha) + variável de ambiente no app (RELATORIO_TIMEZONE) tem precedência no Next.

CREATE OR REPLACE FUNCTION public.relatorio_tz_validado(p_tz text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_tz IS NULL OR btrim(p_tz) = '' THEN 'America/Sao_Paulo'::text
    WHEN EXISTS (SELECT 1 FROM pg_timezone_names n WHERE n.name = p_tz) THEN p_tz
    ELSE 'America/Sao_Paulo'::text
  END;
$$;

COMMENT ON FUNCTION public.relatorio_tz_validado(text) IS
  'Normaliza nome IANA: vazio ou inválido → America/Sao_Paulo.';

-- CHECK não pode usar subconsulta em PostgreSQL; normalização IANA via trigger.
CREATE TABLE IF NOT EXISTS public.relatorio_settings (
  id integer PRIMARY KEY DEFAULT 1,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  CONSTRAINT relatorio_settings_singleton CHECK (id = 1)
);

CREATE OR REPLACE FUNCTION public.relatorio_settings_normalize_timezone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.timezone := public.relatorio_tz_validado(NEW.timezone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS relatorio_settings_tz_trigger ON public.relatorio_settings;
CREATE TRIGGER relatorio_settings_tz_trigger
  BEFORE INSERT OR UPDATE OF timezone ON public.relatorio_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.relatorio_settings_normalize_timezone();

INSERT INTO public.relatorio_settings (id, timezone)
VALUES (1, 'America/Sao_Paulo')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.relatorio_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "relatorio_settings_select_gerente_dono"
  ON public.relatorio_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

CREATE POLICY "relatorio_settings_update_gerente_dono"
  ON public.relatorio_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

COMMENT ON TABLE public.relatorio_settings IS
  'Fuso IANA para relatórios (dia civil). Precedência no app: env RELATORIO_TIMEZONE > esta tabela > padrão.';

GRANT SELECT, UPDATE ON public.relatorio_settings TO authenticated;

DROP FUNCTION IF EXISTS public.relatorio_vendas_por_dia_periodo(date, date);
DROP FUNCTION IF EXISTS public.relatorio_top_produtos_periodo(date, date, integer);

CREATE OR REPLACE FUNCTION public.relatorio_vendas_por_dia_periodo(
  p_de date,
  p_ate date,
  p_tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE (
  dia date,
  num_vendas bigint,
  total_liquido numeric,
  ticket_medio numeric,
  total_desconto numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  WITH z AS (SELECT public.relatorio_tz_validado(p_tz) AS tz)
  SELECT
    (v.data AT TIME ZONE z.tz)::date AS dia,
    count(*)::bigint AS num_vendas,
    coalesce(sum(v.total_liquido), 0)::numeric AS total_liquido,
    coalesce(avg(v.total_liquido), 0)::numeric AS ticket_medio,
    coalesce(sum(v.total_desconto), 0)::numeric AS total_desconto
  FROM public.vendas v
  CROSS JOIN z
  WHERE v.status = 'CONCLUIDA'
    AND (v.data AT TIME ZONE z.tz)::date >= p_de
    AND (v.data AT TIME ZONE z.tz)::date <= p_ate
  GROUP BY (v.data AT TIME ZONE z.tz)::date
  ORDER BY dia DESC;
$$;

CREATE OR REPLACE FUNCTION public.relatorio_top_produtos_periodo(
  p_de date,
  p_ate date,
  p_limite integer DEFAULT 50,
  p_tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE (
  id uuid,
  nome text,
  origem text,
  total_quantidade numeric,
  total_valor numeric,
  num_vendas bigint,
  qtde_atacado numeric,
  qtde_varejo numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  WITH z AS (SELECT public.relatorio_tz_validado(p_tz) AS tz)
  SELECT
    p.id,
    p.nome,
    p.origem,
    sum(iv.quantidade)::numeric AS total_quantidade,
    sum(iv.quantidade * iv.preco_unitario)::numeric AS total_valor,
    count(DISTINCT iv.venda_id)::bigint AS num_vendas,
    sum(CASE WHEN iv.tipo_preco = 'ATACADO' THEN iv.quantidade ELSE 0 END)::numeric AS qtde_atacado,
    sum(CASE WHEN iv.tipo_preco = 'VAREJO' THEN iv.quantidade ELSE 0 END)::numeric AS qtde_varejo
  FROM public.itens_venda iv
  INNER JOIN public.vendas v ON v.id = iv.venda_id
  INNER JOIN public.produtos p ON p.id = iv.produto_id
  CROSS JOIN z
  WHERE v.status = 'CONCLUIDA'
    AND (v.data AT TIME ZONE z.tz)::date >= p_de
    AND (v.data AT TIME ZONE z.tz)::date <= p_ate
  GROUP BY p.id, p.nome, p.origem
  ORDER BY total_valor DESC NULLS LAST
  LIMIT CASE
    WHEN p_limite IS NULL OR p_limite < 1 THEN 50
    WHEN p_limite > 200 THEN 200
    ELSE p_limite
  END;
$$;

COMMENT ON FUNCTION public.relatorio_vendas_por_dia_periodo(date, date, text) IS
  'Vendas CONCLUIDAS por dia civil no fuso p_tz (validado); p_de/p_ate inclusivos.';

COMMENT ON FUNCTION public.relatorio_top_produtos_periodo(date, date, integer, text) IS
  'Ranking no intervalo civil do fuso p_tz (validado); limite 1–200.';

GRANT EXECUTE ON FUNCTION public.relatorio_tz_validado(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_vendas_por_dia_periodo(date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_top_produtos_periodo(date, date, integer, text) TO authenticated;
