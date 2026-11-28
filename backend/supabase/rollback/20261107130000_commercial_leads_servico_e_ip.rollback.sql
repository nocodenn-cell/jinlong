-- Rollback de 20261107130000_commercial_leads_servico_e_ip.sql.
-- Restaura o estado da cadeia original antes desta migração: RPC de 13 argumentos com EXECUTE para anon (como em
-- 20261104160000/170000) e checagem sem argumentos que lê o IP de request.headers.
-- ATENÇÃO: reabre o acesso público à RPC. Usar só com a retirada coordenada do site (que passa a enviar p_client_ip).
BEGIN;

DROP FUNCTION IF EXISTS public.registrar_lead_comercial(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS internal.commercial_lead_rate_check(text);

CREATE OR REPLACE FUNCTION internal.commercial_lead_rate_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal, pg_temp
AS $$
DECLARE
  v_xff text;
  v_ip text;
  v_salt text;
  v_bucket text;
  v_tentativas integer;
  v_janela interval := interval '10 minutes';
  v_limite integer := 10;
BEGIN
  v_xff := (NULLIF(current_setting('request.headers', true), '')::json) ->> 'x-forwarded-for';
  IF v_xff IS NOT NULL THEN
    v_ip := NULLIF(btrim((string_to_array(v_xff, ','))[array_upper(string_to_array(v_xff, ','), 1)]), '');
  END IF;

  SELECT c.salt INTO v_salt FROM public.commercial_lead_rate_config c WHERE c.id = 1;
  IF v_salt IS NULL THEN
    RAISE EXCEPTION 'LEAD_RATE_INDISPONIVEL' USING ERRCODE = '53400';
  END IF;

  v_bucket := 'ip:' || encode(sha256(convert_to(v_salt || '|' || coalesce(v_ip, 'sem-ip'), 'UTF8')), 'hex');

  INSERT INTO public.commercial_lead_rate_limit AS r (bucket, janela_inicio, tentativas)
  VALUES (v_bucket, now(), 1)
  ON CONFLICT (bucket) DO UPDATE SET
    janela_inicio = CASE WHEN r.janela_inicio < now() - v_janela THEN now() ELSE r.janela_inicio END,
    tentativas = CASE WHEN r.janela_inicio < now() - v_janela THEN 1 ELSE r.tentativas + 1 END
  RETURNING r.tentativas INTO v_tentativas;

  DELETE FROM public.commercial_lead_rate_limit
   WHERE bucket IN (SELECT x.bucket FROM public.commercial_lead_rate_limit x
                     WHERE x.janela_inicio < now() - interval '1 day' LIMIT 200);

  IF v_tentativas > v_limite THEN
    RAISE EXCEPTION 'LEAD_RATE_LIMIT' USING ERRCODE = '53400';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION internal.commercial_lead_rate_check() FROM PUBLIC, anon, authenticated;

-- RPC de 13 argumentos (idempotência, sem p_client_ip), com o mesmo corpo da 20261104160000/170000 e EXECUTE para anon.
CREATE OR REPLACE FUNCTION public.registrar_lead_comercial(
  p_idempotency_key uuid, p_protocol text, p_name text, p_store text, p_contact text, p_channel text, p_locale text,
  p_city text DEFAULT NULL, p_segment text DEFAULT NULL, p_wechat text DEFAULT NULL,
  p_utm_source text DEFAULT NULL, p_utm_medium text DEFAULT NULL, p_utm_campaign text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal, pg_temp
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

  PERFORM internal.commercial_lead_rate_check();

  v_hash := encode(sha256(convert_to(concat_ws(E'\x1f', p_name, p_store, p_contact, p_channel, p_locale,
              coalesce(p_city, ''), coalesce(p_segment, ''), coalesce(p_wechat, ''),
              coalesce(p_utm_source, ''), coalesce(p_utm_medium, ''), coalesce(p_utm_campaign, '')), 'UTF8')), 'hex');

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

COMMIT;
