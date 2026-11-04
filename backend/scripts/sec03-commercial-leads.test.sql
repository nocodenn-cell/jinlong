-- JL-COM-03: testes de idempotência e rate limit do formulário comercial (registrar_lead_comercial).
-- Rodar em banco DESCARTÁVEL depois de aplicar 20261104160000 e 20261104170000:
--   psql -v ON_ERROR_STOP=1 -f backend/scripts/sec03-commercial-leads.test.sql <banco_descartavel>
-- Cada bloco falha com 'FAIL: ...' se a condição não valer. Os blocos executam como anon (papel público),
-- como o site. Os testes concorrentes (várias sessões ao mesmo tempo) estão em
-- backend/scripts/sec03-commercial-leads-concorrencia.sh.

\set ON_ERROR_STOP on

-- Auxiliar: protocolo válido a partir de um número (sem 0/1, formato JL-AAMMDD-XXXXXX).
CREATE OR REPLACE FUNCTION pg_temp.proto(n integer) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'JL-261104-' || translate(lpad(to_hex(n), 6, '0'), '0123456789abcdef', 'ABCDEFGHJKMNPQRS')
$$;
GRANT EXECUTE ON FUNCTION pg_temp.proto(integer) TO anon;

-- Limpa o estado de teste (só linhas criadas pelos testes: utm_source 'sec03-teste').
DO $setup$
BEGIN
  DELETE FROM public.commercial_leads WHERE utm_source = 'sec03-teste';
  DELETE FROM public.commercial_lead_rate_limit WHERE bucket LIKE 'ip:%';
END
$setup$;

-- T1 primeiro envio válido + T2 reenvio idêntico (mesma chave, mesmo conteúdo) -> mesmo protocolo, sem nova linha.
DO $t1$
DECLARE
  k uuid := '11111111-1111-4111-8111-111111111111';
  p1 text; p2 text; n integer;
BEGIN
  PERFORM set_config('request.headers', '{"x-forwarded-for":"198.51.100.10"}', true);
  SET LOCAL ROLE anon;
  p1 := public.registrar_lead_comercial(k, pg_temp.proto(1), 'Lead Teste Um', 'Loja Teste', '+55 11 90000-0001', 'whatsapp', 'pt-BR', NULL, 'outro', NULL, 'sec03-teste', NULL, NULL);
  p2 := public.registrar_lead_comercial(k, pg_temp.proto(2), 'Lead Teste Um', 'Loja Teste', '+55 11 90000-0001', 'whatsapp', 'pt-BR', NULL, 'outro', NULL, 'sec03-teste', NULL, NULL);
  RESET ROLE;
  SELECT count(*) INTO n FROM public.commercial_leads WHERE idempotency_key = k;
  IF p1 IS NULL OR p1 <> pg_temp.proto(1) THEN RAISE EXCEPTION 'FAIL T1: primeiro envio deveria devolver o protocolo novo (obtido %)', p1; END IF;
  IF p2 <> p1 THEN RAISE EXCEPTION 'FAIL T2: reenvio idêntico deveria devolver o protocolo original (%, obtido %)', p1, p2; END IF;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T2: reenvio criou linha duplicada (% linhas para a chave)', n; END IF;
  RAISE NOTICE 'OK T1+T2: primeiro envio grava 1 linha; reenvio idêntico devolve o protocolo original sem duplicar';
END
$t1$;

-- T3 chave reutilizada com conteúdo diferente -> LEAD_CHAVE_REUTILIZADA, nada gravado.
DO $t3$
DECLARE
  k uuid := '11111111-1111-4111-8111-111111111111';
  erro text; n integer;
