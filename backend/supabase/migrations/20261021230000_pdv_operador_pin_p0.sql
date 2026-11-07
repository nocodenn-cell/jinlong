-- PDV · Login rápido por PIN (P0) — só aditiva. Plano: plano-login-rapido-pdv.md (decisões: caixa do terminal
-- (opção A), PIN de 4 dígitos, bloqueio por inatividade 3 min).
--  * public.usuario_pin: hash PBKDF2-SHA256 do PIN (salt + iterações) e contador de erros. Tabela SEPARADA de
--    `usuarios` de propósito: as policies de SELECT em usuarios (próprio/dono) nunca expõem o hash.
--    Sem policies + REVOKE de anon/authenticated ⇒ só service_role e as funções SECURITY DEFINER abaixo.
--  * pdv_config.exigir_pin_operador (DEFAULT false ⇒ nada muda até ligar por loja) e bloqueio_inatividade_min.
--  * public.pdv_operador_eventos: auditoria (entrou/saiu/bloqueio/PIN errado/override do gerente), id gerado no
--    PDV (idempotente no replay da outbox).
-- O PIN em claro nunca chega ao banco: o servidor (Next/Edge) deriva o hash e o banco só guarda/compara contadores.

CREATE TABLE IF NOT EXISTS public.usuario_pin (
  usuario_id uuid PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  pin_hash text NOT NULL CHECK (pin_hash ~ '^[0-9a-f]{64}$'),
  pin_salt text NOT NULL CHECK (pin_salt ~ '^[0-9a-f]{32,64}$'),
  pin_iteracoes integer NOT NULL CHECK (pin_iteracoes >= 100000),
  pin_tentativas integer NOT NULL DEFAULT 0 CHECK (pin_tentativas >= 0),
  pin_bloqueado_ate timestamptz NULL,
  definido_em timestamptz NOT NULL DEFAULT now(),
  definido_por uuid NULL,
  -- PIN definido por gerente/dono para outra pessoa ⇒ o funcionário deve trocar em "Meu PIN do caixa".
  trocar_no_primeiro_uso boolean NOT NULL DEFAULT false
);
ALTER TABLE public.usuario_pin ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.usuario_pin FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.usuario_pin TO service_role;

ALTER TABLE public.pdv_config ADD COLUMN IF NOT EXISTS exigir_pin_operador boolean NOT NULL DEFAULT false;
ALTER TABLE public.pdv_config ADD COLUMN IF NOT EXISTS bloqueio_inatividade_min integer NOT NULL DEFAULT 3
  CHECK (bloqueio_inatividade_min BETWEEN 1 AND 60);

