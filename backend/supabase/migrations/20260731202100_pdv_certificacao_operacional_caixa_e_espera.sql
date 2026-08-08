-- Migration 288 — Certificação operacional do PDV.
--
-- Fecha dois riscos com evidência levantados na auditoria:
--
--  (A) P1 — Dois caixas ABERTO para o mesmo operador.
--      `createCashSessionWriter.open()` faz getStatus-e-depois-INSERT sem lock e
--      sem constraint. Com dois terminais/abas do mesmo login, ou com retry após
--      resposta lenta, nascem dois turnos ABERTO. Como `obter_status_caixa_operador`
--      e `fechar_caixa_atomico` usam `ORDER BY data_abertura DESC LIMIT 1`, o turno
--      mais antigo fica invisível e não fechável pelo PDV: retém o fundo de troco e
--      aparece como turno aberto fantasma até alguém corrigir no banco.
--
--  (B) P2 — Venda em espera retomada some da lista antes de virar venda.
--      `retomar_venda_em_espera` gravava status='RETOMADA' no ato da retomada e
--      `listar_vendas_em_espera` filtra status='EM_ESPERA'. Se o operador retoma o
--      cupom errado e desiste, o pedido desaparece e precisa ser re-digitado.
--      A tabela já prevê o estado terminal correto ('CONVERTIDA'), até aqui não usado.
--
-- Não toca o núcleo transacional de venda (finalizar_venda_*, estoque, pagamentos).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (A) Exclusividade de caixa ABERTO por operador
-- ═══════════════════════════════════════════════════════════════════════════════

-- Falha ruidosa e acionável se a base já tiver duplicados: criar o índice único
-- sobre dados sujos aborta com erro genérico do Postgres, sem dizer QUEM duplicou.
DO $$
DECLARE
  v_dups text;
BEGIN
  SELECT string_agg(format('operador_id=%s (%s caixas ABERTO)', operador_id, n), '; ')
  INTO v_dups
  FROM (
    SELECT operador_id, count(*) AS n
    FROM public.caixas
    WHERE status = 'ABERTO'
    GROUP BY operador_id
    HAVING count(*) > 1
  ) d;

  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION
      'MIGRATION_288_CAIXAS_ABERTOS_DUPLICADOS: %. Feche ou reconcilie os turnos antigos antes de aplicar esta migration.',
      v_dups;
  END IF;
END;
$$;

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

-- Mesma assinatura e mesmo retorno da versão anterior (migration 24703). Única
-- mudança: não transiciona mais o status. O FOR UPDATE e a checagem de dono
-- permanecem — continuam impedindo retomada dupla concorrente.
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
  'Retoma um pedido em espera SEM consumi-lo (migration 288). O pedido continua '
  'EM_ESPERA até converter_venda_em_espera ou descartar_venda_em_espera, para que '
  'desistir da retomada não apague o cupom do cliente.';

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
  '(migration 288). Idempotente para tolerar reenvio do PDV.';

REVOKE ALL ON FUNCTION public.converter_venda_em_espera(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.converter_venda_em_espera(uuid) TO authenticated;

-- `descartar_venda_em_espera` fica como está: com a retomada não consumindo mais
-- o pedido, ele continua EM_ESPERA e o descarte manual já o alcança.
--
-- Pedidos legados presos em 'RETOMADA' NÃO são revividos aqui de propósito: são
-- carrinhos antigos, com preços de outra data e `numero_local` que colidiria com
-- os pedidos em espera atuais. Limpeza desses resíduos é tarefa de dados, à parte.

NOTIFY pgrst, 'reload schema';

COMMIT;
