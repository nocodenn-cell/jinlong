-- PDV · Troca Segura de Operador (F3) — gaveta do TURNO: vários operadores, um responsável.
-- Auditoria: AUDITORIA_OPERADOR_TROCA_SEGURA_2026-10-23.md (§5).
--
-- Papéis (sem duplicar identidade):
--   * responsável financeiro = public.caixas.operador_id (quem abriu; INALTERADO);
--   * operador ativo         = public.caixa_operadores (linha com fim IS NULL), trilha em pdv_operador_eventos;
--   * vendedor               = public.vendas.vendedor_id (inalterado).
--
-- Regra única do servidor: internal.fp_operador_ativo_caixa(caixa, responsável)
--   * caixa sem nenhuma linha em caixa_operadores  ⇒ o responsável (comportamento de hoje, retrocompatível);
--   * com linhas ⇒ o usuário da linha ativa NÃO bloqueada; liberado (sem ativa) ou bloqueado ⇒ NULL (ninguém opera).
-- Aplicada por troca de TEXTO verificada (sem reescrever as funções grandes) em:
--   internal.finalizar_venda_transacional_canonica_v4, registrar_movimentacao, estornar_movimentacao,
--   obter_status_caixa_operador. Fechamento: trigger em caixas (só o operador ativo ou gerente/dono fecha) e
--   encerra a linha ativa.
-- Identidade: SEMPRE o JWT (auth.uid()). PIN só desbloqueia o MESMO operador (desbloquear_* é service_role).
-- Rollback: backend/supabase/rollback/20261023200000_pdv_troca_operador_caixa.rollback.sql

CREATE TABLE IF NOT EXISTS public.caixa_operadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_id uuid NOT NULL REFERENCES public.caixas(id),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  inicio timestamptz NOT NULL DEFAULT now(),
  fim timestamptz NULL,
  motivo_fim text NULL CHECK (motivo_fim IN ('TROCA', 'FECHAMENTO', 'ASSUMIDO_GERENTE')),
  bloqueado_em timestamptz NULL,
  CONSTRAINT caixa_operadores_fim_motivo_ck CHECK ((fim IS NULL) = (motivo_fim IS NULL)),
  CONSTRAINT caixa_operadores_periodo_ck CHECK (fim IS NULL OR fim >= inicio)
);
-- Concorrência: um operador ativo por caixa e ninguém ativo em dois caixas.
CREATE UNIQUE INDEX IF NOT EXISTS caixa_operadores_ativo_por_caixa ON public.caixa_operadores (caixa_id) WHERE fim IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS caixa_operadores_ativo_por_usuario ON public.caixa_operadores (usuario_id) WHERE fim IS NULL;
CREATE INDEX IF NOT EXISTS caixa_operadores_caixa_inicio_idx ON public.caixa_operadores (caixa_id, inicio DESC);
CREATE INDEX IF NOT EXISTS caixa_operadores_loja_idx ON public.caixa_operadores (loja_id, inicio DESC);
COMMENT ON TABLE public.caixa_operadores IS
  'Operador ativo de cada caixa (troca sem fechar o turno). Escrita só pelas RPCs; caixas.operador_id segue sendo o responsável.';

ALTER TABLE public.caixa_operadores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.caixa_operadores FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.caixa_operadores TO authenticated;
GRANT ALL ON public.caixa_operadores TO service_role;
DROP POLICY IF EXISTS caixa_operadores_select ON public.caixa_operadores;
CREATE POLICY caixa_operadores_select ON public.caixa_operadores FOR SELECT TO authenticated
  USING (public.fp_pode_loja(loja_id));
DO $$
BEGIN
  IF to_regprocedure('internal.fp_aplicar_guarda(text, text, text, text)') IS NOT NULL THEN
    PERFORM internal.fp_aplicar_guarda('caixa_operadores', 'L', 'public.fp_pode_loja(loja_id::uuid, NULL)', 'loja_id');
  END IF;
END $$;

-- ─── regra única ──────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION internal.fp_operador_ativo_caixa(p_caixa_id uuid, p_responsavel uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.caixa_operadores co WHERE co.caixa_id = p_caixa_id) THEN p_responsavel
    ELSE (SELECT co.usuario_id FROM public.caixa_operadores co
           WHERE co.caixa_id = p_caixa_id AND co.fim IS NULL AND co.bloqueado_em IS NULL)
  END;