BEGIN
  PERFORM set_config('request.headers', '{"x-forwarded-for":"198.51.100.10"}', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.registrar_lead_comercial(k, pg_temp.proto(3), 'Outro Nome', 'Loja Teste', '+55 11 90000-0001', 'whatsapp', 'pt-BR', NULL, 'outro', NULL, 'sec03-teste', NULL, NULL);
    erro := NULL;
  EXCEPTION WHEN OTHERS THEN
    erro := SQLERRM;
  END;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.commercial_leads WHERE idempotency_key = k;
  IF erro IS DISTINCT FROM 'LEAD_CHAVE_REUTILIZADA' THEN RAISE EXCEPTION 'FAIL T3: esperado LEAD_CHAVE_REUTILIZADA, obtido %', coalesce(erro, 'sucesso'); END IF;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T3: chave reutilizada alterou os dados (% linhas)', n; END IF;
  RAISE NOTICE 'OK T3: chave reutilizada com conteúdo diferente é recusada e não grava nada';
END
$t3$;

-- T4 nova tentativa legítima (chave nova, mesmo conteúdo) -> nova linha e protocolo novo.
DO $t4$
DECLARE
  p text; n integer;
BEGIN
  PERFORM set_config('request.headers', '{"x-forwarded-for":"198.51.100.10"}', true);
  SET LOCAL ROLE anon;
  p := public.registrar_lead_comercial('22222222-2222-4222-8222-222222222222', pg_temp.proto(4), 'Lead Teste Um', 'Loja Teste', '+55 11 90000-0001', 'whatsapp', 'pt-BR', NULL, 'outro', NULL, 'sec03-teste', NULL, NULL);
  RESET ROLE;
  SELECT count(*) INTO n FROM public.commercial_leads WHERE utm_source = 'sec03-teste';
  IF p <> pg_temp.proto(4) THEN RAISE EXCEPTION 'FAIL T4: nova tentativa legítima deveria gravar (obtido %)', p; END IF;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL T4: esperado 2 linhas de teste, obtido %', n; END IF;
  RAISE NOTICE 'OK T4: nova tentativa legítima (chave nova) grava normalmente';
END
$t4$;

-- T5 payload inválido -> erro de validação, nada gravado. Cada caso isolado.
DO $t5$
DECLARE
  casos text[] := ARRAY[
    'LEAD_PROTOCOLO_INVALIDO', 'LEAD_NOME_INVALIDO', 'LEAD_CONTATO_INVALIDO',
    'LEAD_CANAL_INVALIDO', 'LEAD_IDIOMA_INVALIDO', 'LEAD_SEGMENTO_INVALIDO', 'LEAD_WECHAT_INVALIDO', 'LEAD_CHAVE_AUSENTE'];
  antes integer; depois integer; erro text; i integer;
BEGIN
  SELECT count(*) INTO antes FROM public.commercial_leads;
  PERFORM set_config('request.headers', '{"x-forwarded-for":"198.51.100.20"}', true);
  SET LOCAL ROLE anon;
  FOR i IN 1..8 LOOP
    erro := NULL;
    BEGIN
      CASE i
        WHEN 1 THEN PERFORM public.registrar_lead_comercial('33333333-3333-4333-8333-333333333331', 'XX-1', 'Lead', 'Loja', '+5511900000001', 'whatsapp', 'pt-BR', NULL, NULL, NULL, 'sec03-teste', NULL, NULL);
        WHEN 2 THEN PERFORM public.registrar_lead_comercial('33333333-3333-4333-8333-333333333332', pg_temp.proto(50), 'L', 'Loja', '+5511900000001', 'whatsapp', 'pt-BR', NULL, NULL, NULL, 'sec03-teste', NULL, NULL);
        WHEN 3 THEN PERFORM public.registrar_lead_comercial('33333333-3333-4333-8333-333333333333', pg_temp.proto(51), 'Lead', 'Loja', 'ab', 'whatsapp', 'pt-BR', NULL, NULL, NULL, 'sec03-teste', NULL, NULL);
        WHEN 4 THEN PERFORM public.registrar_lead_comercial('33333333-3333-4333-8333-333333333334', pg_temp.proto(52), 'Lead', 'Loja', '+5511900000001', 'email', 'pt-BR', NULL, NULL, NULL, 'sec03-teste', NULL, NULL);
        WHEN 5 THEN PERFORM public.registrar_lead_comercial('33333333-3333-4333-8333-333333333335', pg_temp.proto(53), 'Lead', 'Loja', '+5511900000001', 'whatsapp', 'fr-FR', NULL, NULL, NULL, 'sec03-teste', NULL, NULL);
        WHEN 6 THEN PERFORM public.registrar_lead_comercial('33333333-3333-4333-8333-333333333336', pg_temp.proto(54), 'Lead', 'Loja', '+5511900000001', 'whatsapp', 'pt-BR', NULL, 'hackers', NULL, 'sec03-teste', NULL, NULL);
        WHEN 7 THEN PERFORM public.registrar_lead_comercial('33333333-3333-4333-8333-333333333337', pg_temp.proto(55), 'Lead', 'Loja', '+5511900000001', 'whatsapp', 'pt-BR', NULL, NULL, 'ab c', 'sec03-teste', NULL, NULL);
        WHEN 8 THEN PERFORM public.registrar_lead_comercial(NULL, pg_temp.proto(56), 'Lead', 'Loja', '+5511900000001', 'whatsapp', 'pt-BR', NULL, NULL, NULL, 'sec03-teste', NULL, NULL);
      END CASE;
    EXCEPTION WHEN OTHERS THEN
      erro := SQLERRM;
    END;
    IF erro IS DISTINCT FROM casos[i] THEN
      RESET ROLE;
      RAISE EXCEPTION 'FAIL T5 caso %: esperado %, obtido %', i, casos[i], coalesce(erro, 'sucesso');
    END IF;
  END LOOP;
  RESET ROLE;
  SELECT count(*) INTO depois FROM public.commercial_leads;
  IF depois <> antes THEN RAISE EXCEPTION 'FAIL T5: payloads inválidos gravaram linhas (% -> %)', antes, depois; END IF;
  RAISE NOTICE 'OK T5: 8 payloads inválidos recusados com o código esperado e nenhuma linha gravada';
END
$t5$;

-- T6 rate limit: 10 tentativas válidas do mesmo IP passam; a 11ª é recusada (LEAD_RATE_LIMIT).
-- T7 X-Forwarded-For: o cliente não escapa do limite trocando o primeiro item do cabeçalho.
DO $t6$
DECLARE
  i integer; erro text; n integer; ok_count integer := 0; bucket_ok boolean;
BEGIN
  FOR i IN 1..10 LOOP
    PERFORM set_config('request.headers', '{"x-forwarded-for":"fake-' || i || ', 203.0.113.50"}', true);
    SET LOCAL ROLE anon;
    PERFORM public.registrar_lead_comercial(gen_random_uuid(), pg_temp.proto(100 + i), 'Lead Limite', 'Loja Limite', '+5511900001' || lpad(i::text, 3, '0'), 'whatsapp', 'pt-BR', NULL, NULL, NULL, 'sec03-teste', NULL, NULL);
    RESET ROLE;
    ok_count := ok_count + 1;
  END LOOP;
  PERFORM set_config('request.headers', '{"x-forwarded-for":"outro-falso, 203.0.113.50"}', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.registrar_lead_comercial(gen_random_uuid(), pg_temp.proto(111), 'Lead Limite', 'Loja Limite', '+5511900001111', 'whatsapp', 'pt-BR', NULL, NULL, NULL, 'sec03-teste', NULL, NULL);
    erro := NULL;
  EXCEPTION WHEN OTHERS THEN erro := SQLERRM;
  END;
  RESET ROLE;
  IF ok_count <> 10 THEN RAISE EXCEPTION 'FAIL T6: esperado 10 tentativas aceitas, obtido %', ok_count; END IF;
  IF erro IS DISTINCT FROM 'LEAD_RATE_LIMIT' THEN RAISE EXCEPTION 'FAIL T6/T7: 11ª tentativa do mesmo IP deveria ser LEAD_RATE_LIMIT (obtido %)', coalesce(erro, 'sucesso'); END IF;
  -- Sem gravação na 11ª tentativa: 10 linhas do bucket.
  SELECT count(*) INTO n FROM public.commercial_leads WHERE name = 'Lead Limite';
  IF n <> 10 THEN RAISE EXCEPTION 'FAIL T6: linhas gravadas acima do limite (%)', n; END IF;
  -- Privacidade: o bucket é hash, nunca o IP em texto puro.
  SELECT bool_and(bucket ~ '^ip:[0-9a-f]{64}$') AND NOT bool_or(bucket LIKE '%203.0.113%') INTO bucket_ok FROM public.commercial_lead_rate_limit;
  IF NOT bucket_ok THEN RAISE EXCEPTION 'FAIL T6: a tabela de limite guarda IP em texto puro ou formato inesperado'; END IF;
  RAISE NOTICE 'OK T6+T7: 10 tentativas aceitas, a 11ª recusada; X-Forwarded-For forjado no primeiro item não escapa; bucket é hash';
END
$t6$;

-- T8 janela expirada: após 10 minutos o contador reinicia (nova tentativa legítima passa).
DO $t8$
DECLARE p text;
BEGIN
  UPDATE public.commercial_lead_rate_limit SET janela_inicio = now() - interval '11 minutes'
   WHERE bucket = (SELECT bucket FROM public.commercial_lead_rate_limit ORDER BY janela_inicio DESC LIMIT 1)
     AND bucket IN (SELECT bucket FROM public.commercial_lead_rate_limit WHERE tentativas >= 10);
  PERFORM set_config('request.headers', '{"x-forwarded-for":"203.0.113.50"}', true);
  SET LOCAL ROLE anon;
  p := public.registrar_lead_comercial(gen_random_uuid(), pg_temp.proto(120), 'Lead Limite', 'Loja Limite', '+5511900002000', 'whatsapp', 'pt-BR', NULL, NULL, NULL, 'sec03-teste', NULL, NULL);
  RESET ROLE;
  IF p IS NULL THEN RAISE EXCEPTION 'FAIL T8: janela expirada deveria liberar nova tentativa'; END IF;
  RAISE NOTICE 'OK T8: janela de 10 minutos vencida libera nova tentativa';
END
$t8$;

-- T9 retenção: buckets com janela vencida há mais de 1 dia são apagados na próxima chamada.
DO $t9$
DECLARE antigos integer; p text;
BEGIN
  INSERT INTO public.commercial_lead_rate_limit (bucket, janela_inicio, tentativas)
  VALUES ('ip:' || repeat('a', 64), now() - interval '3 days', 4);
  PERFORM set_config('request.headers', '{"x-forwarded-for":"192.0.2.99"}', true);
  SET LOCAL ROLE anon;
  p := public.registrar_lead_comercial(gen_random_uuid(), pg_temp.proto(130), 'Lead Retencao', 'Loja Retencao', '+5511900003000', 'whatsapp', 'pt-BR', NULL, NULL, NULL, 'sec03-teste', NULL, NULL);
  RESET ROLE;
  SELECT count(*) INTO antigos FROM public.commercial_lead_rate_limit WHERE bucket = 'ip:' || repeat('a', 64);
  IF antigos <> 0 THEN RAISE EXCEPTION 'FAIL T9: bucket antigo não foi removido pela retenção'; END IF;
  RAISE NOTICE 'OK T9: retenção remove buckets com janela vencida há mais de 1 dia';
END
$t9$;

-- T10 falha do mecanismo de limite (salt ausente) -> LEAD_RATE_INDISPONIVEL e nada gravado (fail-closed).
DO $t10$
DECLARE salt_guardado text; erro text; n_antes integer; n_depois integer;
BEGIN
  SELECT count(*) INTO n_antes FROM public.commercial_leads;
  SELECT salt INTO salt_guardado FROM public.commercial_lead_rate_config WHERE id = 1;
  DELETE FROM public.commercial_lead_rate_config WHERE id = 1;
  PERFORM set_config('request.headers', '{"x-forwarded-for":"192.0.2.77"}', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.registrar_lead_comercial(gen_random_uuid(), pg_temp.proto(140), 'Lead Falha', 'Loja Falha', '+5511900004000', 'whatsapp', 'pt-BR', NULL, NULL, NULL, 'sec03-teste', NULL, NULL);
    erro := NULL;
  EXCEPTION WHEN OTHERS THEN erro := SQLERRM;
  END;
  RESET ROLE;
  SELECT count(*) INTO n_depois FROM public.commercial_leads;
  -- restaura o salt (o bloco inteiro é desfeito pelo ROLLBACK do teste; aqui só reposiciona para os próximos testes)
  INSERT INTO public.commercial_lead_rate_config (id, salt) VALUES (1, salt_guardado) ON CONFLICT (id) DO NOTHING;
  IF erro IS DISTINCT FROM 'LEAD_RATE_INDISPONIVEL' THEN RAISE EXCEPTION 'FAIL T10: esperado LEAD_RATE_INDISPONIVEL, obtido %', coalesce(erro, 'sucesso'); END IF;
  IF n_depois <> n_antes THEN RAISE EXCEPTION 'FAIL T10: falha do limite gravou linha (fail-open)'; END IF;
  RAISE NOTICE 'OK T10: falha do mecanismo de limite recusa a gravação (fail-closed)';
END
$t10$;

-- T11 permissões: anon não lê nem altera leads, não lê a tabela de limite nem executa a checagem.
DO $t11$
DECLARE falhas integer := 0; ok boolean;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN PERFORM 1 FROM public.commercial_leads LIMIT 1; falhas := falhas + 1; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.commercial_leads (protocol, product, name, store, contact, channel, locale, status) VALUES (pg_temp.proto(150), 'jinlong', 'x', 'x', 'x', 'whatsapp', 'pt-BR', 'novo'); falhas := falhas + 1; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.commercial_leads SET name = 'x' WHERE false; falhas := falhas + 1; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.commercial_leads WHERE false; falhas := falhas + 1; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.commercial_lead_rate_limit LIMIT 1; falhas := falhas + 1; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.commercial_lead_rate_config LIMIT 1; falhas := falhas + 1; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM internal.commercial_lead_rate_check(); falhas := falhas + 1; EXCEPTION WHEN insufficient_privilege OR invalid_schema_name THEN NULL; END;
  RESET ROLE;
  IF falhas <> 0 THEN RAISE EXCEPTION 'FAIL T11: anon tem % acesso(s) indevido(s)', falhas; END IF;
  SELECT p.prosecdef AND p.proconfig @> ARRAY['search_path=public, internal, pg_temp'] INTO ok
    FROM pg_proc p WHERE p.oid = 'public.registrar_lead_comercial(uuid,text,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL T11: função sem SECURITY DEFINER ou sem search_path fixo'; END IF;
  RAISE NOTICE 'OK T11: anon não lê, não altera e não apaga leads; não acessa tabelas de limite nem a checagem; search_path fixo';
END
$t11$;

-- Limpeza dos dados de teste (somente linhas marcadas pelo teste).
DELETE FROM public.commercial_leads WHERE utm_source = 'sec03-teste';
DELETE FROM public.commercial_lead_rate_limit WHERE bucket LIKE 'ip:%';
