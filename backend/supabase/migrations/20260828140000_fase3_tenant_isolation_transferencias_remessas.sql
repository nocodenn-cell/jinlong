-- Fase 3 do plano de remediação Jīn Lóng — tenant isolation.
--
-- ACHADO (confirmado ao vivo em produção, leitura de pg_get_functiondef,
-- antes de escrever esta migration): `transferir_estoque_seguro`,
-- `transferir_estoque_entre_lojas` e `confirmar_remessa_entrada` checam
-- perfil (GERENTE/DONO/ADMIN) mas NUNCA checam se a loja do operador tem
-- relação com a loja envolvida na operação. Qualquer GERENTE — de qualquer
-- loja — pode transferir estoque entre duas lojas que não são a sua, ou
-- confirmar remessa de entrada de uma loja que não é a sua.
--
-- Hoje D0 opera com 1 loja em produção, então o caminho não é observável na
-- prática — mas é a mesma classe de lacuna já corrigida para
-- `descontos_venda` (migration 20260811110000_descontos_venda_rls_loja_scope.sql,
-- achada durante a preparação do piloto Jinlong, PR #317), e essa correção
-- é o fundamento certo antes de a segunda loja existir de verdade.
--
-- REGRA APLICADA — mesmo padrão já em produção (comissões, contas_pagar,
-- descontos_venda): "DONO/ADMIN veem/operam todas as lojas; GERENTE só a
-- própria." Para transferência, GERENTE precisa pertencer à loja de origem
-- OU à loja de destino (participa da operação em algum lado); para remessa,
-- GERENTE precisa pertencer à loja da própria remessa.
--
-- ESCOPO — só a checagem de autorização é adicionada. Nenhuma outra lógica de
-- negócio (lock determinístico, idempotência, cálculo de saldo, kardex) é
-- tocada. Assinaturas de função inalteradas — GRANTs preexistentes (EXECUTE
-- authenticated/service_role) permanecem intactos após o CREATE OR REPLACE.
--
-- ROLLBACK — reaplicar os corpos anteriores (capturados nesta migration como
-- comentário de referência não seria prático; usar `git show <commit>^:...`
-- desta migration para recuperar o CREATE OR REPLACE anterior caso precise
-- reverter em produção).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- transferir_estoque_seguro — GERENTE restrito a lojas em que atua
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.transferir_estoque_seguro(
  p_loja_origem uuid,
  p_loja_destino uuid,
  p_produto_id uuid,
  p_quantidade numeric,
  p_observacao text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text,
  p_saldo_esperado numeric DEFAULT NULL::numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
  v_qtd_atual numeric;
  v_limite_obs numeric;
  v_transferencia_id uuid;
  v_dummy numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'TRANSFERENCIA_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u
   WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'TRANSFERENCIA_PERFIL';
  END IF;

  -- Fase 3 do plano de remediação: GERENTE só transfere estoque envolvendo a
  -- própria loja (origem OU destino). DONO/ADMIN sem restrição — mesmo padrão
  -- já em produção (20260811110000_descontos_venda_rls_loja_scope.sql).
  IF v_perfil = 'GERENTE' AND v_loja_usuario NOT IN (p_loja_origem, p_loja_destino) THEN
    RAISE EXCEPTION 'TRANSFERENCIA_LOJA_INVALIDA';
  END IF;

  IF p_loja_origem = p_loja_destino THEN
    RAISE EXCEPTION 'TRANSFERENCIA_LOJA_IGUAL';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'TRANSFERENCIA_QTD';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'TRANSFERENCIA_IDEMPOTENCIA_AUSENTE';
  END IF;

  SELECT ti.transferencia_id
    INTO v_transferencia_id
    FROM public.transferencias_idempotencia ti
   WHERE ti.usuario_id = v_uid
     AND ti.idempotency_key = btrim(p_idempotency_key)
   LIMIT 1;
  IF FOUND THEN
    RETURN v_transferencia_id;
  END IF;

  -- Lock deterministico para reduzir risco de deadlock entre concorrencias cruzadas.
  IF p_loja_origem::text < p_loja_destino::text THEN
    SELECT COALESCE(e.quantidade_atual, 0) INTO v_dummy
      FROM public.estoque e
     WHERE e.loja_id = p_loja_origem AND e.produto_id = p_produto_id
     FOR UPDATE;
    SELECT COALESCE(e.quantidade_atual, 0) INTO v_dummy
      FROM public.estoque e
     WHERE e.loja_id = p_loja_destino AND e.produto_id = p_produto_id
     FOR UPDATE;
  ELSE
    SELECT COALESCE(e.quantidade_atual, 0) INTO v_dummy
      FROM public.estoque e
     WHERE e.loja_id = p_loja_destino AND e.produto_id = p_produto_id
     FOR UPDATE;
    SELECT COALESCE(e.quantidade_atual, 0) INTO v_dummy
      FROM public.estoque e
     WHERE e.loja_id = p_loja_origem AND e.produto_id = p_produto_id
     FOR UPDATE;
  END IF;

  SELECT COALESCE(e.quantidade_atual, 0)
    INTO v_qtd_atual
    FROM public.estoque e
   WHERE e.loja_id = p_loja_origem
     AND e.produto_id = p_produto_id;

  IF p_saldo_esperado IS NOT NULL AND abs(v_qtd_atual - p_saldo_esperado) > 0.0001 THEN
    RAISE EXCEPTION 'TRANSFERENCIA_CONCORRENCIA: saldo mudou (atual=%, esperado=%).', v_qtd_atual, p_saldo_esperado;
  END IF;

  IF v_qtd_atual < p_quantidade THEN
    RAISE EXCEPTION 'TRANSFERENCIA_ESTOQUE_INSUFICIENTE: disponivel=%, solicitado=%.', v_qtd_atual, p_quantidade;
  END IF;

  SELECT COALESCE(p.limite_transferencia_sem_observacao, pc.limite_transferencia_obs, 50)
    INTO v_limite_obs
    FROM public.produtos p
    CROSS JOIN public.pdv_config pc
   WHERE p.id = p_produto_id
   LIMIT 1;

  IF p_quantidade > v_limite_obs AND (p_observacao IS NULL OR btrim(p_observacao) = '') THEN
    RAISE EXCEPTION 'TRANSFERENCIA_OBSERVACAO_OBRIGATORIA: limite=%.', v_limite_obs;
  END IF;

  UPDATE public.estoque e
     SET quantidade_atual = e.quantidade_atual - p_quantidade,
         version = e.version + 1,
         updated_at = now()
   WHERE e.loja_id = p_loja_origem
     AND e.produto_id = p_produto_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRANSFERENCIA_ESTOQUE_ORIGEM_AUSENTE';
  END IF;

  INSERT INTO public.movimentos_estoque_log (
    loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao
  ) VALUES (
    p_loja_origem,
    p_produto_id,
    'TRANSFERENCIA_SAIDA',
    -p_quantidade,
    NULL,
    v_uid,
    p_observacao
  )
  RETURNING id INTO v_transferencia_id;

  INSERT INTO public.estoque (loja_id, produto_id, quantidade_atual, estoque_minimo)
  VALUES (p_loja_destino, p_produto_id, p_quantidade, 0)
  ON CONFLICT (loja_id, produto_id) DO UPDATE
    SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
        version = public.estoque.version + 1,
        updated_at = now();

  INSERT INTO public.movimentos_estoque_log (
    loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao
  ) VALUES (
    p_loja_destino,
    p_produto_id,
    'TRANSFERENCIA_ENTRADA',
    p_quantidade,
    NULL,
    v_uid,
    p_observacao
  );

  INSERT INTO public.transferencias_idempotencia (
    usuario_id, idempotency_key, transferencia_id
  ) VALUES (
    v_uid, btrim(p_idempotency_key), v_transferencia_id
  )
  ON CONFLICT (usuario_id, idempotency_key)
  DO UPDATE SET transferencia_id = EXCLUDED.transferencia_id;

  RETURN v_transferencia_id;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- transferir_estoque_entre_lojas (legado) — mesma guarda
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.transferir_estoque_entre_lojas(
  p_loja_origem uuid,
  p_loja_destino uuid,
  p_produto_id uuid,
  p_quantidade numeric,
  p_observacao text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
  v_atual numeric;
  v_ver integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'TRANSFERENCIA_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u
   WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'TRANSFERENCIA_PERFIL';
  END IF;

  -- Fase 3 do plano de remediação — mesma guarda de transferir_estoque_seguro.
  IF v_perfil = 'GERENTE' AND v_loja_usuario NOT IN (p_loja_origem, p_loja_destino) THEN
    RAISE EXCEPTION 'TRANSFERENCIA_LOJA_INVALIDA';
  END IF;

  IF p_loja_origem = p_loja_destino THEN
    RAISE EXCEPTION 'TRANSFERENCIA_LOJA_IGUAL';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'TRANSFERENCIA_QTD';
  END IF;

  SELECT e.quantidade_atual, e.version INTO v_atual, v_ver
  FROM public.estoque e
  WHERE e.loja_id = p_loja_origem AND e.produto_id = p_produto_id
  FOR UPDATE;

  IF NOT FOUND OR v_atual < p_quantidade THEN
    RAISE EXCEPTION 'TRANSFERENCIA_ESTOQUE_INSUFICIENTE';
  END IF;

  UPDATE public.estoque e
  SET
    quantidade_atual = e.quantidade_atual - p_quantidade,
    version = e.version + 1,
    updated_at = now()
  WHERE e.loja_id = p_loja_origem
    AND e.produto_id = p_produto_id
    AND e.version = v_ver;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRANSFERENCIA_CONCORRENCIA';
  END IF;

  INSERT INTO public.movimentos_estoque_log (
    loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao
  ) VALUES (
    p_loja_origem,
    p_produto_id,
    'TRANSFERENCIA_SAIDA',
    -p_quantidade,
    NULL,
    v_uid,
    p_observacao
  );

  INSERT INTO public.estoque (loja_id, produto_id, quantidade_atual, estoque_minimo)
  VALUES (p_loja_destino, p_produto_id, p_quantidade, 0)
  ON CONFLICT (loja_id, produto_id) DO UPDATE
    SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
        version = public.estoque.version + 1,
        updated_at = now();

  INSERT INTO public.movimentos_estoque_log (
    loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao
  ) VALUES (
    p_loja_destino,
    p_produto_id,
    'TRANSFERENCIA_ENTRADA',
    p_quantidade,
    NULL,
    v_uid,
    p_observacao
  );
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- confirmar_remessa_entrada — GERENTE restrito à loja da própria remessa
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.confirmar_remessa_entrada(p_remessa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
  v_loja_remessa uuid;
  v_it record;
  v_qtd numeric;
  v_tipo text := 'ENTRADA_REMessa_LOJA';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'REMESSA_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u
   WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'REMESSA_PERFIL';
  END IF;

  SELECT rm0.loja_id INTO v_loja_remessa
    FROM public.remessas rm0
   WHERE rm0.id = p_remessa_id AND rm0.status = 'EM_CONFERENCIA';

  IF v_loja_remessa IS NULL THEN
    RAISE EXCEPTION 'REMESSA_STATUS_INVALIDO';
  END IF;

  -- Fase 3 do plano de remediação: GERENTE só confirma remessa da própria
  -- loja. DONO/ADMIN sem restrição — mesmo padrão de transferir_estoque_seguro.
  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_loja_remessa THEN
    RAISE EXCEPTION 'REMESSA_LOJA_INVALIDA';
  END IF;

  FOR v_it IN
    SELECT i.produto_id,
           COALESCE(i.quantidade_conferida, i.quantidade_esperada) AS qtd
    FROM public.remessa_itens i
    WHERE i.remessa_id = p_remessa_id
  LOOP
    v_qtd := v_it.qtd;
    IF v_qtd IS NULL OR v_qtd <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.estoque (loja_id, produto_id, quantidade_atual, estoque_minimo)
    SELECT rm.loja_id, v_it.produto_id, v_qtd, 0
    FROM public.remessas rm
    WHERE rm.id = p_remessa_id
    ON CONFLICT (loja_id, produto_id) DO UPDATE
      SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
          version = public.estoque.version + 1,
          updated_at = now();

    INSERT INTO public.movimentos_estoque_log (
      loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id
    )
    SELECT
      rm.loja_id,
      v_it.produto_id,
      v_tipo,
      v_qtd,
      p_remessa_id,
      v_uid
    FROM public.remessas rm
    WHERE rm.id = p_remessa_id;
  END LOOP;

  UPDATE public.remessas
  SET status = 'CONCLUIDA', finalized_at = now()
  WHERE id = p_remessa_id;
END;
$function$;

DO $verify$
BEGIN
  IF position('TRANSFERENCIA_LOJA_INVALIDA' IN pg_get_functiondef('public.transferir_estoque_seguro(uuid,uuid,uuid,numeric,text,text,numeric)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'FASE3_GUARDA_AUSENTE: transferir_estoque_seguro';
  END IF;
  IF position('TRANSFERENCIA_LOJA_INVALIDA' IN pg_get_functiondef('public.transferir_estoque_entre_lojas(uuid,uuid,uuid,numeric,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'FASE3_GUARDA_AUSENTE: transferir_estoque_entre_lojas';
  END IF;
  IF position('REMESSA_LOJA_INVALIDA' IN pg_get_functiondef('public.confirmar_remessa_entrada(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'FASE3_GUARDA_AUSENTE: confirmar_remessa_entrada';
  END IF;

  RAISE NOTICE 'FASE3 tenant isolation OK — guardas de loja presentes nas 3 RPCs';
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
