-- 274 — Fase 5: infraestrutura de Authorization Challenge (preparação para
-- QR Code / PIN / biometria), sem integrar nada externo ainda.
--
-- Decisão de design (o que garante "nenhuma alteração necessária em
-- cancelar venda, devolução, desconto, sangria..." quando o app do gerente
-- existir): esta migration NÃO toca `autorizar_operacao_privilegiada()`
-- nem nenhuma RPC de venda. O contrato que essas RPCs já validam
-- (`tokens_desconto_gerente`: token opaco, único uso, TTL) continua sendo
-- a ÚNICA coisa que elas entendem. Um challenge aprovado (por QR, PIN, o
-- que for) produz um token NESSA MESMA tabela — não um tipo de prova
-- diferente. Ou seja: o método de autorização vira um detalhe de como o
-- token foi emitido, nunca um novo caminho de validação nas RPCs de venda.
--
-- `authorization_challenges` é a entidade que representa uma autorização
-- pendente (hoje só suporta ser criada e consultada; aprovar/rejeitar é
-- stub funcional, sem nenhum consumidor real ainda — nem app mobile, nem
-- websocket, nem push. UI do caixa não chama nada disso nesta sprint).

CREATE TABLE IF NOT EXISTS public.authorization_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL,
  method text NOT NULL CHECK (method IN ('PASSWORD', 'PIN', 'QR_CODE')),
  operator_id uuid NOT NULL REFERENCES public.usuarios (id),
  manager_id uuid REFERENCES public.usuarios (id),
  loja_id uuid NOT NULL REFERENCES public.lojas (id),
  caixa_id uuid REFERENCES public.caixas (id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  device_fingerprint text,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONSUMED')),
  -- Token emitido em tokens_desconto_gerente quando aprovado — mesmo
  -- contrato que cancelar_venda_transacional/devolver_ou_trocar_venda já
  -- validam via autorizar_operacao_privilegiada. NULL até aprovação.
  token text REFERENCES public.tokens_desconto_gerente (token),
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_authorization_challenges_operador
  ON public.authorization_challenges (operator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_authorization_challenges_loja_status
  ON public.authorization_challenges (loja_id, status, created_at DESC);

COMMENT ON TABLE public.authorization_challenges IS
  'Autorização privilegiada pendente/decidida — método-agnóstica. Ao ser aprovada, emite um token em tokens_desconto_gerente (mesmo contrato usado por PASSWORD hoje); as RPCs de venda nunca leem esta tabela diretamente.';

ALTER TABLE public.authorization_challenges ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.authorization_challenges FROM anon;
GRANT SELECT, INSERT ON TABLE public.authorization_challenges TO authenticated;
GRANT ALL ON TABLE public.authorization_challenges TO service_role;

-- Operador vê os próprios challenges; gerente/dono/admin vê os da loja
-- (para o futuro app aprovar/rejeitar).
CREATE POLICY authorization_challenges_select ON public.authorization_challenges
  FOR SELECT TO authenticated
  USING (
    operator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('ADMIN', 'DONO', 'GERENTE')
        AND u.loja_id = authorization_challenges.loja_id
    )
  );

CREATE POLICY authorization_challenges_insert ON public.authorization_challenges
  FOR INSERT TO authenticated
  WITH CHECK (operator_id = auth.uid());

-- Sem policy de UPDATE direto: aprovar/rejeitar só via RPC SECURITY DEFINER
-- abaixo (garante que o token só é emitido pelo caminho auditado).

CREATE OR REPLACE FUNCTION public.criar_authorization_challenge(
  p_operation text,
  p_method text,
  p_caixa_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_ttl_seconds integer DEFAULT 45,
  p_device_fingerprint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_loja uuid;
  v_method text := upper(NULLIF(btrim(p_method), ''));
  v_operation text := NULLIF(btrim(p_operation), '');
  v_ttl integer := GREATEST(15, LEAST(COALESCE(p_ttl_seconds, 45), 300));
  v_id uuid;
  v_expires_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;
  IF v_operation IS NULL THEN
    RAISE EXCEPTION 'operacao_obrigatoria' USING ERRCODE = '22023';
  END IF;
  IF v_method NOT IN ('PASSWORD', 'PIN', 'QR_CODE') THEN
    RAISE EXCEPTION 'metodo_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT u.loja_id INTO v_loja FROM public.usuarios u WHERE u.id = v_uid;
  IF v_loja IS NULL THEN
    RAISE EXCEPTION 'loja_obrigatoria' USING ERRCODE = '22023';
  END IF;

  v_expires_at := now() + make_interval(secs => v_ttl);

  INSERT INTO public.authorization_challenges (
    operation, method, operator_id, loja_id, caixa_id, payload,
    device_fingerprint, status, expires_at
  ) VALUES (
    v_operation, v_method, v_uid, v_loja, p_caixa_id, COALESCE(p_payload, '{}'::jsonb),
    NULLIF(btrim(COALESCE(p_device_fingerprint, '')), ''), 'PENDING', v_expires_at
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'status', 'PENDING', 'expires_at', v_expires_at);
END;
$$;

REVOKE ALL ON FUNCTION public.criar_authorization_challenge(text, text, uuid, jsonb, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_authorization_challenge(text, text, uuid, jsonb, integer, text) TO authenticated;

-- Lazy-expira e retorna o estado atual — o operador faz polling nisso
-- (quando houver UI real de QR). Só revela o token ao próprio operador.
CREATE OR REPLACE FUNCTION public.obter_authorization_challenge(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.authorization_challenges%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.authorization_challenges WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'challenge_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.operator_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  IF v_row.status = 'PENDING' AND v_row.expires_at < now() THEN
    UPDATE public.authorization_challenges SET status = 'EXPIRED' WHERE id = p_id;
    v_row.status := 'EXPIRED';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'expires_at', v_row.expires_at,
    'token', CASE WHEN v_row.status = 'APPROVED' THEN v_row.token ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.obter_authorization_challenge(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obter_authorization_challenge(uuid) TO authenticated;

-- Stub funcional (sem consumidor real nesta sprint — nenhum app mobile
-- chama isto ainda). Quando o app existir, ele chama exatamente esta RPC.
-- Reaproveita o mesmo formato de token de tokens_desconto_gerente para que
-- autorizar_operacao_privilegiada continue funcionando sem alteração.
CREATE OR REPLACE FUNCTION public.aprovar_authorization_challenge(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.authorization_challenges%ROWTYPE;
  v_token text;
  v_expira_em timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.authorization_challenges WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'challenge_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.loja_id = v_row.loja_id AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  IF v_row.status <> 'PENDING' THEN
    RAISE EXCEPTION 'challenge_status_invalido' USING ERRCODE = '22023';
  END IF;
  IF v_row.expires_at < now() THEN
    UPDATE public.authorization_challenges SET status = 'EXPIRED' WHERE id = p_id;
    RAISE EXCEPTION 'challenge_expirado' USING ERRCODE = '22023';
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_expira_em := now() + interval '5 minutes';

  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, loja_id, criado_por)
  VALUES (v_token, v_expira_em, false, v_row.loja_id, v_uid);

  UPDATE public.authorization_challenges
  SET status = 'APPROVED', manager_id = v_uid, approved_at = now(), token = v_token
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'status', 'APPROVED');
END;
$$;

REVOKE ALL ON FUNCTION public.aprovar_authorization_challenge(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aprovar_authorization_challenge(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rejeitar_authorization_challenge(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.authorization_challenges%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.authorization_challenges WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'challenge_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.loja_id = v_row.loja_id AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  IF v_row.status <> 'PENDING' THEN
    RAISE EXCEPTION 'challenge_status_invalido' USING ERRCODE = '22023';
  END IF;

  UPDATE public.authorization_challenges
  SET status = 'REJECTED', manager_id = v_uid
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'status', 'REJECTED');
END;
$$;

REVOKE ALL ON FUNCTION public.rejeitar_authorization_challenge(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rejeitar_authorization_challenge(uuid) TO authenticated;
