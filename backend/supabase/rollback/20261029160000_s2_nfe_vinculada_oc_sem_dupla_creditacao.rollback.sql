-- Rollback S2 (20261029160000): volta o crédito integral da NF-e vinculada à OC (comportamento anterior).
-- Não toca dados: NF-es já confirmadas mantêm seus movimentos.
BEGIN;

DO $rb$
DECLARE
  r record;
  v_def text;
  v_n int;
BEGIN
  v_def := pg_get_functiondef('internal.confirmar_importacao_nfe(uuid)'::regprocedure);

  FOR r IN
    SELECT * FROM (VALUES
      ($b$  v_credito numeric;
  v_recebido_fisico numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH';$b$,
       $a$BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH';$a$),
      ($b$    v_credito := v_it.quantidade_conferida;
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
$b$,
       $a$    IF v_remessa IS NULL AND v_it.quantidade_conferida IS NOT NULL AND v_it.quantidade_conferida > 0 THEN
$a$),
      ($b$VALUES (v_it.produto_id, v_imp.loja_id, v_credito, 0, 1)$b$,
       $a$VALUES (v_it.produto_id, v_imp.loja_id, v_it.quantidade_conferida, 0, 1)$a$),
      ($b$'ENTRADA_NFE', v_credito, v_uid, v_obs$b$,
       $a$'ENTRADA_NFE', v_it.quantidade_conferida, v_uid, v_obs$a$),
      ($b$v_it.produto_id, v_credito, v_it.quantidade_nfe, v_mov, NULL, false$b$,
       $a$v_it.produto_id, v_it.quantidade_conferida, v_it.quantidade_nfe, v_mov, NULL, false$a$)
    ) AS t(novo, antigo)
  LOOP
    v_n := (length(v_def) - length(replace(v_def, r.novo, ''))) / length(r.novo);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'S2 ROLLBACK: trecho encontrado % vezes (esperado 1): %', v_n, left(r.novo, 60);
    END IF;
    v_def := replace(v_def, r.novo, r.antigo);
  END LOOP;

  EXECUTE v_def;
END
$rb$;

NOTIFY pgrst, 'reload schema';
COMMIT;
