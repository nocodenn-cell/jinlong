-- PR-2D / C3 — passo 4: a conciliação da devolução vira invariante do BANCO.
--
-- D-13: valor_estornado = valor devolvido em meio de pagamento + valor_abatido_ar (abatimento do saldo a receber).
-- O dinheiro que efetivamente saiu do caixa (valor_caixa_estornado) é parte do meio de pagamento; portanto
--     valor_abatido_ar + valor_caixa_estornado <= valor_estornado
-- vale para toda operação (legado: valor_abatido_ar = 0 e valor_caixa_estornado <= valor_estornado).
-- Nenhum caminho (nem futuro) consegue gravar uma operação que "devolva" mais que o valor estornado.
--
-- Preflight fail-closed: se alguma linha existente violar, a migration aborta com mensagem (em produção: 0 violações
-- em 2026-09-30, 1 operação). Rollback: backend/supabase/rollback/20261001100200_pr2d_devolucao_caixa_desembolso.rollback.sql.

DO $preflight_pr2d_check$
DECLARE v_viol integer;
BEGIN
  SELECT count(*) INTO v_viol
    FROM public.venda_pos_venda_operacoes o
   WHERE o.valor_abatido_ar + o.valor_caixa_estornado > o.valor_estornado + 0.005;
  IF v_viol > 0 THEN
    RAISE EXCEPTION 'PR2D_CHECK_PREFLIGHT: % operação(ões) violam valor_abatido_ar + valor_caixa_estornado <= valor_estornado', v_viol;
  END IF;
END
$preflight_pr2d_check$;

ALTER TABLE public.venda_pos_venda_operacoes
  ADD CONSTRAINT venda_pos_venda_operacoes_conciliacao_chk
  CHECK (valor_abatido_ar + valor_caixa_estornado <= valor_estornado + 0.005);

COMMENT ON CONSTRAINT venda_pos_venda_operacoes_conciliacao_chk ON public.venda_pos_venda_operacoes IS
  'D-13: abatimento de AR + dinheiro que saiu do caixa nunca excedem o valor estornado da operação.';
