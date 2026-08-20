-- ============================================================
-- Fase 1B — item 1B-1: `fiscal_enfileirar_documento_venda` com assinatura ÚNICA
--
-- O DEFEITO, MEDIDO NOS DOIS LADOS
--
-- Este é o caso mais claro do drift `113`/`114` documentado em
-- `AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md` §4. A função quebra em AMBOS os
-- ambientes, por motivos opostos:
--
--   PRODUÇÃO  — tem SÓ a sobrecarga de 3 args (medido em 2026-08-19).
--               A Edge `sync-outbox` chama com 4 (`p_loja_id`), e o PostgREST
--               devolve PGRST202. O erro NÃO falha o batch ("erro só em log",
--               cabeçalho do sync-outbox/index.ts): toda venda sincronizada do
--               `pdv-local` deixaria de enfileirar documento fiscal, em silêncio.
--
--   REPOSITÓRIO — tem AS DUAS sobrecargas. As migrations 062/066/069/090/099
--               criam a de 3 args; a `114` adiciona `p_loja_id DEFAULT NULL`,
--               o que em PostgreSQL cria uma sobrecarga NOVA em vez de
--               substituir a anterior. Com as duas presentes, a chamada de
--               3 args por nome fica AMBÍGUA. Verificado em banco local
--               reconstruído do repositório:
--
--                 ERROR: function public.fiscal_enfileirar_documento_venda(
--                   p_venda_id => unknown, p_tipo_doc => unknown,
--                   p_payload => jsonb) is not unique
--
--               É exatamente a chamada do caminho web
--               (`app/caixa/server/caixaFiscalEnqueueServer.ts`).
--
-- ⚠️ POR QUE O CORPO ABAIXO NÃO É O DA `114`
--
-- A primeira versão desta migration convergia para o corpo da `114`. ESTAVA
-- ERRADA, e teria causado REGRESSÃO SILENCIOSA nos dois ambientes. Comparando
-- os três corpos existentes:
--
--   | Recurso                                   | 099 (3 args) | PROD (3 args) | 114 (4 args) |
--   |-------------------------------------------|--------------|---------------|--------------|
--   | validação `p_loja_id` (cross-loja)        | não          | não           | SIM          |
--   | bloqueio de venda `SEM_NF`                | SIM          | não           | não          |
--   | permissão com escopo de loja              | SIM          | não           | não          |
--   | trilha `REENFILEIRADO` em                 |              |               |              |
--   |   `documentos_fiscais_eventos`            | SIM          | SIM           | **não**      |
--
-- Ou seja: a `114` nasceu de um corpo ANTERIOR ao da `090`/`099` e perdeu a
-- trilha de auditoria pelo caminho. Convergir para ela apagaria, de uma vez:
-- o evento `REENFILEIRADO` (que existe HOJE em produção), o bloqueio de
-- `SEM_NF` e o escopo de loja na checagem de permissão.
--
-- É o mesmo mecanismo da colisão `113`/`114`: cada lado evoluiu um corpo
-- diferente sob a mesma chave, e qualquer convergência ingênua descarta o
-- trabalho de um deles.
--
-- O corpo canônico abaixo é a UNIÃO: base da `099` (a mais completa) MAIS a
-- validação `p_loja_id` da `114`. Nenhum recurso é perdido; produção ganha
-- `SEM_NF` e escopo de loja, que já deveria ter.
--
-- DANO ATÉ HOJE: ZERO — e por acidente, não por desenho.
--
--   - O caminho do sync nunca rodou com venda real: `venda_eventos` mostra
--     25 vendas `backfill` e 29 `web_caixa`, nenhuma vinda do sync offline.
--   - O caminho web está atrás de `AUTO_ENQUEUE_FISCAL_ON_SALE`, e o grupo
--     fiscal do checklist de implantação está declarado como `fiscal.stub`.
--
-- Os dois armam sozinhos: o primeiro no dia em que o `pdv-local` entrar em
-- operação, o segundo no dia em que o fiscal sair de stub.
--
-- ORDEM DAS OPERAÇÕES: cria a de 4 args ANTES de remover a de 3, para que não
-- exista instante em que nenhuma sobrecarga responda.
--
-- Idempotente: `CREATE OR REPLACE` sobre a de 4 args, e `DROP` guardado por
-- `to_regprocedure` (que devolve NULL quando a assinatura não existe, em vez
-- de erro).
--
-- ROLLBACK: `backend/scripts/rollback/fiscal_enfileirar_documento_venda.pre-2026-08-19.sql`
-- (retrato do corpo de 3 args de produção, md5 954b441b291de316d2c36d42f6252307).
-- ============================================================

