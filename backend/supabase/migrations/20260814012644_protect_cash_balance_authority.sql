-- P0-1: `caixas.saldo_atual` volta a ser autoridade exclusiva dos writers financeiros.
--
-- Problema comprovado: `authenticated` tinha `UPDATE` amplo na tabela
-- (`authenticated=arwdDxtm`), e as policies `caixas_update_authenticated`
-- autorizam o operador dono do caixa e GERENTE/DONO/ADMIN da loja. Um
-- `PATCH /rest/v1/caixas` gravava qualquer valor no contador físico:
--   OPERADOR -> saldo_atual = 999999.00
--   GERENTE  -> saldo_atual = 0.00
-- Nenhuma RPC envolvida; a arquitetura "um escritor por fato financeiro" não
-- existia na camada de dados.
--
-- Correção mínima, em duas partes:
--   1. grants por coluna: `authenticated` mantém apenas o UPDATE operacional
--      de `status` (único write direto do produto; fechamento real é a RPC
--      `fechar_caixa_atomico`). `saldo_atual` e `valor_inicial` saem do alcance.
--   2. trigger de abertura: o contador nasce sempre igual ao valor inicial,
--      independentemente do payload. Isso também corrige `ensureCaixaPdv` do
--      sync-outbox, que inseria caixa sem `saldo_atual` e caía no DEFAULT 0
--      enquanto `valor_inicial` recebia o troco inicial do PDV local.
--
-- Writers legítimos NÃO são afetados: `trg_creditar_saldo_caixa_venda_dinheiro`,
-- `registrar_liquidacao_receber`, `registrar_movimentacao`, `aprovar_movimentacao`,
-- `cancelar_venda_transacional`, `devolver_ou_trocar_venda` e `fechar_caixa_atomico`
-- são SECURITY DEFINER com owner `postgres` — o mesmo owner da tabela — e portanto
-- não passam pelos grants de `authenticated`.
--
-- ROLLBACK
--   DROP TRIGGER trg_caixas_saldo_inicial_bi ON public.caixas;
--   DROP FUNCTION public.trg_caixas_saldo_inicial();
--   GRANT UPDATE ON public.caixas TO authenticated;

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Grants por coluna
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE UPDATE ON public.caixas FROM authenticated;

-- `status` é o único UPDATE direto exercido pelo produto sobre `caixas`.
-- Colunas monetárias (`saldo_atual`, `valor_inicial`, `valor_fechamento`,
-- `fechamento_diferenca`) e de identidade (`id`, `loja_id`, `operador_id`,
-- `data_abertura`) ficam fora: são gravadas apenas pelas RPCs canônicas.
GRANT UPDATE (status) ON public.caixas TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Abertura determinística do contador
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_caixas_saldo_inicial()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- O contador físico de um caixa recém-aberto é, por definição, o valor
  -- inicial declarado. Nunca aceitar esse número do cliente.
  NEW.saldo_atual := COALESCE(NEW.valor_inicial, 0);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_caixas_saldo_inicial() IS
  'Abertura de caixa: saldo_atual := valor_inicial. Impede contador arbitrario no INSERT.';

DROP TRIGGER IF EXISTS trg_caixas_saldo_inicial_bi ON public.caixas;
CREATE TRIGGER trg_caixas_saldo_inicial_bi
  BEFORE INSERT ON public.caixas
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_caixas_saldo_inicial();

COMMIT;
