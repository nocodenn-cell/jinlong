-- Rollback de 20261104160000_commercial_leads_idempotencia.sql.
-- Restaura a função anterior (12 argumentos, sem chave, devolve void) e remove o índice e as colunas novas.
-- PERDA: as colunas idempotency_key e request_hash são removidas; as chaves dos leads criados depois da migration
-- deixam de existir. As linhas em si permanecem. Só fazer com a retirada coordenada do site (rota de envio).
BEGIN;

DROP FUNCTION IF EXISTS public.registrar_lead_comercial(uuid, text, text, text, text, text, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.registrar_lead_comercial(
  p_protocol text,
  p_name text,
  p_store text,
  p_contact text,
  p_channel text,
  p_locale text,
  p_city text DEFAULT NULL,
  p_segment text DEFAULT NULL,
  p_wechat text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_protocol IS NULL OR p_protocol !~ '^JL-[0-9]{6}-[A-Z2-9]{6}$' THEN
    RAISE EXCEPTION 'LEAD_PROTOCOLO_INVALIDO' USING ERRCODE = '22023';
  END IF;
  IF p_name IS NULL OR char_length(p_name) NOT BETWEEN 2 AND 80 OR p_name ~ '[\x00-\x1f\x7f<>]' THEN
    RAISE EXCEPTION 'LEAD_NOME_INVALIDO' USING ERRCODE = '22023';
  END IF;
  IF p_store IS NULL OR char_length(p_store) NOT BETWEEN 2 AND 120 OR p_store ~ '[\x00-\x1f\x7f<>]' THEN
    RAISE EXCEPTION 'LEAD_LOJA_INVALIDA' USING ERRCODE = '22023';
  END IF;
  IF p_contact IS NULL OR char_length(p_contact) NOT BETWEEN 3 AND 60 OR p_contact ~ '[\x00-\x1f\x7f<>]' THEN
    RAISE EXCEPTION 'LEAD_CONTATO_INVALIDO' USING ERRCODE = '22023';
  END IF;
  IF p_channel IS NULL OR p_channel NOT IN ('whatsapp', 'wechat') THEN
    RAISE EXCEPTION 'LEAD_CANAL_INVALIDO' USING ERRCODE = '22023';
  END IF;
  IF p_locale IS NULL OR p_locale NOT IN ('pt-BR', 'zh-CN') THEN
    RAISE EXCEPTION 'LEAD_IDIOMA_INVALIDO' USING ERRCODE = '22023';
  END IF;
  IF p_segment IS NOT NULL AND p_segment NOT IN ('importados', 'eletronicos', 'utilidades', 'atacado', 'moda', 'outro') THEN
    RAISE EXCEPTION 'LEAD_SEGMENTO_INVALIDO' USING ERRCODE = '22023';
  END IF;
  IF p_city IS NOT NULL AND char_length(p_city) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'LEAD_CIDADE_INVALIDA' USING ERRCODE = '22023';
  END IF;
  IF p_wechat IS NOT NULL AND p_wechat !~ '^[A-Za-z0-9_.+@-]{3,40}$' THEN
    RAISE EXCEPTION 'LEAD_WECHAT_INVALIDO' USING ERRCODE = '22023';
  END IF;
  IF (p_utm_source IS NOT NULL AND char_length(p_utm_source) > 100)
     OR (p_utm_medium IS NOT NULL AND char_length(p_utm_medium) > 100)
     OR (p_utm_campaign IS NOT NULL AND char_length(p_utm_campaign) > 100) THEN
    RAISE EXCEPTION 'LEAD_UTM_INVALIDA' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.commercial_leads (
    protocol, product, name, store, contact, channel, locale, idioma,
    city, segment, wechat, utm_source, utm_medium, utm_campaign, origem
  ) VALUES (
    p_protocol, 'jinlong', p_name, p_store, p_contact, p_channel, p_locale, p_locale,
    p_city, p_segment, p_wechat, p_utm_source, p_utm_medium, p_utm_campaign, 'site'
  );
END
$$;

REVOKE ALL ON FUNCTION public.registrar_lead_comercial(text, text, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_lead_comercial(text, text, text, text, text, text, text, text, text, text, text, text) TO anon;

DROP INDEX IF EXISTS public.commercial_leads_idempotency_key_uidx;
ALTER TABLE public.commercial_leads DROP COLUMN IF EXISTS idempotency_key, DROP COLUMN IF EXISTS request_hash;

COMMIT;
