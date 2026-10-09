-- N1 (fase A, ADITIVA) — Proteção do preço de custo: infraestrutura para o OPERADOR não ler produtos.preco_custo.
--
-- ESTA migration não revoga nada em `produtos`: cria a via gerencial de leitura do custo (view `produtos_custos`),
-- reescreve as 4 funções INVOKER para usá-la, fecha `system_alerts` e cria o alerta de margem no banco. É segura
-- com o app ANTIGO e com o NOVO. O FECHAMENTO (REVOKE do custo em `produtos`) está em
-- 20261009180001_revoga_leitura_direta_preco_custo.sql e só deve ser aplicado DEPOIS do deploy do app novo.
--
--
-- PROBLEMA (reproduzido em stack local, 2026-10-09): a policy `produtos_leitura` libera SELECT a qualquer
-- perfil da loja e o GRANT de tabela libera TODAS as colunas ao papel `authenticated` (que é o mesmo papel de
-- banco para OPERADOR, GERENTE, DONO e ADMIN). RLS controla LINHAS, não colunas: o OPERADOR lia o custo de
-- aquisição dos 16/16 produtos direto pela API. Além disso `system_alerts` (SELECT = true) guardava
-- `custo_unitario_snap` em alertas de margem negativa, legíveis por qualquer usuário autenticado.
--
-- DESENHO (menor complexidade que fecha todos os caminhos de leitura):
--   1. [fase B, 20261009180001] Privilégio de COLUNA: REVOKE SELECT na tabela + GRANT SELECT só nas colunas SEM custo para
--      anon/authenticated. Nenhum `select`, `select *`, embed, RETURNING ou view security_invoker sobre
--      `produtos` consegue ler o custo (erro 42501). Função/trigger SECURITY DEFINER e service_role seguem lendo.
--   2. Acesso gerencial por OBJETO PRÓPRIO: `public.produtos_custos`, view de dono (security_invoker = off) cuja
--      cláusula de junção com `usuarios` aplica a autorização POR PERFIL DE APLICAÇÃO (GERENTE/DONO da loja,
--      ADMIN global — mesma regra de `auth_usuario_gerencial_loja`). Para OPERADOR a view devolve 0 linhas.
--      (security_invoker sozinho NÃO faria isso: o papel de banco é o mesmo.)
--   3. As 4 funções INVOKER que somavam custo (dashboard_gerente_resumo, relatorio_margem_por_venda_periodo,
--      relatorio_produtos_sem_giro_periodo, relatorio_resumo_executivo_periodo) passam a ler o custo da view
--      (LEFT JOIN): GERENTE/DONO/ADMIN → resultado idêntico; OPERADOR → custo nulo (e `custo_confiavel` falso).
--      O ajuste lê a definição VIGENTE no banco e troca só os trechos de custo; aborta se algum trecho
--      esperado não ocorrer exatamente o número previsto de vezes (nada é alterado nesse caso).
--   4. `system_alerts`: SELECT passa de `true` para gerencial da loja.
--   5. PDV sem custo no cliente: o alerta de margem negativa deixa de ser calculado no app (que precisava
--      do custo) e passa a `pdv_registrar_alertas_margem_venda(venda)`, SECURITY DEFINER, que compara o snapshot
--      já gravado pela venda e NÃO grava custo no detalhe do alerta.
--
-- ROLLBACK (idempotente; reverte esta fase; se a fase B foi aplicada, reverta-a ANTES — ver o cabeçalho dela):
--   DROP POLICY IF EXISTS system_alerts_select_gerencial ON public.system_alerts;
--   CREATE POLICY system_alerts_select_authenticated ON public.system_alerts FOR SELECT TO authenticated USING (true);
--   DROP FUNCTION IF EXISTS public.pdv_registrar_alertas_margem_venda(uuid);
--   -- as 4 funções: transformação exatamente inversa da seção 2 (vale para qualquer variante vigente):
--   DO $r$ DECLARE v_sig text; BEGIN
--     FOREACH v_sig IN ARRAY ARRAY['public.dashboard_gerente_resumo(uuid,text)',
--       'public.relatorio_margem_por_venda_periodo(date,date,text,integer)',
--       'public.relatorio_produtos_sem_giro_periodo(uuid,timestamp with time zone,timestamp with time zone)',
--       'public.relatorio_resumo_executivo_periodo(date,date,text)'] LOOP
--       EXECUTE replace(replace(pg_get_functiondef(v_sig::regprocedure),
--         ' LEFT JOIN public.produtos_custos pc ON pc.produto_id = p.id', ''), 'pc.preco_custo', 'p.preco_custo');
--     END LOOP; END $r$;
--   DROP VIEW IF EXISTS public.produtos_custos;   -- só depois de reverter o app (ele lê o custo pela view)
--   NOTIFY pgrst, 'reload schema';

