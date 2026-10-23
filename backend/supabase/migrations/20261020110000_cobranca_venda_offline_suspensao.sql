-- Cobrança — venda OFFLINE feita ANTES da suspensão por cobrança é aceita no sync, mesmo chegando depois.
--
-- Âncora = AUTORIZAÇÃO OFFLINE EMITIDA PELO SERVIDOR (não o relógio do PC):
--   * A cada contato autenticado do PDV (HMAC por dispositivo + nonce anti-replay do sync-outbox) com a
--     empresa NÃO suspensa, o servidor emite saas.pdv_autorizacoes_offline (id aleatório, emitida_em e
--     expira_em = emitida_em + offline_janela_horas, ambos com o relógio do SERVIDOR). Emitida no
--     máximo 1 por offline_emissao_min por dispositivo.
--   * T_s = saas.assinaturas.suspensa_em (relógio do servidor). Com a empresa suspensa nenhuma
--     autorização nova é emitida.
--   * C   = primeiro contato do dispositivo depois de T_s (o PDV "recebeu a suspensão").
-- Venda do dispositivo é liberada durante a suspensão por cobrança se, e só se:
--   1. dispositivo ativo; a venda nunca foi liberada para OUTRO dispositivo/empresa (id não reaproveitável);
--   2. existe autorização do PRÓPRIO dispositivo emitida antes de T_s com emitida_em <= hora_venda <= expira_em
--      (não dá para retroagir antes de uma autorização real, nem usar autorização vencida);
--   3. hora_venda <= T_s e <= agora;
--   4. monotonia: hora_venda >= maior hora de venda já liberada para o dispositivo nesta suspensão
--      (a outbox envia em ordem; venda "inserida no passado" depois é recusada);
--   5. chega até C + offline_envio_min — depois disso o PDV já sabia da suspensão e nada mais entra.
-- Mesma venda sincronizada 2x = 1 venda (registrar_venda_com_itens já é idempotente; a liberação também).
-- Suspensão manual do gerente e venda web: sem exceção. Empresa sem assinatura (Empresa 1): nunca afetada.
-- Mudança mínima: o gatilho de vendas existente ganha UMA exceção (venda pré-liberada por id).

ALTER TABLE saas.assinaturas ADD COLUMN IF NOT EXISTS suspensa_em timestamptz NULL;

INSERT INTO saas.parametros (chave, valor, descricao) VALUES
  ('offline_janela_horas', '72', 'Validade da autorização offline do PDV (horas) para vendas anteriores à suspensão'),
  ('offline_envio_min', '60', 'Minutos após o PDV saber da suspensão para enviar vendas anteriores a ela'),
  ('offline_emissao_min', '10', 'Intervalo mínimo entre autorizações offline emitidas para o mesmo dispositivo')
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
  autorizacao_id uuid NULL,
  liberada_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS saas.pdv_autorizacoes_offline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispositivo_id uuid NOT NULL REFERENCES public.pdv_dispositivos(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL,
  emitida_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,
  CHECK (expira_em > emitida_em)
);
CREATE INDEX IF NOT EXISTS pdv_autorizacoes_offline_disp_idx ON saas.pdv_autorizacoes_offline (dispositivo_id, emitida_em DESC);
ALTER TABLE saas.pdv_autorizacoes_offline ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON saas.pdv_autorizacoes_offline FROM PUBLIC, anon, authenticated;
GRANT ALL ON saas.pdv_autorizacoes_offline TO service_role;
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
  IF v_ts IS NOT NULL THEN
    -- suspensa: nenhuma autorização nova; registra quando o PDV ficou sabendo
    IF NEW.ultimo_sync_em >= v_ts AND (OLD.ultimo_sync_em IS NULL OR OLD.ultimo_sync_em < v_ts) THEN
      INSERT INTO saas.dispositivo_ciencia_suspensao (dispositivo_id, suspensa_em, ultimo_contato_antes, ciente_em)
      VALUES (NEW.id, v_ts, OLD.ultimo_sync_em, now())
      ON CONFLICT DO NOTHING;
    END IF;
  ELSIF NEW.ativo AND NOT EXISTS (SELECT 1 FROM saas.pdv_autorizacoes_offline x WHERE x.dispositivo_id = NEW.id
          AND x.emitida_em > now() - make_interval(mins => saas.param_int('offline_emissao_min', 10))) THEN
    -- relógio do SERVIDOR (now()), nunca o valor vindo do cliente
    INSERT INTO saas.pdv_autorizacoes_offline (dispositivo_id, empresa_id, emitida_em, expira_em)
    VALUES (NEW.id, NEW.empresa_id, now(), now() + make_interval(hours => saas.param_int('offline_janela_horas', 72)));
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
  ja saas.vendas_offline_liberadas; aut saas.pdv_autorizacoes_offline; v_hwm timestamptz;
  g interval := make_interval(mins => saas.param_int('offline_envio_min', 60));
  r text;