CREATE TABLE IF NOT EXISTS public.pdv_operador_eventos (
  id uuid PRIMARY KEY,
  empresa_id uuid NULL,
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  dispositivo_id uuid NULL REFERENCES public.pdv_dispositivos(id),
  usuario_id uuid NULL REFERENCES public.usuarios(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('ENTROU', 'SAIU', 'BLOQUEIO_AUTO', 'PIN_ERRADO', 'BLOQUEADO',
                                     'OVERRIDE_GERENTE', 'PIN_DEFINIDO', 'PIN_RESETADO', 'PIN_DESBLOQUEADO')),
  origem text NOT NULL DEFAULT 'online' CHECK (origem IN ('online', 'offline', 'admin')),
  detalhe jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  recebido_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pdv_operador_eventos_loja_em_idx ON public.pdv_operador_eventos (loja_id, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS pdv_operador_eventos_usuario_idx ON public.pdv_operador_eventos (usuario_id, ocorrido_em DESC);
ALTER TABLE public.pdv_operador_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_operador_eventos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pdv_operador_eventos TO service_role;

-- PINs óbvios recusados (validado de novo no servidor Next antes de derivar o hash).
CREATE OR REPLACE FUNCTION public.pdv_pin_obvio(p_pin text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT p_pin IS NULL OR p_pin !~ '^[0-9]{4}$'
      OR p_pin ~ '^(.)\1{3}$'
      OR p_pin IN ('0123','1234','2345','3456','4567','5678','6789','9876','8765','7654','6543','5432','4321','3210',
                   '1212','1122','2580','0852','1004','2000','2001','1010','6969');
$$;

-- Grava o hash do PRÓPRIO PIN (usuário logado). Derivação feita no servidor (PBKDF2-SHA256 ≥100k).
CREATE OR REPLACE FUNCTION public.definir_meu_pin_pdv(p_hash text, p_salt text, p_iteracoes integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_loja uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = v_uid AND ativo) THEN
    RAISE EXCEPTION 'USUARIO_INATIVO' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.usuario_pin (usuario_id, pin_hash, pin_salt, pin_iteracoes, pin_tentativas, pin_bloqueado_ate, definido_em, definido_por, trocar_no_primeiro_uso)
  VALUES (v_uid, p_hash, p_salt, p_iteracoes, 0, NULL, now(), v_uid, false)
  ON CONFLICT (usuario_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, pin_salt = EXCLUDED.pin_salt,
    pin_iteracoes = EXCLUDED.pin_iteracoes, pin_tentativas = 0, pin_bloqueado_ate = NULL,
    definido_em = now(), definido_por = v_uid, trocar_no_primeiro_uso = false;
  SELECT v.loja_id INTO v_loja FROM public.usuario_vinculos v WHERE v.usuario_id = v_uid AND v.ativo AND v.loja_id IS NOT NULL LIMIT 1;
  IF v_loja IS NOT NULL THEN
    INSERT INTO public.pdv_operador_eventos (id, loja_id, usuario_id, tipo, origem)
    VALUES (gen_random_uuid(), v_loja, v_uid, 'PIN_DEFINIDO', 'admin');
  END IF;
END $$;

-- Gerente/dono apaga o PIN (e o bloqueio) de um funcionário de uma loja que ele gerencia. O funcionário
-- define um novo em "Meu PIN do caixa". Gerente não escolhe o PIN de ninguém.
CREATE OR REPLACE FUNCTION public.resetar_pin_operador_pdv(p_usuario uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_loja uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501'; END IF;
  SELECT l.id INTO v_loja
    FROM public.usuario_vinculos alvo
    JOIN public.lojas l ON l.empresa_id = alvo.empresa_id AND (alvo.loja_id IS NULL OR l.id = alvo.loja_id)
   WHERE alvo.usuario_id = p_usuario AND alvo.ativo
     AND public.fp_usuario_pode_loja(v_uid, l.id, ARRAY['DONO','GERENTE'])
   LIMIT 1;
  IF v_loja IS NULL THEN RAISE EXCEPTION 'SEM_PERMISSAO' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.usuario_pin WHERE usuario_id = p_usuario;
  INSERT INTO public.pdv_operador_eventos (id, loja_id, usuario_id, tipo, origem, detalhe)
  VALUES (gen_random_uuid(), v_loja, p_usuario, 'PIN_RESETADO', 'admin', jsonb_build_object('por', v_uid));
END $$;

-- Tela "Meu PIN do caixa": o próprio usuário + (gerente/dono) a equipe das lojas que gerencia. Sem hash.
CREATE OR REPLACE FUNCTION public.status_pin_equipe_pdv()
RETURNS TABLE (usuario_id uuid, nome text, papel text, eu boolean, tem_pin boolean, bloqueado boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH alvo AS (
    SELECT DISTINCT ON (u.id) u.id, u.nome, v.papel
      FROM public.usuario_vinculos v
      JOIN public.usuarios u ON u.id = v.usuario_id AND u.ativo
      JOIN public.lojas l ON l.empresa_id = v.empresa_id AND (v.loja_id IS NULL OR l.id = v.loja_id)
     WHERE v.ativo AND auth.uid() IS NOT NULL
       AND (u.id = auth.uid() OR public.fp_usuario_pode_loja(auth.uid(), l.id, ARRAY['DONO','GERENTE']))
     ORDER BY u.id, CASE v.papel WHEN 'DONO' THEN 0 WHEN 'GERENTE' THEN 1 ELSE 2 END
  )
  SELECT a.id, a.nome, a.papel, a.id = auth.uid(), p.usuario_id IS NOT NULL, coalesce(p.pin_bloqueado_ate > now(), false)
    FROM alvo a LEFT JOIN public.usuario_pin p ON p.usuario_id = a.id
   ORDER BY (a.id = auth.uid()) DESC, a.nome;
$$;

-- Edge sync-outbox (service_role): operadores da loja do dispositivo + material do PIN para o cache offline.
CREATE OR REPLACE FUNCTION public.pdv_operadores_da_loja(p_loja uuid)
RETURNS TABLE (usuario_id uuid, nome text, papel text, idioma text, pin_hash text, pin_salt text,
               pin_iteracoes integer, pin_bloqueado_ate timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT ON (u.id) u.id, u.nome, v.papel, u.idioma_preferido, p.pin_hash, p.pin_salt, p.pin_iteracoes, p.pin_bloqueado_ate
    FROM public.usuario_vinculos v
    JOIN public.usuarios u ON u.id = v.usuario_id AND u.ativo
    JOIN public.lojas l ON l.id = p_loja AND l.empresa_id = v.empresa_id
    LEFT JOIN public.usuario_pin p ON p.usuario_id = u.id
   WHERE v.ativo AND (v.papel = 'DONO' OR v.loja_id = p_loja)
   ORDER BY u.id, CASE v.papel WHEN 'DONO' THEN 0 WHEN 'GERENTE' THEN 1 ELSE 2 END;
$$;

-- Edge (service_role): registra o resultado de uma verificação ONLINE. 5 erros ⇒ 5 min; 10 ⇒ só o gerente
-- (reset) desbloqueia. Retorna o estado após o registro.
CREATE OR REPLACE FUNCTION public.pdv_pin_registrar_tentativa(p_usuario uuid, p_ok boolean)
RETURNS TABLE (tentativas integer, bloqueado_ate timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_ok THEN
    UPDATE public.usuario_pin SET pin_tentativas = 0, pin_bloqueado_ate = NULL WHERE usuario_id = p_usuario;
  ELSE
    UPDATE public.usuario_pin
       SET pin_tentativas = pin_tentativas + 1,
           pin_bloqueado_ate = CASE WHEN pin_tentativas + 1 >= 10 THEN 'infinity'::timestamptz
                                    WHEN (pin_tentativas + 1) % 5 = 0 THEN now() + interval '5 minutes'
                                    ELSE pin_bloqueado_ate END
     WHERE usuario_id = p_usuario;
  END IF;
  RETURN QUERY SELECT p.pin_tentativas, p.pin_bloqueado_ate FROM public.usuario_pin p WHERE p.usuario_id = p_usuario;
END $$;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.pdv_pin_obvio(text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.pdv_pin_obvio(text) TO authenticated, service_role;
  REVOKE ALL ON FUNCTION public.definir_meu_pin_pdv(text, text, integer) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.definir_meu_pin_pdv(text, text, integer) TO authenticated, service_role;
  REVOKE ALL ON FUNCTION public.resetar_pin_operador_pdv(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.resetar_pin_operador_pdv(uuid) TO authenticated, service_role;
  REVOKE ALL ON FUNCTION public.status_pin_equipe_pdv() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.status_pin_equipe_pdv() TO authenticated, service_role;
  REVOKE ALL ON FUNCTION public.pdv_operadores_da_loja(uuid) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.pdv_operadores_da_loja(uuid) TO service_role;
  REVOKE ALL ON FUNCTION public.pdv_pin_registrar_tentativa(uuid, boolean) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.pdv_pin_registrar_tentativa(uuid, boolean) TO service_role;
END $$;

-- Tela Funcionários (server action com service_role; o ATOR vem da sessão validada no servidor).
-- Loja do alvo que o ator gerencia; GERENTE só mexe em OPERADOR, DONO também em GERENTE; nunca em DONO/ADMIN/si mesmo.
CREATE OR REPLACE FUNCTION public.pdv_pin_loja_gerida(p_usuario uuid, p_ator uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.id
    FROM public.usuario_vinculos alvo
    JOIN public.usuarios u ON u.id = alvo.usuario_id AND u.ativo
    JOIN public.lojas l ON l.empresa_id = alvo.empresa_id AND alvo.loja_id = l.id
   WHERE alvo.usuario_id = p_usuario AND alvo.ativo AND p_ator IS NOT NULL AND p_ator <> p_usuario
     AND (   (alvo.papel = 'OPERADOR' AND public.fp_usuario_pode_loja(p_ator, l.id, ARRAY['DONO','GERENTE']))
          OR (alvo.papel = 'GERENTE'  AND public.fp_usuario_pode_loja(p_ator, l.id, ARRAY['DONO'])))
   LIMIT 1;
$$;

-- Gerente/dono define o PIN inicial (ou troca) de um funcionário. Hash derivado no servidor; o funcionário
-- fica marcado para trocar em "Meu PIN do caixa".
CREATE OR REPLACE FUNCTION public.definir_pin_operador_pdv(p_usuario uuid, p_hash text, p_salt text, p_iteracoes integer, p_ator uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_loja uuid := public.pdv_pin_loja_gerida(p_usuario, p_ator);
BEGIN
  IF v_loja IS NULL THEN RAISE EXCEPTION 'SEM_PERMISSAO' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.usuario_pin (usuario_id, pin_hash, pin_salt, pin_iteracoes, pin_tentativas, pin_bloqueado_ate, definido_em, definido_por, trocar_no_primeiro_uso)
  VALUES (p_usuario, p_hash, p_salt, p_iteracoes, 0, NULL, now(), p_ator, true)
  ON CONFLICT (usuario_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, pin_salt = EXCLUDED.pin_salt,
    pin_iteracoes = EXCLUDED.pin_iteracoes, pin_tentativas = 0, pin_bloqueado_ate = NULL,
    definido_em = now(), definido_por = p_ator, trocar_no_primeiro_uso = true;
  INSERT INTO public.pdv_operador_eventos (id, loja_id, usuario_id, tipo, origem, detalhe)
  VALUES (gen_random_uuid(), v_loja, p_usuario, 'PIN_DEFINIDO', 'admin', jsonb_build_object('por', p_ator));
END $$;

-- Desbloqueia (zera tentativas) sem apagar o PIN.
CREATE OR REPLACE FUNCTION public.desbloquear_pin_operador_pdv(p_usuario uuid, p_ator uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_loja uuid := public.pdv_pin_loja_gerida(p_usuario, p_ator);
BEGIN
  IF v_loja IS NULL THEN RAISE EXCEPTION 'SEM_PERMISSAO' USING ERRCODE = '42501'; END IF;
  UPDATE public.usuario_pin SET pin_tentativas = 0, pin_bloqueado_ate = NULL WHERE usuario_id = p_usuario;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEM_PIN' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.pdv_operador_eventos (id, loja_id, usuario_id, tipo, origem, detalhe)
  VALUES (gen_random_uuid(), v_loja, p_usuario, 'PIN_DESBLOQUEADO', 'admin', jsonb_build_object('por', p_ator));
END $$;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.pdv_pin_loja_gerida(uuid, uuid) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.pdv_pin_loja_gerida(uuid, uuid) TO service_role;
  REVOKE ALL ON FUNCTION public.definir_pin_operador_pdv(uuid, text, text, integer, uuid) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.definir_pin_operador_pdv(uuid, text, text, integer, uuid) TO service_role;
  REVOKE ALL ON FUNCTION public.desbloquear_pin_operador_pdv(uuid, uuid) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.desbloquear_pin_operador_pdv(uuid, uuid) TO service_role;
END $$;