-- 1) View gerencial de custos (dono; autorização por perfil via junção com usuarios) ----------------------
CREATE OR REPLACE VIEW public.produtos_custos
WITH (security_invoker = off) AS
SELECT
  p.id AS produto_id,
  p.loja_id,
  p.preco_custo,
  p.preco_custo_medio
FROM public.produtos p
JOIN public.usuarios u
  ON u.id = (SELECT auth.uid())
 AND COALESCE(u.ativo, false)
 AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
 AND (u.perfil = 'ADMIN' OR u.loja_id = p.loja_id);

-- Escopo = o MESMO de `produtos_leitura` (ADMIN global; demais, a própria loja) restrito a perfis gerenciais ATIVOS:
-- um usuário desativado (usuarios.ativo = false) com token ainda válido não lê custo. DONO de outra loja já não
-- enxerga as linhas de `produtos` (RLS), então a view não amplia nem reduz o alcance existente.
COMMENT ON VIEW public.produtos_custos IS
  'Custo de aquisição por produto, SOMENTE para GERENTE/DONO ativos da loja e ADMIN ativo (0 linhas para OPERADOR/inativo). Única via de leitura do custo para usuários autenticados; produtos.preco_custo tem SELECT revogado.';

REVOKE ALL ON public.produtos_custos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.produtos_custos TO authenticated, service_role;

-- 2) Funções INVOKER passam a ler o custo da view gerencial -------------------------------------------------
-- Lê a definição VIGENTE de cada função (a de produção pode diferir do repositório) e, no PRIMEIRO
-- `JOIN public.produtos p ON p.id = <x>.produto_id` que vem depois da primeira referência a `p.preco_custo`
-- (o FROM do mesmo SELECT que soma o custo), acrescenta `LEFT JOIN public.produtos_custos pc`; depois troca
-- `p.preco_custo` por `pc.preco_custo`. Aborta SEM alterar nada se o resultado não for exatamente o esperado.
DO $fn$
DECLARE
  v_sig text;
  v_def text;
  v_pos int;
  v_novo text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.dashboard_gerente_resumo(uuid,text)',
    'public.relatorio_margem_por_venda_periodo(date,date,text,integer)',
    'public.relatorio_produtos_sem_giro_periodo(uuid,timestamp with time zone,timestamp with time zone)',
    'public.relatorio_resumo_executivo_periodo(date,date,text)'
  ]
  LOOP
    v_def := pg_get_functiondef(v_sig::regprocedure);
    v_pos := position('p.preco_custo' IN v_def);
    IF v_pos = 0 THEN
      RAISE EXCEPTION '%: nenhuma referência a p.preco_custo — definição inesperada, abortado', v_sig;
    END IF;

    v_novo := left(v_def, v_pos - 1)
      || regexp_replace(
           substr(v_def, v_pos),
           '(JOIN public\.produtos p ON p\.id = \w+\.produto_id)',
           '\1 LEFT JOIN public.produtos_custos pc ON pc.produto_id = p.id'
         );
    v_novo := replace(v_novo, 'p.preco_custo', 'pc.preco_custo');

    IF (length(v_novo) - length(replace(v_novo, 'LEFT JOIN public.produtos_custos pc', ''))) / length('LEFT JOIN public.produtos_custos pc') <> 1 THEN
      RAISE EXCEPTION '%: esperado exatamente 1 junção com produtos_custos após a troca — abortado sem alterar nada', v_sig;
    END IF;
    IF position('p.preco_custo' IN v_novo) <> 0 OR v_novo = v_def THEN
      RAISE EXCEPTION '%: troca inconsistente — abortado sem alterar nada', v_sig;
    END IF;

    EXECUTE v_novo;
  END LOOP;
