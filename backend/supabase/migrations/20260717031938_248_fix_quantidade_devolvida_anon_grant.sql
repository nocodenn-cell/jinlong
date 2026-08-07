-- Revoga `anon` de `quantidade_devolvida_item_venda`: os default privileges de
-- schema do Supabase re-concedem EXECUTE a anon na criação da função, e `anon` é
-- grantee direto — não é alcançado por revogar do pseudo-role PUBLIC.
--
-- ⚠️ CORREÇÃO 2026-08-07 — INVERSÃO DE ORDEM (bloqueador de reconstrução limpa).
-- Ver o cabeçalho de 20260717031919: '20260717031938_...' < '248_...', então este
-- arquivo roda antes da criação da função e o REVOKE aborta com 42883 num banco
-- reconstruído do zero. Estado final reafirmado pela migration 314.
DO $fix_quantidade_devolvida_anon_grant$
BEGIN
  IF to_regprocedure('public.quantidade_devolvida_item_venda(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.quantidade_devolvida_item_venda(uuid) FROM anon';
  ELSE
    RAISE NOTICE
      '248_fix_quantidade_devolvida_anon_grant — função ainda não existe nesta '
      'posição da reconstrução; revoke reaplicado pela migration 314.';
  END IF;
END
$fix_quantidade_devolvida_anon_grant$;