BEGIN
  IF p_dispositivo IS NULL OR p_venda_id IS NULL THEN RAISE EXCEPTION 'VENDA_OFFLINE_PARAMETROS_INVALIDOS'; END IF;
  SELECT * INTO d FROM public.pdv_dispositivos WHERE id = p_dispositivo AND ativo;
  IF NOT FOUND THEN RETURN jsonb_build_object('liberada', false, 'motivo', 'DISPOSITIVO_INATIVO'); END IF;
  -- idempotência / id não reaproveitável
  SELECT * INTO ja FROM saas.vendas_offline_liberadas WHERE venda_id = p_venda_id;
  IF FOUND THEN
    IF ja.dispositivo_id = d.id AND ja.venda_em = p_venda_em THEN
      RETURN jsonb_build_object('liberada', true, 'idempotente', true);
    END IF;
    RETURN jsonb_build_object('liberada', false, 'motivo', 'VENDA_ID_REUTILIZADO');
  END IF;
  SELECT * INTO a FROM saas.assinaturas WHERE empresa_id = d.empresa_id;
  IF NOT FOUND OR NOT a.suspensao_aplicada OR a.suspensa_em IS NULL THEN
    RETURN jsonb_build_object('liberada', false, 'motivo', 'SEM_SUSPENSAO_COBRANCA'); -- o gatilho decide como sempre
  END IF;
  -- prazo de envio começa no 1º contato após a suspensão; se o "touch" do sync falhou, começa AGORA
  -- (nunca fica sem prazo). Chave (dispositivo, suspensão): re-sync não reinicia a contagem.
  INSERT INTO saas.dispositivo_ciencia_suspensao (dispositivo_id, suspensa_em, ultimo_contato_antes, ciente_em)
  VALUES (d.id, a.suspensa_em, d.ultimo_sync_em, now()) ON CONFLICT DO NOTHING;
  SELECT * INTO c FROM saas.dispositivo_ciencia_suspensao WHERE dispositivo_id = d.id AND suspensa_em = a.suspensa_em;
  SELECT * INTO aut FROM saas.pdv_autorizacoes_offline x
   WHERE x.dispositivo_id = d.id AND x.empresa_id = d.empresa_id AND x.emitida_em <= a.suspensa_em
     AND p_venda_em IS NOT NULL AND x.emitida_em <= p_venda_em AND p_venda_em <= x.expira_em
   ORDER BY x.emitida_em DESC LIMIT 1;
  SELECT max(v.venda_em) INTO v_hwm FROM saas.vendas_offline_liberadas v
   WHERE v.dispositivo_id = d.id AND v.liberada_em >= a.suspensa_em;
  r := CASE
    WHEN p_venda_em IS NULL THEN 'VENDA_SEM_HORA'
    WHEN now() > c.ciente_em + g THEN 'PRAZO_DE_ENVIO_EXPIRADO'
    WHEN p_venda_em > a.suspensa_em OR p_venda_em > now() THEN 'VENDA_APOS_SUSPENSAO'
    WHEN aut.id IS NULL THEN 'SEM_AUTORIZACAO_OFFLINE_VALIDA'
    WHEN v_hwm IS NOT NULL AND p_venda_em < v_hwm THEN 'VENDA_FORA_DE_ORDEM'
  END;
  IF r IS NOT NULL THEN RETURN jsonb_build_object('liberada', false, 'motivo', r); END IF;
  INSERT INTO saas.vendas_offline_liberadas (venda_id, empresa_id, dispositivo_id, venda_em, autorizacao_id)
  VALUES (p_venda_id, d.empresa_id, d.id, p_venda_em, aut.id);
  RETURN jsonb_build_object('liberada', true, 'autorizacao_id', aut.id);
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