END
$fn$;

-- 3) system_alerts: leitura só para gerencial da loja --------------------------------------------------------
DROP POLICY IF EXISTS system_alerts_select_authenticated ON public.system_alerts;
DROP POLICY IF EXISTS system_alerts_select_gerencial ON public.system_alerts;
CREATE POLICY system_alerts_select_gerencial ON public.system_alerts
  FOR SELECT TO authenticated
  USING (public.auth_usuario_gerencial_loja(loja_id));

-- 4) Alerta de margem negativa calculado no banco (sem custo no cliente nem no detalhe) -----------------------
CREATE OR REPLACE FUNCTION public.pdv_registrar_alertas_margem_venda(p_venda_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_loja uuid;
  v_operador uuid;
  v_ativo boolean;
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;

  SELECT c.loja_id, v.operador_id
    INTO v_loja, v_operador
  FROM public.vendas v
  JOIN public.caixas c ON c.id = v.caixa_id
  WHERE v.id = p_venda_id;

  IF v_loja IS NULL THEN
    RAISE EXCEPTION 'VENDA_NAO_ENCONTRADA' USING ERRCODE = 'P0002';
  END IF;
  IF v_operador IS DISTINCT FROM v_uid AND NOT public.auth_usuario_gerencial_loja(v_loja) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(p.alertas_leves_ativos, false) INTO v_ativo FROM public.pdv_config p WHERE p.id = 1;
  IF NOT COALESCE(v_ativo, false) THEN
    RETURN;
  END IF;

  -- Serializa chamadas concorrentes da MESMA venda (retries idempotentes): sem isso duas transações poderiam
  -- passar no NOT EXISTS antes de qualquer INSERT confirmar e duplicar o alerta.
  PERFORM pg_advisory_xact_lock(hashtextextended('pdv_margem_negativa:' || p_venda_id::text, 0));

  FOR r IN
    SELECT iv.produto_id, iv.preco_unitario
    FROM public.itens_venda iv
    WHERE iv.venda_id = p_venda_id
      AND iv.custo_unitario_snap IS NOT NULL
      AND iv.preco_unitario < iv.custo_unitario_snap
      AND NOT EXISTS (
        SELECT 1 FROM public.system_alerts a
        WHERE a.tipo = 'margem_negativa' AND a.venda_id = p_venda_id AND a.produto_id = iv.produto_id
      )
  LOOP
    INSERT INTO public.system_alerts (tipo, produto_id, venda_id, loja_id, detalhe)
    VALUES ('margem_negativa', r.produto_id, p_venda_id, v_loja,
            jsonb_build_object('preco_unitario', r.preco_unitario, 'abaixo_do_custo', true));
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.pdv_registrar_alertas_margem_venda(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_registrar_alertas_margem_venda(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.pdv_registrar_alertas_margem_venda(uuid) IS
  'Registra system_alerts margem_negativa para itens vendidos abaixo do custo (snapshot da venda). Retorna void de propósito: contagem/resultado seria um oráculo do custo para o OPERADOR. Idempotente e serializada por venda (advisory lock).';

NOTIFY pgrst, 'reload schema';
