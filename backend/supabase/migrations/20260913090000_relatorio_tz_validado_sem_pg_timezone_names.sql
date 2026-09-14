-- PERF: validação do fuso dos relatórios sem varrer `pg_timezone_names`.
--
-- Evidência (docs/audits/RELATORIO_MEDICAO_NAVEGACAO_AUTENTICADA.md e
-- AUDITORIA_AUTH_PERFORMANCE.md, produção 2026-09-12):
--   * `SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = …)` levou
--     745 ms (EXPLAIN ANALYZE). `pg_timezone_names` carrega TODOS os arquivos de
--     fuso do sistema; o custo cai quando a conexão já os tem em cache, mas o
--     PostgREST recicla conexões com frequência — a primeira RPC de relatório de
--     cada conexão nova pagava ~0,7–0,9 s só nesta checagem.
--   * Chamada por: relatorio_vendas_por_dia_periodo, relatorio_top_produtos_periodo,
--     relatorio_resumo_executivo_periodo, relatorio_margem_por_venda_periodo,
--     relatorio_curva_abc_periodo e dashboard_gerente_resumo.
--
-- Mudança: para nomes no formato IANA "Area/Local" (o único usado pelo app —
-- `relatorio_settings.timezone` = 'America/Sao_Paulo'), valida carregando APENAS
-- esse fuso via `set_config('TimeZone', …, true)` e confere o nome canônico
-- devolvido pelo servidor. Todos os demais formatos seguem pela regra original.
--
-- Semântica preservada (mesmo contrato do COMMENT abaixo):
--   * vazio/NULL → 'America/Sao_Paulo';
--   * nome existente em pg_timezone_names → o próprio nome;
--   * qualquer outro valor → 'America/Sao_Paulo'.
-- A comparação com o nome canônico mantém a exigência de grafia exata da regra
-- antiga ('america/sao_paulo' continua caindo no padrão). Equivalência verificada
-- no Postgres local contra a função anterior para todos os nomes de
-- pg_timezone_names, suas variantes em minúsculas/maiúsculas e entradas de borda
-- (abreviações, especificações POSIX, espaços, caminhos e injeção).
--
-- Isolamento do TimeZone: a cláusula `SET "TimeZone" TO 'UTC'` faz o Postgres
-- salvar o valor do chamador na entrada e restaurá-lo na saída, e restringe à
-- função o `set_config('TimeZone', …, true)` usado na validação. Sem ela a troca
-- vazaria para o resto da transação da RPC (ex.: `current_date`) — verificado.
-- Todo segmento precisa começar com letra/underscore, como em todo nome IANA
-- ("America/Sao_Paulo", "Etc/GMT+3", "America/Port-au-Prince"); especificações
-- POSIX aceitas pelo servidor mas ausentes de pg_timezone_names ('EST5/EDT',
-- 'GMT/0') ficam na regra original.
-- Assinatura, volatilidade, COST, search_path e grants inalterados (CREATE OR
-- REPLACE preserva os privilégios existentes).

CREATE OR REPLACE FUNCTION public.relatorio_tz_validado(p_tz text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE COST 5000
 SET search_path TO 'pg_catalog'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE
  v_canonico text;
BEGIN
  IF p_tz IS NULL OR btrim(p_tz) = '' THEN
    RETURN 'America/Sao_Paulo';
  END IF;

  IF p_tz ~ '^[A-Za-z_]+(/[A-Za-z_][A-Za-z0-9_+-]*)+$' THEN
    BEGIN
      PERFORM set_config('TimeZone', p_tz, true);
      v_canonico := current_setting('TimeZone');
    EXCEPTION WHEN invalid_parameter_value THEN
      RETURN 'America/Sao_Paulo';
    END;
    RETURN CASE WHEN v_canonico = p_tz THEN p_tz ELSE 'America/Sao_Paulo' END;
  END IF;

  RETURN CASE
    WHEN EXISTS (SELECT 1 FROM pg_timezone_names n WHERE n.name = p_tz) THEN p_tz
    ELSE 'America/Sao_Paulo'
  END;
END;
$function$;

COMMENT ON FUNCTION public.relatorio_tz_validado(text) IS
  'Normaliza nome IANA: vazio ou inválido → America/Sao_Paulo. STABLE. Nomes "Area/Local" validados carregando só o fuso pedido (sem varrer pg_timezone_names); demais formatos pela regra original. COST alto mantido: NÃO usar no predicado por linha — materializar uma vez (CTE MATERIALIZED / variável plpgsql) e filtrar por bounds timestamptz.';
