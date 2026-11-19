-- Rollback de 20261104170000_commercial_leads_rate_limit.sql.
-- Restaura a função de registro da migration 20261104160000 (com chave de idempotência e sem limite de taxa) e
-- remove a checagem, a tabela de controle e o salt. PERDA: contadores e salt do limite (sem valor de negócio).
-- Sem o limite, o formulário volta a aceitar tentativas ilimitadas. Usar só com a retirada coordenada do site.
BEGIN;
CREATE OR REPLACE FUNCTION public.registrar_lead_comercial(
  p_idempotency_key uuid,
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
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_protocolo text;
  v_hash text;
  v_hash_existente text;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'LEAD_CHAVE_AUSENTE' USING ERRCODE = '22023';
  END IF;
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

  v_hash := encode(sha256(convert_to(concat_ws(E'\x1f', p_name, p_store, p_contact, p_channel, p_locale,
              coalesce(p_city, ''), coalesce(p_segment, ''), coalesce(p_wechat, ''),
              coalesce(p_utm_source, ''), coalesce(p_utm_medium, ''), coalesce(p_utm_campaign, '')), 'UTF8')), 'hex');

  -- Concorrência: ON CONFLICT espera a transação concorrente com a mesma chave terminar. Se ela confirmou, nada é
  -- inserido aqui; se ela desfez, esta inserção segue.
  INSERT INTO public.commercial_leads (
    protocol, product, name, store, contact, channel, locale, idioma,
    city, segment, wechat, utm_source, utm_medium, utm_campaign, origem,
    idempotency_key, request_hash
  ) VALUES (
    p_protocol, 'jinlong', p_name, p_store, p_contact, p_channel, p_locale, p_locale,
    p_city, p_segment, p_wechat, p_utm_source, p_utm_medium, p_utm_campaign, 'site',
    p_idempotency_key, v_hash
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING protocol INTO v_protocolo;

  IF v_protocolo IS NOT NULL THEN
    RETURN v_protocolo;
  END IF;

  SELECT l.protocol, l.request_hash INTO v_protocolo, v_hash_existente
    FROM public.commercial_leads l
   WHERE l.idempotency_key = p_idempotency_key;

  IF v_hash_existente IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'LEAD_CHAVE_REUTILIZADA' USING ERRCODE = '22023';
  END IF;
  RETURN v_protocolo;
END
$$;
REVOKE ALL ON FUNCTION public.registrar_lead_comercial(uuid, text, text, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_lead_comercial(uuid, text, text, text, text, text, text, text, text, text, text, text, text) TO anon;
DROP FUNCTION IF EXISTS internal.commercial_lead_rate_check();
DROP TABLE IF EXISTS public.commercial_lead_rate_limit;
DROP TABLE IF EXISTS public.commercial_lead_rate_config;
COMMIT;