$$;
REVOKE ALL ON FUNCTION internal.fp_operador_ativo_caixa(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Leitura do turno: quem operou o caixa (linha em caixa_operadores, ativa ou não) vê os dados do turno.
CREATE OR REPLACE FUNCTION internal.fp_participou_caixa(p_caixa_id uuid, p_usuario uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_usuario IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.caixa_operadores co WHERE co.caixa_id = p_caixa_id AND co.usuario_id = p_usuario);
$$;
REVOKE ALL ON FUNCTION internal.fp_participou_caixa(uuid, uuid) FROM PUBLIC, anon, authenticated;
-- Versão para policies (executável por authenticated; sempre o próprio auth.uid()).
CREATE OR REPLACE FUNCTION public.fp_participa_caixa(p_caixa_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT internal.fp_participou_caixa(p_caixa_id, (SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.fp_participa_caixa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fp_participa_caixa(uuid) TO authenticated, service_role;

-- Evento de auditoria (reaproveita pdv_operador_eventos do PIN P0; origem online).
CREATE OR REPLACE FUNCTION internal.fp_evento_operador(p_loja uuid, p_usuario uuid, p_tipo text, p_detalhe jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.pdv_operador_eventos (id, empresa_id, loja_id, usuario_id, tipo, origem, detalhe)
  SELECT gen_random_uuid(), l.empresa_id, l.id, p_usuario, p_tipo, 'online', coalesce(p_detalhe, '{}'::jsonb)
    FROM public.lojas l WHERE l.id = p_loja;
$$;
REVOKE ALL ON FUNCTION internal.fp_evento_operador(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

-- Caixa nunca trocado ganha a linha do responsável (inicio = abertura) antes da primeira troca/bloqueio.
CREATE OR REPLACE FUNCTION internal.fp_garantir_linha_responsavel(p_caixa_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.caixa_operadores (caixa_id, loja_id, usuario_id, inicio)
  SELECT c.id, c.loja_id, c.operador_id, least(coalesce(c.data_abertura, now()), now())
    FROM public.caixas c
   WHERE c.id = p_caixa_id AND c.operador_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.caixa_operadores co WHERE co.caixa_id = c.id);
$$;
REVOKE ALL ON FUNCTION internal.fp_garantir_linha_responsavel(uuid) FROM PUBLIC, anon, authenticated;

-- ─── RPCs ─────────────────────────────────────────────────────────────────────────────────────────
-- O operador ativo libera o caixa para outro assumir (troca). O turno continua ABERTO; ninguém opera
-- até alguém autenticado assumir. Bloqueado não libera (desbloqueie antes).
CREATE OR REPLACE FUNCTION public.liberar_caixa_operador(p_caixa_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_caixa record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'TROCA_NAO_AUTENTICADO' USING ERRCODE = '42501'; END IF;
  SELECT c.id, c.loja_id, c.operador_id, c.status INTO v_caixa FROM public.caixas c WHERE c.id = p_caixa_id FOR UPDATE;
  IF NOT FOUND OR NOT public.fp_usuario_pode_loja(v_uid, v_caixa.loja_id, NULL) THEN
    RAISE EXCEPTION 'TROCA_CAIXA_NAO_ENCONTRADO';
  END IF;
  IF v_caixa.status <> 'ABERTO' THEN RAISE EXCEPTION 'TROCA_CAIXA_FECHADO'; END IF;
  IF internal.fp_operador_ativo_caixa(v_caixa.id, v_caixa.operador_id) IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'TROCA_NAO_E_OPERADOR_ATIVO';
  END IF;
  PERFORM internal.fp_garantir_linha_responsavel(v_caixa.id);
  UPDATE public.caixa_operadores SET fim = now(), motivo_fim = 'TROCA'
   WHERE caixa_id = v_caixa.id AND fim IS NULL;
  PERFORM internal.fp_evento_operador(v_caixa.loja_id, v_uid, 'SAIU',
    jsonb_build_object('caixa_id', v_caixa.id, 'motivo', 'TROCA'));
END $$;

-- Usuário autenticado (com a PRÓPRIA credencial) assume um caixa aberto da sua loja.
--  * caixa liberado (sem operador ativo): qualquer DONO/GERENTE/OPERADOR da loja;
--  * caixa em uso ou bloqueado por outro: só DONO/GERENTE da loja (encerra a linha com ASSUMIDO_GERENTE);
--  * quem assume não pode ser responsável por outro caixa aberto nem estar ativo em outro caixa.
-- Idempotente quando o próprio usuário já é o operador ativo.
CREATE OR REPLACE FUNCTION public.assumir_caixa_operador(p_caixa_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_caixa record; v_ativa record; v_gerente boolean; v_anterior uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'TROCA_NAO_AUTENTICADO' USING ERRCODE = '42501'; END IF;
  SELECT c.id, c.loja_id, c.operador_id, c.status INTO v_caixa FROM public.caixas c WHERE c.id = p_caixa_id FOR UPDATE;
  IF NOT FOUND OR NOT public.fp_usuario_pode_loja(v_uid, v_caixa.loja_id, ARRAY['DONO', 'GERENTE', 'OPERADOR']) THEN
    RAISE EXCEPTION 'TROCA_CAIXA_NAO_ENCONTRADO';
  END IF;
  IF v_caixa.status <> 'ABERTO' THEN RAISE EXCEPTION 'TROCA_CAIXA_FECHADO'; END IF;
  v_gerente := public.fp_usuario_pode_loja(v_uid, v_caixa.loja_id, ARRAY['DONO', 'GERENTE']);

  IF NOT EXISTS (SELECT 1 FROM public.caixa_operadores WHERE caixa_id = v_caixa.id) THEN
    IF v_caixa.operador_id = v_uid THEN RETURN; END IF;
    IF NOT v_gerente THEN RAISE EXCEPTION 'TROCA_CAIXA_EM_USO'; END IF;
    PERFORM internal.fp_garantir_linha_responsavel(v_caixa.id);
  END IF;

  SELECT co.id, co.usuario_id INTO v_ativa FROM public.caixa_operadores co
   WHERE co.caixa_id = v_caixa.id AND co.fim IS NULL FOR UPDATE;
  IF FOUND THEN
    IF v_ativa.usuario_id = v_uid THEN RETURN; END IF;
    IF NOT v_gerente THEN RAISE EXCEPTION 'TROCA_CAIXA_EM_USO'; END IF;
    UPDATE public.caixa_operadores SET fim = now(), motivo_fim = 'ASSUMIDO_GERENTE' WHERE id = v_ativa.id;
    v_anterior := v_ativa.usuario_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.caixas c WHERE c.operador_id = v_uid AND c.status = 'ABERTO' AND c.id <> v_caixa.id)
     OR EXISTS (SELECT 1 FROM public.caixa_operadores co WHERE co.usuario_id = v_uid AND co.fim IS NULL) THEN
    RAISE EXCEPTION 'TROCA_OPERADOR_COM_OUTRO_CAIXA';
  END IF;

  INSERT INTO public.caixa_operadores (caixa_id, loja_id, usuario_id) VALUES (v_caixa.id, v_caixa.loja_id, v_uid);
  PERFORM internal.fp_evento_operador(v_caixa.loja_id, v_uid, 'ENTROU',
    jsonb_build_object('caixa_id', v_caixa.id, 'responsavel', v_caixa.operador_id,
                       'anterior', v_anterior, 'forcado', v_anterior IS NOT NULL));
END $$;

-- Bloqueio de tela do operador ativo (inatividade ou botão). Bloquear é sempre seguro: o caixa
-- deixa de aceitar venda/movimentação até o MESMO operador desbloquear com PIN (ou um gerente assumir).
CREATE OR REPLACE FUNCTION public.bloquear_caixa_operador(p_motivo text DEFAULT 'INATIVIDADE')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_caixa record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'TROCA_NAO_AUTENTICADO' USING ERRCODE = '42501'; END IF;
  SELECT c.id, c.loja_id INTO v_caixa FROM public.caixas c
   WHERE c.status = 'ABERTO' AND internal.fp_operador_ativo_caixa(c.id, c.operador_id) = v_uid
   ORDER BY c.data_abertura DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM internal.fp_garantir_linha_responsavel(v_caixa.id);
  UPDATE public.caixa_operadores SET bloqueado_em = now()
   WHERE caixa_id = v_caixa.id AND usuario_id = v_uid AND fim IS NULL AND bloqueado_em IS NULL;
  PERFORM internal.fp_evento_operador(v_caixa.loja_id, v_uid,
    CASE WHEN upper(coalesce(p_motivo, '')) = 'INATIVIDADE' THEN 'BLOQUEIO_AUTO' ELSE 'SAIU' END,
    jsonb_build_object('caixa_id', v_caixa.id, 'bloqueio', true, 'motivo', upper(coalesce(p_motivo, 'INATIVIDADE'))));
  RETURN v_caixa.id;
END $$;

-- Desbloqueio: SÓ service_role, chamado pelo servidor Next DEPOIS de conferir o PIN do usuário da sessão
-- (o ator vem do JWT validado no servidor, como em pdv_pin_loja_gerida).
CREATE OR REPLACE FUNCTION public.desbloquear_caixa_operador(p_usuario uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_linha record;
BEGIN
  UPDATE public.caixa_operadores co SET bloqueado_em = NULL
    FROM public.caixas c
   WHERE co.usuario_id = p_usuario AND co.fim IS NULL AND co.bloqueado_em IS NOT NULL
     AND c.id = co.caixa_id AND c.status = 'ABERTO'
  RETURNING co.caixa_id, co.loja_id INTO v_linha;
  IF v_linha.caixa_id IS NULL THEN RETURN NULL; END IF;
  PERFORM internal.fp_evento_operador(v_linha.loja_id, p_usuario, 'ENTROU',
    jsonb_build_object('caixa_id', v_linha.caixa_id, 'desbloqueio', true));
  RETURN v_linha.caixa_id;
END $$;

-- Tudo que a tela do caixa precisa saber sobre a troca, numa leitura (escopo: auth.uid()).
CREATE OR REPLACE FUNCTION public.pdv_troca_contexto()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH eu AS (SELECT auth.uid() AS uid),
  abertos AS (
    SELECT c.id, c.loja_id, c.operador_id AS responsavel, c.data_abertura,
           internal.fp_operador_ativo_caixa(c.id, c.operador_id) AS operador_permitido,
           (SELECT co.usuario_id FROM public.caixa_operadores co WHERE co.caixa_id = c.id AND co.fim IS NULL) AS ativo,
           (SELECT co.bloqueado_em FROM public.caixa_operadores co WHERE co.caixa_id = c.id AND co.fim IS NULL) AS bloqueado_em,
           EXISTS (SELECT 1 FROM public.caixa_operadores co WHERE co.caixa_id = c.id) AS trocado
      FROM public.caixas c, eu
     WHERE c.status = 'ABERTO' AND eu.uid IS NOT NULL
       AND public.fp_usuario_pode_loja(eu.uid, c.loja_id, ARRAY['DONO', 'GERENTE', 'OPERADOR'])
  )
  SELECT jsonb_build_object(
    'operando', (SELECT jsonb_build_object('caixa_id', a.id, 'responsavel_id', a.responsavel,
                        'responsavel_nome', (SELECT nome FROM public.usuarios WHERE id = a.responsavel))
                   FROM abertos a, eu WHERE a.operador_permitido = eu.uid LIMIT 1),
    'bloqueado', (SELECT jsonb_build_object('caixa_id', a.id, 'bloqueado_em', a.bloqueado_em)
                    FROM abertos a, eu WHERE a.ativo = eu.uid AND a.bloqueado_em IS NOT NULL LIMIT 1),
    'proprio_em_uso', (SELECT jsonb_build_object('caixa_id', a.id, 'operador_id', a.ativo,
                             'operador_nome', (SELECT nome FROM public.usuarios WHERE id = a.ativo),
                             'liberado', a.ativo IS NULL, 'bloqueado', a.bloqueado_em IS NOT NULL)
                         FROM abertos a, eu
                        WHERE a.responsavel = eu.uid AND a.operador_permitido IS DISTINCT FROM eu.uid
                          AND a.ativo IS DISTINCT FROM eu.uid LIMIT 1),
    'liberados', coalesce((SELECT jsonb_agg(jsonb_build_object('caixa_id', a.id, 'responsavel_id', a.responsavel,
                                  'responsavel_nome', (SELECT nome FROM public.usuarios WHERE id = a.responsavel),
                                  'data_abertura', a.data_abertura) ORDER BY a.data_abertura)
                             FROM abertos a WHERE a.trocado AND a.ativo IS NULL), '[]'::jsonb)
  );
$$;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.liberar_caixa_operador(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.liberar_caixa_operador(uuid) TO authenticated, service_role;
  REVOKE ALL ON FUNCTION public.assumir_caixa_operador(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.assumir_caixa_operador(uuid) TO authenticated, service_role;
  REVOKE ALL ON FUNCTION public.bloquear_caixa_operador(text) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.bloquear_caixa_operador(text) TO authenticated, service_role;
  REVOKE ALL ON FUNCTION public.desbloquear_caixa_operador(uuid) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.desbloquear_caixa_operador(uuid) TO service_role;
  REVOKE ALL ON FUNCTION public.pdv_troca_contexto() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.pdv_troca_contexto() TO authenticated, service_role;
END $$;
COMMENT ON FUNCTION public.liberar_caixa_operador(uuid) IS
  'Multiempresa revisado (20261023200000): escopo por fp_usuario_pode_loja(auth.uid(), loja do caixa).';
COMMENT ON FUNCTION public.assumir_caixa_operador(uuid) IS
  'Multiempresa revisado (20261023200000): escopo por fp_usuario_pode_loja(auth.uid(), loja do caixa, papéis do PDV).';
COMMENT ON FUNCTION public.bloquear_caixa_operador(text) IS
  'Multiempresa revisado (20261023200000): só o caixa em que auth.uid() é o operador ativo.';
COMMENT ON FUNCTION public.pdv_troca_contexto() IS
  'Multiempresa revisado (20261023200000): caixas abertos das lojas de auth.uid() (fp_usuario_pode_loja).';

-- ─── fechamento ───────────────────────────────────────────────────────────────────────────────────
-- Só o operador ativo (ou DONO/GERENTE da loja) fecha um caixa que já teve troca; fechar encerra a linha
-- ativa. Sem JWT (service_role / PDV desktop) não há restrição nova.
CREATE OR REPLACE FUNCTION internal.trg_caixas_fechamento_operador()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NEW.status = 'FECHADO' AND OLD.status = 'ABERTO'
     AND EXISTS (SELECT 1 FROM public.caixa_operadores co WHERE co.caixa_id = NEW.id) THEN
    IF v_uid IS NOT NULL
       AND internal.fp_operador_ativo_caixa(NEW.id, OLD.operador_id) IS DISTINCT FROM v_uid
       AND NOT public.fp_usuario_pode_loja(v_uid, NEW.loja_id, ARRAY['DONO', 'GERENTE']) THEN
      RAISE EXCEPTION 'FECHAR_CAIXA_EM_USO_OUTRO_OPERADOR';
    END IF;
    UPDATE public.caixa_operadores SET fim = greatest(now(), inicio), motivo_fim = 'FECHAMENTO'
     WHERE caixa_id = NEW.id AND fim IS NULL;
    PERFORM internal.fp_evento_operador(NEW.loja_id, coalesce(v_uid, OLD.operador_id), 'SAIU',
      jsonb_build_object('caixa_id', NEW.id, 'motivo', 'FECHAMENTO', 'responsavel', OLD.operador_id));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION internal.trg_caixas_fechamento_operador() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_caixas_fechamento_operador ON public.caixas;
CREATE TRIGGER trg_caixas_fechamento_operador
  AFTER UPDATE OF status ON public.caixas
  FOR EACH ROW EXECUTE FUNCTION internal.trg_caixas_fechamento_operador();

-- ─── regra única nas RPCs existentes (troca de texto verificada) ───────────────────────────────────
CREATE OR REPLACE FUNCTION internal.fp_troca_operador_patch(p_nome text, p_de text, p_para text, p_obrigatorio boolean)
RETURNS integer LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE r record; v_def text; v_n integer := 0;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE p.proname = p_nome AND n.nspname IN ('public', 'internal') AND p.prokind = 'f'
              AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position(p_para IN v_def) > 0 AND (position(p_de IN p_para) > 0 OR position(p_de IN v_def) = 0) THEN
      v_n := v_n + 1; -- já aplicado (reexecução idempotente)
    ELSIF position(p_de IN v_def) > 0 THEN
      EXECUTE replace(v_def, p_de, p_para);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  IF v_n = 0 AND p_obrigatorio THEN
    RAISE EXCEPTION 'TROCA_OPERADOR_PATCH_AUSENTE: % (trecho "%")', p_nome, p_de;
  END IF;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION internal.fp_troca_operador_patch(text, text, text, boolean) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM internal.fp_troca_operador_patch('finalizar_venda_transacional_canonica_v4',
    'IF v_caixa_operador_id IS DISTINCT FROM v_uid THEN',
    'IF internal.fp_operador_ativo_caixa(p_caixa_id, v_caixa_operador_id) IS DISTINCT FROM v_uid THEN', true);
  PERFORM internal.fp_troca_operador_patch('registrar_movimentacao',
    'c.operador_id = v_uid', 'internal.fp_operador_ativo_caixa(c.id, c.operador_id) = v_uid', true);
  PERFORM internal.fp_troca_operador_patch('estornar_movimentacao',
    'OR c.operador_id = v_uid', 'OR internal.fp_operador_ativo_caixa(c.id, c.operador_id) = v_uid', false);
  PERFORM internal.fp_troca_operador_patch('obter_status_caixa_operador',
    'WHERE c.operador_id = v_uid AND c.status = ''ABERTO''',
    'WHERE internal.fp_operador_ativo_caixa(c.id, c.operador_id) = v_uid AND c.status = ''ABERTO''', true);
  -- Fechamento: quem fecha é o operador ativo (conta a gaveta); o responsável segue em caixas.operador_id.
  PERFORM internal.fp_troca_operador_patch('fechar_caixa_atomico',
    'WHERE c.operador_id = p_operador_id AND c.status = ''ABERTO''',
    'WHERE internal.fp_operador_ativo_caixa(c.id, c.operador_id) = p_operador_id AND c.status = ''ABERTO''', true);
  PERFORM internal.fp_troca_operador_patch('fechar_caixa_atomico',
    'WHERE c.operador_id = p_operador_id AND c.status = ''FECHADO''',
    'WHERE (c.operador_id = p_operador_id OR internal.fp_participou_caixa(c.id, p_operador_id)) AND c.status = ''FECHADO''', false);
  -- Devolução com desembolso: o caixa pagador é o que o usuário opera agora.
  PERFORM internal.fp_troca_operador_patch('resolver_caixa_pagador',
    'c.operador_id = p_uid', 'internal.fp_operador_ativo_caixa(c.id, c.operador_id) = p_uid', true);
  -- Leituras do turno (valor do sistema, formas no fechamento): participante também lê.
  PERFORM internal.fp_troca_operador_patch('calcular_valor_sistema_dinheiro_caixa',
    'c.operador_id = auth.uid() OR', '(c.operador_id = auth.uid() OR internal.fp_participou_caixa(c.id, auth.uid())) OR', true);
  PERFORM internal.fp_troca_operador_patch('calcular_valor_sistema_por_forma_caixa',
    'c.operador_id = auth.uid() OR', '(c.operador_id = auth.uid() OR internal.fp_participou_caixa(c.id, auth.uid())) OR', true);
  PERFORM internal.fp_troca_operador_patch('listar_caixas_fechamento_formas',
    'c.operador_id = auth.uid() OR', '(c.operador_id = auth.uid() OR internal.fp_participou_caixa(c.id, auth.uid())) OR', false);
END $$;

-- RLS de leitura: policies PERMISSIVE adicionais (somam às de hoje; tenant_guard RESTRICTIVE continua valendo).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('caixas', 'public.fp_participa_caixa(id)'),
      ('movimentacoes_caixa', 'public.fp_participa_caixa(caixa_id)'),
      ('vendas', 'public.fp_participa_caixa(caixa_id)'),
      ('caixas_fechamento_formas', 'public.fp_participa_caixa(caixa_id)'),
      ('vendas_pagamentos', 'EXISTS (SELECT 1 FROM public.vendas v WHERE v.id = vendas_pagamentos.venda_id AND public.fp_participa_caixa(v.caixa_id))')
    ) AS t(tabela, expr) LOOP
    IF to_regclass('public.' || r.tabela) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tabela || '_select_turno_operador', r.tabela);
      EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO authenticated USING (%s)',
                     r.tabela || '_select_turno_operador', r.tabela, r.expr);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
