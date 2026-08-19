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
--                 HINT: Could not choose a best candidate function.
--
--               É exatamente a chamada do caminho web
--               (`app/caixa/server/caixaFiscalEnqueueServer.ts`).
--
-- Ou seja: o caminho web funciona em produção e quebra no banco do repositório;
-- o caminho do sync quebra em produção e funciona no banco do repositório.
-- Nenhum ambiente executa os dois.
--
-- DANO ATÉ HOJE: ZERO, NOS DOIS CASOS — e por acidente, não por desenho.
--
--   - O caminho do sync nunca rodou com venda real: `venda_eventos` mostra
--     25 vendas `backfill` e 29 `web_caixa`, nenhuma vinda do sync offline.
--   - O caminho web está atrás de `AUTO_ENQUEUE_FISCAL_ON_SALE`, e o grupo
--     fiscal do checklist de implantação está declarado como `fiscal.stub`.
--
-- Os dois armam sozinhos: o primeiro no dia em que o `pdv-local` entrar em
-- operação, o segundo no dia em que o fiscal sair de stub.
--
-- A CORREÇÃO
--
-- Convergir os dois lados para UMA ÚNICA sobrecarga — a de 4 args, com
-- `p_loja_id DEFAULT NULL`. Ela atende os dois chamadores:
--
--   - 3 args por nome  → `p_loja_id` assume NULL, e a validação de loja é
--                        pulada, exatamente como hoje em produção;
--   - 4 args por nome  → valida que o caixa da venda pertence à loja do worker.
--
-- Manter as duas seria reproduzir a ambiguidade em produção. Por isso a de
-- 3 args é REMOVIDA, e não apenas complementada.
--
-- ORDEM DAS OPERAÇÕES: cria a de 4 args ANTES de remover a de 3, para que não
-- exista instante em que nenhuma sobrecarga responda.
--
-- Idempotente: `CREATE OR REPLACE` sobre a de 4 args, e `DROP` guardado por
-- `to_regprocedure` (que devolve NULL quando a assinatura não existe, em vez
-- de erro — `DROP FUNCTION IF EXISTS` exigiria a assinatura exata e falharia
-- de forma diferente em cada ambiente).
--
-- O corpo abaixo é o da `114`, sem alteração de comportamento.
-- ============================================================

-- 1. Garante a sobrecarga canônica de 4 argumentos.
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
  v_uid          uuid := auth.uid();
  v_tipo         text := upper(COALESCE(NULLIF(trim(p_tipo_doc), ''), 'NFC_E_STUB'));
  v_documento_id uuid;
  v_loja_venda   uuid;
BEGIN
  IF p_venda_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_OBRIGATORIA';
  END IF;

  IF v_tipo NOT IN ('NFC_E_STUB', 'NFCE', 'NFE') THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_TIPO_DOC_INVALIDO';
  END IF;

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

  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_AUTH';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM   public.vendas v
      WHERE  v.id = p_venda_id
        AND  (
               v.operador_id = v_uid
               OR EXISTS (
                 SELECT 1 FROM public.usuarios u
                 WHERE  u.id = v_uid
                   AND  u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
               )
             )
    ) THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_PERMISSAO';
    END IF;
  END IF;

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

  SELECT d.id INTO v_documento_id
  FROM   public.documentos_fiscais_pendentes d
  WHERE  d.venda_id = p_venda_id
    AND  d.tipo_doc = v_tipo
    AND  d.deleted_at IS NULL
  ORDER  BY d.created_at DESC
  LIMIT  1;

  IF v_documento_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_INSERT_FALHOU';
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
    RAISE NOTICE 'FASE1B: sobrecarga de 3 args ausente — nada a remover (estado de producao).';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid) IS
  'Enfileira documento fiscal. ASSINATURA UNICA (Fase 1B): a sobrecarga de 3 args foi removida '
  'porque coexistir com esta tornava a chamada de 3 argumentos por nome ambigua. '
  'p_loja_id (opcional): quando fornecido valida que a venda pertence a essa loja — usado pela '
  'Edge sync-outbox; omitido pelo caminho web, que preserva o comportamento historico.';
