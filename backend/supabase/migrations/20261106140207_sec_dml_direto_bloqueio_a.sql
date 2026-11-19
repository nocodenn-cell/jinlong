-- SEC-DML-A (2026-11-06): contenção mínima de escrita direta por authenticated.
-- Revoga INSERT, UPDATE e DELETE de authenticated nas tabelas de venda e auditoria.
-- Fluxos legítimos (RPCs canônicas, Edge sync-outbox com service_role, triggers SECURITY DEFINER)
-- não dependem desses privilégios. A leitura por RLS (SELECT) e os demais privilégios não mudam.
-- Idempotente: REVOKE de privilégio inexistente não gera erro. Rollback: 20261106140207_sec_dml_direto_bloqueio_a.rollback.sql
-- NÃO altera sequences, funções, triggers ou policies. Hardening (TRIGGER, REFERENCES, MAINTAIN) fica para migration separada.

BEGIN;

REVOKE INSERT, UPDATE, DELETE ON public.vendas, public.itens_venda, public.vendas_pagamentos FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.venda_eventos, public.descontos_venda FROM authenticated;

-- Verificação: a migration falha (e reverte) se o efeito não for o esperado.
DO $verify$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendas','itens_venda','vendas_pagamentos','venda_eventos','descontos_venda'] LOOP
    IF has_table_privilege('authenticated', 'public.' || t, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || t, 'DELETE') THEN
      RAISE EXCEPTION 'SEC-DML-A: authenticated ainda tem escrita direta em %', t;
    END IF;
    IF NOT (has_table_privilege('service_role', 'public.' || t, 'INSERT')
        AND has_table_privilege('service_role', 'public.' || t, 'UPDATE')
        AND has_table_privilege('service_role', 'public.' || t, 'DELETE')) THEN
      RAISE EXCEPTION 'SEC-DML-A: service_role perdeu escrita em %', t;
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION 'SEC-DML-A: authenticated perdeu SELECT em %', t;
    END IF;
  END LOOP;
END
$verify$;

COMMIT;
