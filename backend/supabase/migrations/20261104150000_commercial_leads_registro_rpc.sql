-- SEC-02 (2026-11-04): registro de leads do formulário comercial sem INSERT direto para anon.
--
-- Contexto: o site (POST /pedido-demo) gravava em public.commercial_leads com a chave anon via REST.
-- A auditoria de privilégios (20261104120000) removeu o acesso de anon à tabela, e a decisão do responsável é
-- não conceder INSERT direto. Esta função é o único caminho público de escrita: valida os campos no banco
-- (defesa em profundidade; o servidor do site valida antes) e insere com os privilégios do dono da função.
--
-- Efeitos:
--  - anon ganha EXECUTE nesta função, e nada mais em commercial_leads (sem INSERT, SELECT, UPDATE ou DELETE);
--  - a função não devolve dados de outros leads e não aceita campos fora da lista;
--  - authenticated não ganha nada (o hub usa a tabela com o token do usuário, como antes).
--
-- ROLLBACK: backend/supabase/rollback/20261104150000_commercial_leads_registro_rpc.rollback.sql

BEGIN;

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

-- Prova: anon executa a função e não tem nenhum privilégio direto em commercial_leads.
DO $verify$
BEGIN
  IF NOT has_function_privilege('anon', 'public.registrar_lead_comercial(text,text,text,text,text,text,text,text,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'LEAD_RPC: anon sem EXECUTE';
  END IF;
  IF has_table_privilege('anon', 'public.commercial_leads', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'LEAD_RPC: anon com privilégio direto em commercial_leads';
  END IF;
END
$verify$;

COMMIT;
