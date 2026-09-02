-- Gate de Convergência A02-2.1 — repetição de fechamento com valor_contado
-- diferente é silenciosamente descartada.
--
-- Achado provado (docs/audits/GATE_CONVERGENCIA_AUDITORIAS_OPENCODE_01_04.md,
-- BEGIN...ROLLBACK contra produção): no caminho "já fechado" (nenhum caixa
-- ABERTO, mas há um FECHADO nas últimas 24h), `fechar_caixa_atomico` devolve
-- SEMPRE os dados do fechamento já persistido, ignorando por completo o
-- `p_valor_contado` da nova chamada — mesmo quando ele diverge do valor
-- original. Prova: fechar com valor_contado=1000, depois repetir pedindo
-- fechar com valor_contado=500 (payload materialmente diferente) devolveu
-- o_valor_contado=1000 (o valor da PRIMEIRA chamada) sem nenhum erro. O
-- chamador não tem como saber, pela ausência de erro, que os 500 que enviou
-- foram descartados — só o campo o_ja_fechado=true sinaliza replay.
--
-- Correção mínima: quando o replay é detectado (caixa já fechado há <24h),
-- comparar o valor_contado da nova chamada com o valor_fechamento já
-- persistido (arredondados a 2 casas, mesma convenção do resto da função).
-- Mesmo valor -> replay silencioso inalterado (mesma chave + mesmo payload).
-- Valor diferente -> rejeição explícita, não substituição silenciosa.
--
-- CREATE OR REPLACE do corpo vigente (extraído via pg_get_functiondef do
-- banco de produção antes desta migration, idêntico ao definido em
-- 20260621002600_230_caixa_status_fechamento.sql). Único trecho alterado: o
-- bloco "já fechado" dentro do ramo NOT FOUND. Resto do corpo idêntico.
--
-- SEM `DROP FUNCTION` (achado do gate de revisão pré-commit): a assinatura
-- não muda, então não há motivo para o DROP que a 230 precisou (lá o
-- RETURNS TABLE ganhava a coluna `o_ja_fechado`, e CREATE OR REPLACE não
-- pode mudar o tipo de retorno). Um DROP+CREATE aqui recriaria o objeto do
-- zero e o `ALTER DEFAULT PRIVILEGES` do schema `public` (confirmado em
-- produção: `anon=X/postgres` nas defaults de função) devolveria EXECUTE a
-- `anon` por padrão — reabrindo exatamente o que
-- 20260718133633_revoke_anon_pdv_rpcs_and_fix_diag.sql revogou depois da
-- 230. `CREATE OR REPLACE FUNCTION` sozinho preserva ownership/ACL
-- existentes (comportamento documentado do Postgres) — confirmado localmente
-- pré/pós nesta migration. O REVOKE/GRANT abaixo é reafirmado explicitamente
-- mesmo assim, como defesa em profundidade e para deixar o contrato de
-- grants auditável nesta migration.
--
-- ROLLBACK: reaplicar o CREATE OR REPLACE anterior, disponível em
-- 20260621002600_230_caixa_status_fechamento.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.fechar_caixa_atomico(
  p_operador_id uuid,
  p_valor_contado numeric,
  p_motivo text DEFAULT ''
)
RETURNS TABLE (
  o_caixa_id uuid,
  o_valor_sistema numeric(10,2),
  o_valor_contado numeric(10,2),
  o_diferenca numeric(10,2),
  o_ja_fechado boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_caixa_id uuid;
  v_valor_sistema numeric(10,2);
  v_diferenca numeric(10,2);
  v_motivo text;
  v_fechado record;
  v_valor_contado_novo numeric(10,2);
  c_limite CONSTANT numeric := 5.00;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_SESSAO_EXPIRADA';
  END IF;
  IF v_uid <> p_operador_id THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_SEM_PERMISSAO';
  END IF;

  v_motivo := TRIM(COALESCE(p_motivo, ''));

  SELECT c.id INTO v_caixa_id
  FROM public.caixas c
  WHERE c.operador_id = p_operador_id AND c.status = 'ABERTO'
  ORDER BY c.data_abertura DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT c.id, c.valor_fechamento, c.fechamento_diferenca, c.data_fechamento
    INTO v_fechado
    FROM public.caixas c
    WHERE c.operador_id = p_operador_id AND c.status = 'FECHADO'
    ORDER BY c.data_fechamento DESC NULLS LAST, c.data_abertura DESC
    LIMIT 1;

    IF FOUND AND v_fechado.data_fechamento IS NOT NULL
       AND v_fechado.data_fechamento >= (now() - interval '24 hours') THEN
      -- Gate A02-2.1: mesma chave (operador + fechamento recente) só pode dar
      -- replay silencioso com o MESMO valor_contado. Um valor_contado
      -- divergente não pode ser descartado sem aviso — é rejeitado.
      v_valor_contado_novo := ROUND(p_valor_contado, 2);
      IF v_fechado.valor_fechamento IS NOT NULL
         AND v_fechado.valor_fechamento IS DISTINCT FROM v_valor_contado_novo THEN
        RAISE EXCEPTION 'FECHAR_CAIXA_REPETICAO_VALOR_DIVERGENTE'
          USING DETAIL = format('valor_fechamento_persistido=%s valor_contado_nova_chamada=%s',
            v_fechado.valor_fechamento, v_valor_contado_novo);
      END IF;

      RETURN QUERY SELECT
        v_fechado.id,
        ROUND(COALESCE(v_fechado.valor_fechamento, 0) - COALESCE(v_fechado.fechamento_diferenca, 0), 2)::numeric(10,2),
        COALESCE(v_fechado.valor_fechamento, v_valor_contado_novo),
        COALESCE(v_fechado.fechamento_diferenca, 0::numeric(10,2)),
        true;
      RETURN;
    END IF;

    RAISE EXCEPTION 'FECHAR_CAIXA_CAIXA_NAO_ENCONTRADO';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.movimentacoes_caixa m
    WHERE m.caixa_id = v_caixa_id AND m.status = 'pendente' AND m.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_MOVIMENTACOES_PENDENTES';
  END IF;

  v_valor_sistema := public.calcular_valor_sistema_dinheiro_caixa(v_caixa_id);
  v_diferenca := ROUND(p_valor_contado - v_valor_sistema, 2);

  IF ABS(v_diferenca) > c_limite AND LENGTH(v_motivo) < 5 THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_DIVERGENCIA_SEM_MOTIVO' USING DETAIL = v_diferenca::text;
  END IF;

  UPDATE public.caixas SET
    status = 'FECHADO',
    data_fechamento = now(),
    valor_fechamento = ROUND(p_valor_contado, 2),
    fechamento_diferenca = v_diferenca,
    fechamento_observacao = NULLIF(v_motivo, '')
  WHERE id = v_caixa_id;

  RETURN QUERY SELECT v_caixa_id, v_valor_sistema, ROUND(p_valor_contado, 2)::numeric(10,2), v_diferenca, false;
END;
$$;

REVOKE ALL ON FUNCTION public.fechar_caixa_atomico(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fechar_caixa_atomico(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_caixa_atomico(uuid, numeric, text) TO service_role;

COMMENT ON FUNCTION public.fechar_caixa_atomico(uuid, numeric, text) IS
  'Gate A02-2.1 (2026-09-02): fechamento idempotente. Replay recente (<24h) com o MESMO valor_contado devolve o fechamento persistido em silêncio; valor_contado divergente é rejeitado com FECHAR_CAIXA_REPETICAO_VALOR_DIVERGENTE em vez de descartado silenciosamente.';

DO $verify$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.fechar_caixa_atomico(uuid, numeric, text)'::regprocedure);
  IF position('FECHAR_CAIXA_REPETICAO_VALOR_DIVERGENTE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'GATE_2_1_GUARD_AUSENTE';
  END IF;
  IF has_function_privilege('anon', 'public.fechar_caixa_atomico(uuid, numeric, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'GATE_2_1_GRANT_ANON_INDEVIDO';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fechar_caixa_atomico(uuid, numeric, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'GATE_2_1_GRANT_AUTHENTICATED_AUSENTE';
  END IF;
END
$verify$;

COMMIT;
