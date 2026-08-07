-- Migration 310 — Reaplica a 288 (certificação operacional do PDV), que consta
-- como aplicada no ledger mas nunca foi executada em produção.
--
-- EVIDÊNCIA (produção, 2026-08-06):
--   supabase_migrations.schema_migrations contém version='288' — e a linha já
--   está no backup pré-repair `_backup_schema_migrations_20260802`, ou seja, a
--   marcação é anterior ao repair de 2026-08-02. Ainda assim, NENHUM efeito da
--   288 existe no banco:
--     - public.converter_venda_em_espera(uuid)  → ausente (pg_proc)
--     - uq_caixas_operador_aberto               → ausente (pg_indexes)
--     - retomar_venda_em_espera                 → ainda a versão da 24703
--       (pg_get_functiondef ainda contém 'RETOMADA'; sem COMMENT da 288)
--
-- IMPACTO — este é o único dos achados de ledger com falha visível ao operador:
--
--   (A) `caixaVendaEspera.impl.ts:186` chama
--       `supabase.rpc('converter_venda_em_espera', { p_id: id })`. Como a função
--       não existe, o PostgREST responde PGRST202 e o erro chega à tela depois
--       de a venda já ter sido finalizada.
--
--   (B) `retomar_venda_em_espera` na versão antiga grava status='RETOMADA' no
--       ato da retomada, e `listar_vendas_em_espera` filtra status='EM_ESPERA'.
--       Retomar o cupom errado e desistir apaga o pedido do cliente.
--
--   (C) Sem `uq_caixas_operador_aberto`, o check-then-insert de
--       `createCashSessionWriter.open()` permite dois turnos ABERTO para o mesmo
--       operador; o mais antigo fica invisível a
--       `obter_status_caixa_operador`/`fechar_caixa_atomico` (ORDER BY
--       data_abertura DESC LIMIT 1) e retém o fundo de troco.
--
-- PRÉ-CONDIÇÃO VERIFICADA: a guarda (A) da 288 aborta se houver operador com
-- mais de um caixa ABERTO. Consulta em produção antes desta migration retornou
-- nenhum duplicado, então o índice único é criável sem intervenção de dados.
-- A guarda é reexecutada aqui mesmo assim — se o estado mudar entre o
-- diagnóstico e a aplicação, esta migration falha em vez de corromper.
--
-- Não toca o núcleo transacional de venda (finalizar_venda_*, estoque,
-- pagamentos). Conteúdo equivalente ao da 288, reescrito para ser idempotente
-- sobre a reconstrução limpa (onde a 288 roda antes desta).

-- ═══════════════════════════════════════════════════════════════════════════════
-- (A) Um único caixa ABERTO por operador
-- ═══════════════════════════════════════════════════════════════════════════════
DO $guarda_caixas_310$
DECLARE
  v_dups text;
BEGIN
  SELECT string_agg(d.operador_id::text, ', ')
  INTO v_dups
  FROM (
    SELECT operador_id
    FROM public.caixas
    WHERE status = 'ABERTO'
    GROUP BY operador_id
    HAVING count(*) > 1
  ) d;

  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION
      'MIGRATION_310_CAIXAS_ABERTOS_DUPLICADOS: %. Feche ou reconcilie os turnos antigos antes de aplicar esta migration.',
      v_dups;
  END IF;
END;
$guarda_caixas_310$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_caixas_operador_aberto
  ON public.caixas (operador_id)
  WHERE status = 'ABERTO';

COMMENT ON INDEX public.uq_caixas_operador_aberto IS
  'Um único caixa ABERTO por operador. Sem isso o INSERT de abertura (check-then-insert '
  'na aplicação) permite dois turnos simultâneos e o mais antigo fica órfão, já que status '
  'e fechamento só enxergam o mais recente (ORDER BY data_abertura DESC LIMIT 1).';

-- ═══════════════════════════════════════════════════════════════════════════════
-- (B) Venda em espera: retomar não consome; concluir consome
-- ═══════════════════════════════════════════════════════════════════════════════

