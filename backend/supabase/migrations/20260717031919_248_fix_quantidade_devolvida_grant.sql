-- Grants de `quantidade_devolvida_item_venda`, criada pela
-- `248_devolver_ou_trocar_venda.sql`.
--
-- ⚠️ CORREÇÃO 2026-08-07 — INVERSÃO DE ORDEM (bloqueador de reconstrução limpa).
--
-- A ordenação das migrations é lexicográfica pelo nome do arquivo, e
-- '20260717031919_...' < '248_...' (no 2º caractere, '0' < '4'). Este arquivo
-- roda ANTES da migration que cria a função, e REVOKE/GRANT não aceitam
-- `IF EXISTS`. Em produção passou porque lá a função já existia; num banco
-- reconstruído do zero, aborta com SQLSTATE 42883.
--
-- Mesma família da 20260717031639 e do defeito já corrigido na 282. O estado
-- final de grants é reafirmado pela migration 314, que roda depois da 248 em
-- qualquer ordenação.
DO $fix_quantidade_devolvida_grant$
BEGIN
  IF to_regprocedure('public.quantidade_devolvida_item_venda(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.quantidade_devolvida_item_venda(uuid) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.quantidade_devolvida_item_venda(uuid) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.quantidade_devolvida_item_venda(uuid) TO service_role';
  ELSE
    RAISE NOTICE
      '248_fix_quantidade_devolvida_grant — função ainda não existe nesta posição '
      'da reconstrução; grants reaplicados pela migration 314.';
  END IF;
END
$fix_quantidade_devolvida_grant$;
