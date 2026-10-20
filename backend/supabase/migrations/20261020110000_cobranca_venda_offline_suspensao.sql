-- Cobrança — venda OFFLINE feita ANTES da suspensão por cobrança é aceita no sync, mesmo chegando depois.
--
-- Política (só fatos do servidor; o relógio do PDV só informa a hora da venda, que é limitada):
--   T_s = saas.assinaturas.suspensa_em (hora do servidor em que a cobrança suspendeu a empresa).
--   L   = último contato autenticado (HMAC) do dispositivo com o servidor ANTES de T_s (ou a ativação).
--         É a "autorização offline": vale por W = saas.parametros.offline_janela_horas (padrão 72 h).
--   C   = primeiro contato do dispositivo DEPOIS de T_s (o dispositivo "recebeu a suspensão").
--   Venda do dispositivo é liberada durante a suspensão se, e só se:
--     1. a suspensão é da cobrança (suspensão manual do gerente continua bloqueando tudo);
--     2. dispositivo ativo, da mesma empresa;
--     3. hora da venda <= T_s                          (feita antes da suspensão);
--     4. hora da venda >= max(T_s - W, ativação)       (sem retroagir além da janela offline);
--     5. hora da venda <= L + W                        (a autorização ainda valia quando vendeu);
--     6. chega até C + offline_envio_min (padrão 60 min) — depois disso o dispositivo já sabia da
--        suspensão e nada mais entra, mesmo com relógio adulterado.
--   Venda web / venda nova após C: bloqueadas como antes (VENDAS_SUSPENSAS).
--   Empresa sem assinatura (Empresa 1) nunca é suspensa pela cobrança — nada muda para ela.
-- Implementação mínima: o gatilho de vendas existente ganha UMA exceção (venda pré-liberada por id);
-- o sync-outbox pede a liberação antes de registrar a venda.

ALTER TABLE saas.assinaturas ADD COLUMN IF NOT EXISTS suspensa_em timestamptz NULL;

INSERT INTO saas.parametros (chave, valor, descricao) VALUES
  ('offline_janela_horas', '72', 'Validade da autorização offline do PDV (horas) para vendas anteriores à suspensão'),
  ('offline_envio_min', '60', 'Minutos após o PDV saber da suspensão para enviar vendas anteriores a ela')
ON CONFLICT (chave) DO NOTHING;

-- T_s: marcado quando a suspensão da cobrança é aplicada; limpo na reativação.
CREATE OR REPLACE FUNCTION saas.tg_marcar_suspensa_em()
RETURNS trigger LANGUAGE plpgsql SET search_path = saas, pg_temp AS $$
BEGIN
  IF NEW.suspensao_aplicada AND NOT coalesce(OLD.suspensao_aplicada, false) THEN NEW.suspensa_em := now();
  ELSIF NOT NEW.suspensao_aplicada THEN NEW.suspensa_em := NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_assinaturas_suspensa_em ON saas.assinaturas;
CREATE TRIGGER trg_assinaturas_suspensa_em BEFORE INSERT OR UPDATE OF suspensao_aplicada ON saas.assinaturas
  FOR EACH ROW EXECUTE FUNCTION saas.tg_marcar_suspensa_em();

