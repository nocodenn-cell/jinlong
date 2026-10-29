-- ============================================================================
-- S2 — NF-e vinculada à OC não credita de novo o que já foi recebido fisicamente (D12).
--
-- ANTES: internal.confirmar_importacao_nfe creditava o estoque com a quantidade
--   conferida da NF-e (sem remessa vinculada) e abatia o saldo da OC com a mesma
--   quantidade, sem olhar o recebimento físico já feito pela OC no item.
--   Reproduzido em homologação: OC com 3 recebidas, NF-e de 2 vinculada, +2 no estoque.
-- AGORA: crédito = max(0, conferida − recebido físico do item na OC). Recebido físico =
--   soma de ordens_compra_recebimentos com origem ORDEM_COMPRA ou REMESSA para o item.
--   O abate do saldo da OC usa o mesmo crédito. A obrigação financeira (AP) não muda.
--   Sem OC vinculada, ou sem recebimento físico do item, o comportamento é o anterior.
--
-- Substituições textuais exatas (cada uma com 1 ocorrência; falha ⇒ aborta a transação).
-- Rollback: backend/supabase/rollback/20261029160000_s2_..._rollback.sql
-- ============================================================================

BEGIN;

DO $s2$
DECLARE
  r record;
  v_def text;
  v_n int;
BEGIN
  v_def := pg_get_functiondef('internal.confirmar_importacao_nfe(uuid)'::regprocedure);

  FOR r IN
    SELECT * FROM (VALUES
      -- declarações (antes do BEGIN do corpo)
      ($a$BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH';$a$,
       $b$  v_credito numeric;
  v_recebido_fisico numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH';$b$),
      -- cálculo do crédito por item
      ($a$    IF v_remessa IS NULL AND v_it.quantidade_conferida IS NOT NULL AND v_it.quantidade_conferida > 0 THEN
$a$,
       $b$    v_credito := v_it.quantidade_conferida;
    IF v_remessa IS NULL AND v_imp.ordem_compra_id IS NOT NULL AND v_credito IS NOT NULL THEN
      -- S2 (D12): recebimento físico do item na OC não gera crédito de novo
      SELECT coalesce(sum(r.quantidade), 0) INTO v_recebido_fisico
        FROM public.ordens_compra_recebimentos r
        JOIN public.ordens_compra_itens oci ON oci.id = r.ordem_item_id
       WHERE r.ordem_id = v_imp.ordem_compra_id
         AND oci.produto_id = v_it.produto_id
         AND r.origem IN ('ORDEM_COMPRA', 'REMESSA');
      v_credito := greatest(0, v_credito - v_recebido_fisico);
    END IF;
    IF v_remessa IS NULL AND v_credito IS NOT NULL AND v_credito > 0 THEN
$b$),
      -- crédito de estoque usa o valor calculado
      ($a$VALUES (v_it.produto_id, v_imp.loja_id, v_it.quantidade_conferida, 0, 1)$a$,
       $b$VALUES (v_it.produto_id, v_imp.loja_id, v_credito, 0, 1)$b$),
      -- movimento de entrada usa o valor calculado
      ($a$'ENTRADA_NFE', v_it.quantidade_conferida, v_uid, v_obs$a$,
       $b$'ENTRADA_NFE', v_credito, v_uid, v_obs$b$),
      -- abate do saldo da OC usa o valor calculado
      ($a$v_it.produto_id, v_it.quantidade_conferida, v_it.quantidade_nfe, v_mov, NULL, false$a$,
       $b$v_it.produto_id, v_credito, v_it.quantidade_nfe, v_mov, NULL, false$b$)
    ) AS t(antigo, novo)
  LOOP
    v_n := (length(v_def) - length(replace(v_def, r.antigo, ''))) / length(r.antigo);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'S2: trecho encontrado % vezes (esperado 1): %', v_n, left(r.antigo, 60);
    END IF;
    v_def := replace(v_def, r.antigo, r.novo);
  END LOOP;

  EXECUTE v_def;
END
$s2$;

DO $prova$
BEGIN
  IF position('S2 (D12): recebimento físico do item na OC' IN pg_get_functiondef('internal.confirmar_importacao_nfe(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'S2 PROVA FAIL';
  END IF;
END
$prova$;

NOTIFY pgrst, 'reload schema';
COMMIT;
