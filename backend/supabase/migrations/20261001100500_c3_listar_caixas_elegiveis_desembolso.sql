-- PR-2D / C3 — leitura da lista de caixas elegíveis para pagar uma devolução em dinheiro.
--
-- O modal de devolução precisa mostrar o conjunto que `internal.resolver_caixa_pagador` aceitará em `caixa_id`.
-- Antes a app lia `caixas` direto (loja da sessão + status ABERTO + RLS); agora o banco responde, com o mesmo
-- predicado do resolvedor:
--   elegível = ABERTO ∧ mesma loja de `usuarios.loja_id` do chamador ∧ (dono do caixa ∨ GERENTE/DONO/ADMIN).
--
-- Contrato: sem parâmetros; identidade = auth.uid() (nunca loja vinda do cliente). Sem sessão ou sem linha em
-- `usuarios` → conjunto vazio (a decisão final de elegibilidade continua sendo do resolvedor na devolução).
-- `operador_nome` = usuarios.nome do operador, com fallback para os 8 primeiros caracteres do id do caixa
-- (idêntico ao que a action TS fazia: `nome ?? id.slice(0, 8)`). A ordem (abertura ASC) é só de exibição.
--
-- Não altera internal.resolver_caixa_pagador, devolver_ou_trocar_venda, locks nem regras financeiras.
-- Rollback: backend/supabase/rollback/20261001100500_c3_listar_caixas_elegiveis_desembolso.rollback.sql

CREATE OR REPLACE FUNCTION public.listar_caixas_elegiveis_desembolso()
RETURNS TABLE (id uuid, operador_nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.id,
         COALESCE(op.nome, left(c.id::text, 8)) AS operador_nome
  FROM public.usuarios me
  JOIN public.caixas c
    ON c.loja_id = me.loja_id
   AND c.status = 'ABERTO'
   AND (c.operador_id = me.id OR me.perfil IN ('GERENTE', 'DONO', 'ADMIN'))
  LEFT JOIN public.usuarios op ON op.id = c.operador_id
  WHERE me.id = auth.uid()
  ORDER BY c.data_abertura ASC, c.id ASC;
$function$;

REVOKE ALL ON FUNCTION public.listar_caixas_elegiveis_desembolso() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listar_caixas_elegiveis_desembolso() TO authenticated, service_role;

COMMENT ON FUNCTION public.listar_caixas_elegiveis_desembolso() IS
  'Caixas que internal.resolver_caixa_pagador aceita para o chamador (auth.uid()): ABERTO, mesma loja, dono ou perfil gerencial. Só leitura/UI; a decisão é do resolvedor.';