-- 1. Sobrecarga canônica de 4 argumentos — união de 099 + 114.
CREATE OR REPLACE FUNCTION public.fiscal_enfileirar_documento_venda(
  p_venda_id  uuid,
  p_tipo_doc  text    DEFAULT 'NFC_E_STUB',
  p_payload   jsonb   DEFAULT '{}'::jsonb,
  p_loja_id   uuid    DEFAULT NULL   -- se fornecido, valida que a venda pertence a esta loja
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_profiles TEXT[] := ARRAY['GERENTE', 'DONO', 'ADMIN'];
  v_uid            uuid := auth.uid();
  v_tipo           text := upper(COALESCE(NULLIF(trim(p_tipo_doc), ''), 'NFC_E_STUB'));
  v_documento_id   uuid;
  v_prev_status    text;
  v_new_status     text;
  v_tipo_venda     text;
  v_loja_venda     uuid;
BEGIN
  IF p_venda_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_OBRIGATORIA';
  END IF;

  IF v_tipo NOT IN ('NFC_E_STUB', 'NFCE', 'NFE') THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_TIPO_DOC_INVALIDO';
  END IF;

  -- (da 114) Validação cross-loja: obrigatória para chamadas via service_role,
  -- onde a Edge passa o LOJA_ID do seu ambiente.
  IF p_loja_id IS NOT NULL THEN
    SELECT cx.loja_id INTO v_loja_venda
    FROM   public.vendas v
    INNER  JOIN public.caixas cx ON cx.id = v.caixa_id
    WHERE  v.id = p_venda_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_NAO_ENCONTRADA';
    END IF;

    IF v_loja_venda IS DISTINCT FROM p_loja_id THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_LOJA_DIVERGENTE';
    END IF;
  END IF;

  -- (da 099) Permissão com escopo de loja para sessões authenticated.
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_AUTH';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.vendas v
      WHERE v.id = p_venda_id
        AND (
          v.operador_id = v_uid
          OR EXISTS (
            SELECT 1
            FROM public.usuarios u
            WHERE u.id = v_uid
              AND u.perfil = ANY(v_admin_profiles)
              AND (u.perfil IN ('DONO', 'ADMIN') OR u.loja_id = v.loja_id)
          )
        )
    ) THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_PERMISSAO';
    END IF;
  END IF;

  -- (da 099) Bloqueia NF para vendas marcadas como SEM_NF.
  SELECT v.tipo_venda INTO v_tipo_venda
  FROM public.vendas v
  WHERE v.id = p_venda_id
  LIMIT 1;

  IF v_tipo_venda IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_NAO_ENCONTRADA';
  END IF;

  IF v_tipo_venda = 'SEM_NF' THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_SEM_NF';
  END IF;

  SELECT d.status
  INTO   v_prev_status
  FROM   public.documentos_fiscais_pendentes d
  WHERE  d.venda_id = p_venda_id
    AND  d.tipo_doc = v_tipo
  ORDER  BY d.created_at DESC
  LIMIT  1;

  INSERT INTO public.documentos_fiscais_pendentes (
    venda_id, tipo_doc, status, payload
  )
  VALUES (
    p_venda_id, v_tipo, 'PENDENTE', COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (venda_id, tipo_doc) WHERE status <> 'CANCELADO'
  DO UPDATE SET
    payload = COALESCE(EXCLUDED.payload, public.documentos_fiscais_pendentes.payload),
    status = CASE
      WHEN public.documentos_fiscais_pendentes.status IN ('ERRO', 'CANCELADO') THEN 'PENDENTE'
      ELSE public.documentos_fiscais_pendentes.status
    END,
    proxima_tentativa_em = CASE
      WHEN public.documentos_fiscais_pendentes.status IN ('ERRO', 'CANCELADO') THEN now()
      ELSE public.documentos_fiscais_pendentes.proxima_tentativa_em
    END,
    updated_at = now();

  SELECT d.id, d.status
  INTO   v_documento_id, v_new_status
  FROM   public.documentos_fiscais_pendentes d
  WHERE  d.venda_id = p_venda_id
    AND  d.tipo_doc = v_tipo
    AND  d.status <> 'CANCELADO'
  ORDER  BY d.created_at DESC
  LIMIT  1;

  IF v_documento_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_INSERT_FALHOU';
  END IF;

  -- (da 090/099) Trilha de auditoria do reenfileiramento. AUSENTE na 114 —
  -- é o recurso que a convergência ingênua teria apagado de produção.
  IF v_prev_status IN ('ERRO', 'CANCELADO') AND v_new_status = 'PENDENTE' THEN
    INSERT INTO public.documentos_fiscais_eventos (
      documento_id,
      evento_tipo,
      status_antes,
      status_depois,
      actor_user_id,
      actor_role,
      origem_acao,
      payload
    )
    VALUES (
      v_documento_id,
      'REENFILEIRADO',
      v_prev_status,
      v_new_status,
      v_uid,
      current_setting('request.jwt.claim.role', true),
      'RPC_FISCAL_ENFILEIRAR_DOCUMENTO_VENDA',
      jsonb_build_object('venda_id', p_venda_id, 'tipo_doc', v_tipo)
    );
  END IF;

  RETURN v_documento_id;
END;
$$;

-- 2. Preserva a superfície de permissão da sobrecarga canônica.
--    `20260731201500_restringe_rpcs_fiscais_worker.sql` já restringiu estas RPCs
--    ao worker; o REVOKE de PUBLIC é reafirmado porque toda função nasce com
--    EXECUTE concedido a PUBLIC — inclusive após CREATE OR REPLACE de uma
--    assinatura que ainda não existia no ambiente.
REVOKE EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid)
  TO service_role, authenticated;

-- 3. Remove a sobrecarga legada de 3 args, se presente neste ambiente.
DO $$
BEGIN
  IF to_regprocedure('public.fiscal_enfileirar_documento_venda(uuid, text, jsonb)') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb)';
    RAISE NOTICE 'FASE1B: sobrecarga legada de 3 args removida — ambiguidade fechada.';
  ELSE
    RAISE NOTICE 'FASE1B: sobrecarga de 3 args ausente — nada a remover.';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid) IS
  'Enfileira documento fiscal. ASSINATURA UNICA (Fase 1B): a sobrecarga de 3 args foi removida '
  'porque coexistir com esta tornava a chamada de 3 argumentos por nome ambigua. '
  'Corpo = uniao da 099 (SEM_NF, permissao com escopo de loja, trilha REENFILEIRADO) com a '
  'validacao p_loja_id da 114. p_loja_id (opcional): quando fornecido valida que a venda '
  'pertence a essa loja — usado pela Edge sync-outbox; omitido pelo caminho web.';