-- C e L: registrados pelo próprio "touch" de ultimo_sync_em que o sync-outbox já faz.
CREATE TABLE IF NOT EXISTS saas.dispositivo_ciencia_suspensao (
  dispositivo_id uuid NOT NULL REFERENCES public.pdv_dispositivos(id) ON DELETE CASCADE,
  suspensa_em timestamptz NOT NULL,
  ultimo_contato_antes timestamptz NULL,
  ciente_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dispositivo_id, suspensa_em)
);
CREATE TABLE IF NOT EXISTS saas.vendas_offline_liberadas (
  venda_id uuid PRIMARY KEY,
  empresa_id uuid NOT NULL,
  dispositivo_id uuid NOT NULL,
  venda_em timestamptz NOT NULL,
  liberada_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE saas.dispositivo_ciencia_suspensao ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.vendas_offline_liberadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON saas.dispositivo_ciencia_suspensao, saas.vendas_offline_liberadas FROM PUBLIC, anon, authenticated;
GRANT ALL ON saas.dispositivo_ciencia_suspensao, saas.vendas_offline_liberadas TO service_role;

CREATE OR REPLACE FUNCTION saas.tg_dispositivo_ciencia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
DECLARE v_ts timestamptz;
BEGIN
  SELECT a.suspensa_em INTO v_ts FROM saas.assinaturas a
   WHERE a.empresa_id = NEW.empresa_id AND a.suspensao_aplicada AND a.suspensa_em IS NOT NULL;
  IF v_ts IS NOT NULL AND NEW.ultimo_sync_em >= v_ts AND (OLD.ultimo_sync_em IS NULL OR OLD.ultimo_sync_em < v_ts) THEN
    INSERT INTO saas.dispositivo_ciencia_suspensao (dispositivo_id, suspensa_em, ultimo_contato_antes, ciente_em)
    VALUES (NEW.id, v_ts, OLD.ultimo_sync_em, NEW.ultimo_sync_em)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pdv_dispositivos_ciencia_suspensao ON public.pdv_dispositivos;
CREATE TRIGGER trg_pdv_dispositivos_ciencia_suspensao BEFORE UPDATE OF ultimo_sync_em ON public.pdv_dispositivos
  FOR EACH ROW EXECUTE FUNCTION saas.tg_dispositivo_ciencia();
REVOKE ALL ON FUNCTION saas.tg_marcar_suspensa_em(), saas.tg_dispositivo_ciencia() FROM PUBLIC, anon, authenticated;

-- Avaliação da política (service_role: chamada pelo sync-outbox antes de registrar a venda).
CREATE OR REPLACE FUNCTION public.cobranca_liberar_venda_offline(p_dispositivo uuid, p_venda_id uuid, p_venda_em timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
DECLARE d public.pdv_dispositivos; a saas.assinaturas; c saas.dispositivo_ciencia_suspensao;
  w interval := make_interval(hours => saas.param_int('offline_janela_horas', 72));
  g interval := make_interval(mins => saas.param_int('offline_envio_min', 60));
  v_aut timestamptz;
  r text;
BEGIN
  IF p_dispositivo IS NULL OR p_venda_id IS NULL THEN RAISE EXCEPTION 'VENDA_OFFLINE_PARAMETROS_INVALIDOS'; END IF;
  SELECT * INTO d FROM public.pdv_dispositivos WHERE id = p_dispositivo AND ativo;
  IF NOT FOUND THEN RETURN jsonb_build_object('liberada', false, 'motivo', 'DISPOSITIVO_INATIVO'); END IF;
  SELECT * INTO a FROM saas.assinaturas WHERE empresa_id = d.empresa_id;
  IF NOT FOUND OR NOT a.suspensao_aplicada OR a.suspensa_em IS NULL THEN
    RETURN jsonb_build_object('liberada', false, 'motivo', 'SEM_SUSPENSAO_COBRANCA'); -- o gatilho decide como sempre
  END IF;
  SELECT * INTO c FROM saas.dispositivo_ciencia_suspensao WHERE dispositivo_id = d.id AND suspensa_em = a.suspensa_em;
  v_aut := CASE WHEN c.dispositivo_id IS NOT NULL THEN coalesce(c.ultimo_contato_antes, d.ativado_em)
                WHEN d.ultimo_sync_em IS NULL OR d.ultimo_sync_em < a.suspensa_em THEN coalesce(d.ultimo_sync_em, d.ativado_em) END;
  r := CASE
    WHEN p_venda_em IS NULL THEN 'VENDA_SEM_HORA'
    WHEN v_aut IS NULL OR v_aut > a.suspensa_em THEN 'SEM_AUTORIZACAO_OFFLINE'
    WHEN c.dispositivo_id IS NOT NULL AND now() > c.ciente_em + g THEN 'PRAZO_DE_ENVIO_EXPIRADO'
    WHEN p_venda_em > a.suspensa_em THEN 'VENDA_APOS_SUSPENSAO'
    WHEN p_venda_em < greatest(a.suspensa_em - w, d.ativado_em) THEN 'VENDA_FORA_DA_JANELA_OFFLINE'
    WHEN p_venda_em > v_aut + w THEN 'AUTORIZACAO_OFFLINE_EXPIRADA'
  END;
  IF r IS NOT NULL THEN RETURN jsonb_build_object('liberada', false, 'motivo', r); END IF;
  INSERT INTO saas.vendas_offline_liberadas (venda_id, empresa_id, dispositivo_id, venda_em)
  VALUES (p_venda_id, d.empresa_id, d.id, p_venda_em) ON CONFLICT (venda_id) DO NOTHING;
  RETURN jsonb_build_object('liberada', true);
END $$;
REVOKE ALL ON FUNCTION public.cobranca_liberar_venda_offline(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cobranca_liberar_venda_offline(uuid, uuid, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION internal.cobranca_venda_offline_liberada(p_venda uuid, p_caixa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM saas.vendas_offline_liberadas v
                  WHERE v.venda_id = p_venda AND v.empresa_id = public.fp_empresa_contexto(public.fp_loja_de('caixa', p_caixa)));
$$;
REVOKE ALL ON FUNCTION internal.cobranca_venda_offline_liberada(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Única mudança no gatilho de vendas: a exceção acima. Recusa aplicar se o trecho não existir (drift).
DO $$
DECLARE v_def text := pg_get_functiondef('public.trg_fn_vendas_caixa_aberto()'::regprocedure);
  c_de text := 'IF v_suspensas = ''true'' THEN';
  c_para text := 'IF v_suspensas = ''true'' AND NOT internal.cobranca_venda_offline_liberada(NEW.id, NEW.caixa_id) THEN';
BEGIN
  IF strpos(v_def, c_para) > 0 THEN RETURN; END IF;
  IF strpos(v_def, c_de) = 0 THEN RAISE EXCEPTION 'cobranca: trg_fn_vendas_caixa_aberto sem o trecho esperado (drift)'; END IF;
  EXECUTE replace(v_def, c_de, c_para);
END $$;