-- Mesma assinatura e mesmo retorno da versão anterior (24703). Única mudança:
-- não transiciona mais o status. O FOR UPDATE e a checagem de dono permanecem.
CREATE OR REPLACE FUNCTION public.retomar_venda_em_espera(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.vendas_em_espera%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.vendas_em_espera
  WHERE id = p_id AND status = 'EM_ESPERA'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.operador_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  -- Só marca o toque; o pedido continua EM_ESPERA e visível na lista até que a
  -- venda seja de fato finalizada (converter_venda_em_espera) ou descartada.
  UPDATE public.vendas_em_espera
  SET atualizada_em = now()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'numero_local', v_row.numero_local,
    'rotulo', v_row.rotulo,
    'itens', v_row.itens,
    'totais', v_row.totais,
    'cliente_id', v_row.cliente_id,
    'desconto_gerente_percentual', v_row.desconto_gerente_percentual,
    'desconto_gerente_token', v_row.desconto_gerente_token
  );
END;
$$;

COMMENT ON FUNCTION public.retomar_venda_em_espera(uuid) IS
  'Retoma um pedido em espera SEM consumi-lo (migration 288, reaplicada pela 310). '
  'O pedido continua EM_ESPERA até converter_venda_em_espera ou '
  'descartar_venda_em_espera, para que desistir da retomada não apague o cupom.';

-- Estado terminal de sucesso, já previsto no CHECK da tabela desde a 24703.
-- Idempotente: chamar de novo sobre um pedido já convertido não é erro (o PDV
-- pode reenviar após timeout/reload, o mesmo cenário do P0 de venda duplicada).
CREATE OR REPLACE FUNCTION public.converter_venda_em_espera(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.vendas_em_espera%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.vendas_em_espera
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'venda_em_espera_nao_encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.operador_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  IF v_row.status = 'CONVERTIDA' THEN
    RETURN jsonb_build_object('id', p_id, 'status', 'CONVERTIDA');
  END IF;

  UPDATE public.vendas_em_espera
  SET status = 'CONVERTIDA', atualizada_em = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'status', 'CONVERTIDA');
END;
$$;

COMMENT ON FUNCTION public.converter_venda_em_espera(uuid) IS
  'Marca o pedido em espera como CONVERTIDA após a venda ser finalizada de fato '
  '(migration 288, reaplicada pela 310). Idempotente para tolerar reenvio do PDV.';

REVOKE ALL ON FUNCTION public.converter_venda_em_espera(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.converter_venda_em_espera(uuid) TO authenticated;

-- Pedidos legados presos em 'RETOMADA' NÃO são revividos aqui, mesmo motivo da
-- 288: são carrinhos antigos, com preços de outra data e `numero_local` que
-- colidiria com os pedidos em espera atuais.

-- ═══════════════════════════════════════════════════════════════════════════════
-- Prova viva
-- ═══════════════════════════════════════════════════════════════════════════════
DO $verify_310$
DECLARE
  v_idx      int;
  v_conv     int;
  v_retoma   text;
BEGIN
  SELECT count(*) INTO v_idx FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'uq_caixas_operador_aberto';
  IF v_idx <> 1 THEN
    RAISE EXCEPTION 'MIGRATION_310: uq_caixas_operador_aberto não criado';
  END IF;

  -- Resolução por assinatura de tipos. `pg_get_function_identity_arguments`
  -- NÃO serve aqui: devolve 'p_id uuid', com o nome do parâmetro.
  IF to_regprocedure('public.converter_venda_em_espera(uuid)') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_310: converter_venda_em_espera(uuid) não criada';
  END IF;

  SELECT count(*) INTO v_conv
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'converter_venda_em_espera';
  IF v_conv <> 1 THEN
    RAISE EXCEPTION 'MIGRATION_310: esperada 1 assinatura de converter_venda_em_espera, encontradas %', v_conv;
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.converter_venda_em_espera(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION_310: authenticated sem EXECUTE em converter_venda_em_espera';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_retoma
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'retomar_venda_em_espera';
  IF v_retoma ILIKE '%RETOMADA%' THEN
    RAISE EXCEPTION 'MIGRATION_310: retomar_venda_em_espera ainda consome o pedido (status RETOMADA)';
  END IF;
END;
$verify_310$;

NOTIFY pgrst, 'reload schema';
