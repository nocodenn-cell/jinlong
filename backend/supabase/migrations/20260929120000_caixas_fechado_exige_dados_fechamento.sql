-- caixas: turno FECHADO exige data, valor contado e diferença de fechamento.
--
-- STATUS: PROPOSTA PARA REVISÃO — NÃO APLICADA. Não aplicar em produção antes de
-- rodar o preflight abaixo e obter aprovação explícita.
--
-- PROBLEMA
--   Nada no banco impede `status = 'FECHADO'` com `data_fechamento`,
--   `valor_fechamento` ou `fechamento_diferenca` NULOS. Esse estado NÃO é produzido
--   pelo fluxo normal — `fechar_caixa_atomico` e `fechar_caixa_pdv_atomico` gravam
--   os quatro campos no MESMO UPDATE — mas é alcançável por:
--     1. `UPDATE caixas SET status='FECHADO'` direto (fixtures/testes; e o papel
--        `authenticated`, que tem `UPDATE (status)` desde
--        20260814012644_protect_cash_balance_authority.sql).
--     2. `fechar_caixa_atomico(p_operador_id, NULL, ...)` / `fechar_caixa_pdv_atomico`
--        com `p_valor_contado` NULL: `ABS(NULL) > limite` é NULL (não dispara o guard
--        de divergência) e o UPDATE grava valor/diferença NULL. A camada TS valida
--        `valorContado` antes (validateCashMoneyValue), mas o RPC é chamável direto.
--   Efeito visível: turno FECHADO sem dados de fechamento sumia de /admin/caixas.
--
-- ESTRATÉGIA
--   CHECK declarativo (não trigger): vale para INSERT e UPDATE, para qualquer papel,
--   é visível em \d caixas e pega os DOIS caminhos acima. ABERTO não é afetado
--   (campos de fechamento continuam NULL enquanto aberto).
--
-- POR QUE NÃO `NOT VALID` SOZINHO (avaliação da proposta inicial)
--   `NOT VALID` só dispensa a checagem das linhas EXISTENTES; o Postgres continua
--   verificando a constraint em qualquer UPDATE de uma linha antiga. Medido em
--   BEGIN...ROLLBACK: com órfãos legados, `UPDATE caixas SET saldo_atual = ...` em um
--   FECHADO incompleto falha com 23514. `cancelar_venda_transacional`,
--   `registrar_liquidacao_receber`, `estornar_liquidacao_receber` e
--   `trg_creditar_saldo_caixa_venda_dinheiro` atualizam `saldo_atual` do caixa da
--   venda SEM filtrar por status — então cancelar/estornar vendas de um turno órfão
--   passaria a falhar. Por isso a migration é FAIL-CLOSED: se existir órfão, ABORTA
--   (transação inteira desfeita, nada muda) e manda tratar os dados antes. Sem órfãos,
--   usa `NOT VALID` + `VALIDATE` (baixo lock) e a constraint termina VALIDADA.
--
-- COMPATIBILIDADE (verificada; ver docs no PR / relatório)
--   - fechar_caixa_atomico / fechar_caixa_pdv_atomico: um único UPDATE com os 4
--     campos -> compatível. Com p_valor_contado NULL passam a falhar (23514) em vez
--     de gravar FECHADO incompleto (o TS mapeia como CLOSE_FAILED).
--   - abertura (INSERT ABERTO, trigger trg_caixas_saldo_inicial_bi) e
--     retomar_caixa_atomico (INSERT de NOVO turno ABERTO): não afetados.
--   - trg_caixas_fechado_imutavel (FECHADO nunca muda de status): complementar.
--   - Writers de saldo (registrar/aprovar_movimentacao, cancelar/devolver, AR): só
--     tocam `saldo_atual`; em linhas completas a constraint segue satisfeita.
--   - RLS/GRANT: NADA muda aqui. Com a constraint, `authenticated` deixa de conseguir
--     fechar por PATCH direto (não tem UPDATE nas outras 3 colunas), o que torna
--     `UPDATE (status)` inerte; revogá-lo fica para migration separada (defesa em
--     profundidade, exige autorização).
--   - Fixtures existentes que criam FECHADO sem dados de fechamento precisam ser
--     ajustadas (lista no relatório): ar-receipts / ap-payments / financial-
--     adversarial-gates / tokens-autorizacao (SQL) e retomar-caixa-atomico (falta
--     fechamento_diferenca).
--
-- PREFLIGHT (rodar ANTES, em cada ambiente; deve retornar 0)
--   SELECT count(*) FROM public.caixas
--   WHERE status = 'FECHADO'
--     AND (data_fechamento IS NULL OR valor_fechamento IS NULL OR fechamento_diferenca IS NULL);
--
-- ROLLBACK
--   ALTER TABLE public.caixas DROP CONSTRAINT IF EXISTS caixas_fechado_exige_dados_fechamento_chk;

BEGIN;

-- 1) Fail-closed: não impor a constraint sobre dados que a violam.
DO $preflight$
DECLARE
  v_orfaos bigint;
BEGIN
  SELECT count(*) INTO v_orfaos
  FROM public.caixas
  WHERE status = 'FECHADO'
    AND (data_fechamento IS NULL OR valor_fechamento IS NULL OR fechamento_diferenca IS NULL);

  IF v_orfaos > 0 THEN
    RAISE EXCEPTION 'CAIXAS_FECHADO_INCOMPLETO_PREEXISTENTE: % turno(s) FECHADO sem data_fechamento/valor_fechamento/fechamento_diferenca. Trate esses dados antes de aplicar esta migration (ver cabeçalho).', v_orfaos
      USING HINT = 'SELECT id, operador_id, data_abertura FROM public.caixas WHERE status = ''FECHADO'' AND (data_fechamento IS NULL OR valor_fechamento IS NULL OR fechamento_diferenca IS NULL);';
  END IF;
END
$preflight$;

-- 2) Constraint (idempotente), criada NOT VALID e validada em seguida (lock curto).
DO $add$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.caixas'::regclass
      AND conname = 'caixas_fechado_exige_dados_fechamento_chk'
  ) THEN
    ALTER TABLE public.caixas
      ADD CONSTRAINT caixas_fechado_exige_dados_fechamento_chk
      CHECK (
        status <> 'FECHADO'
        OR (
          data_fechamento IS NOT NULL
          AND valor_fechamento IS NOT NULL
          AND fechamento_diferenca IS NOT NULL
        )
      ) NOT VALID;
  END IF;
END
$add$;

ALTER TABLE public.caixas VALIDATE CONSTRAINT caixas_fechado_exige_dados_fechamento_chk;

COMMENT ON CONSTRAINT caixas_fechado_exige_dados_fechamento_chk ON public.caixas IS
  'Turno FECHADO exige data_fechamento, valor_fechamento e fechamento_diferenca (gravados juntos por fechar_caixa_atomico / fechar_caixa_pdv_atomico). ABERTO não é afetado.';

-- 3) Verificação: a constraint existe e está validada.
DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.caixas'::regclass
      AND conname = 'caixas_fechado_exige_dados_fechamento_chk'
      AND contype = 'c'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'CAIXAS_CHECK_FECHADO_NAO_VALIDADA';
  END IF;
END
$verify$;

COMMIT;
