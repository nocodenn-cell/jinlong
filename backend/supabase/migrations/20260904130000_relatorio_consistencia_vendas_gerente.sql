-- Item 23 do Plano Mestre de Fechamento dos Gaps — expõe
-- relatorio_consistencia_vendas (hoje service_role-only) para GERENTE/
-- DONO/ADMIN, escopado à própria loja.
--
-- Achado (docs/ONDA3_DIAGNOSTICO_FECHAMENTO_CAIXA.md, 2026-09-01): o
-- fechamento de caixa hoje só concilia dinheiro (por desenho — Gate 3/4 de
-- financial-adversarial-gates.test.sql dependem disso e NÃO devem ser
-- tocados). PIX/cartão/fiado existem em vendas_pagamentos mas nada no
-- fechamento os lê ou compara. relatorio_consistencia_vendas já calcula
-- pagamentos_divergentes (venda vs. soma de vendas_pagamentos) e
-- sem_pagamento por período/caixa/loja — é 80% do SSOT de detecção, mas
-- foi deixada deliberadamente sem consumidor (20260819230000, restrita a
-- service_role "para não ser alcançável pelo app").
--
-- GATE 9 (financial-adversarial-gates.test.sql:388-412) trava
-- has_function_privilege(authenticated/anon, relatorio_consistencia_vendas,
-- EXECUTE) = false — não pode ser tocado. Esta migration NÃO altera grants
-- da função original: cria uma função NOVA (wrapper), SECURITY DEFINER,
-- que valida perfil/loja do chamador e então chama a função original
-- internamente (permitido: SECURITY DEFINER roda como o dono da função,
-- não como o role do chamador — os grants da função interna não se aplicam
-- à chamada feita de dentro de outra função do mesmo dono).
--
-- Escopo desta unidade: só o backend (RPC testável isoladamente). Onde/
-- para quem exibir esse dado na UI (tela de fechamento do operador vs.
-- painel do gerente, que hoje não existe — ver investigação do item 22)
-- é uma decisão de produto/UX com mais de uma opção válida, não uma
-- decisão puramente técnica — fica para PR de UI subsequente, com o
-- diagnóstico completo (docs/ONDA3_DIAGNOSTICO_FECHAMENTO_CAIXA.md) já
-- mapeando o SSOT maior (calcular_valor_sistema_por_forma_caixa +
-- caixas_fechamento_formas) que a UI final provavelmente vai precisar.

CREATE OR REPLACE FUNCTION public.relatorio_consistencia_vendas_gerente(
  p_caixa_id uuid DEFAULT NULL,
  p_from     timestamptz DEFAULT (now() - interval '7 days'),
  p_to       timestamptz DEFAULT now()
)
RETURNS TABLE(
  total_vendas bigint,
  vendas_consistentes bigint,
  vendas_com_anomalia bigint,
  taxa_consistencia_pct numeric,
  sem_itens bigint,
  sem_evento_ledger bigint,
  evento_duplicado bigint,
  sem_pagamento bigint,
  pagamentos_divergentes bigint,
  periodo_inicio timestamptz,
  periodo_fim timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
  v_loja_escopo uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'RELATORIO_CONSISTENCIA_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
  FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'RELATORIO_CONSISTENCIA_PERFIL';
  END IF;

  -- GERENTE só vê a própria loja. DONO/ADMIN (Padrão A, consolidado em
  -- 20260829120000/fase6) têm escopo global — sem filtro de loja.
  IF v_perfil = 'GERENTE' THEN
    v_loja_escopo := v_loja_usuario;
  END IF;

  -- Se um caixa específico foi pedido, GERENTE só pode consultar um caixa
  -- da própria loja — cross-loja nega antes de expor qualquer linha.
  IF p_caixa_id IS NOT NULL AND v_perfil = 'GERENTE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.caixas c WHERE c.id = p_caixa_id AND c.loja_id = v_loja_usuario
    ) THEN
      RAISE EXCEPTION 'RELATORIO_CONSISTENCIA_LOJA_INVALIDA';
    END IF;
  END IF;

  RETURN QUERY
  SELECT * FROM public.relatorio_consistencia_vendas(p_caixa_id, v_loja_escopo, p_from, p_to);
END;
$$;

COMMENT ON FUNCTION public.relatorio_consistencia_vendas_gerente IS
  'Item 23 do Plano Mestre — wrapper de relatorio_consistencia_vendas escopado a GERENTE (própria loja)/DONO/ADMIN (global). Não altera grants da função original (Gate 9 continua intacto).';

REVOKE ALL ON FUNCTION public.relatorio_consistencia_vendas_gerente FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relatorio_consistencia_vendas_gerente TO authenticated, service_role;

DO $verify$
DECLARE
  v_authenticated boolean;
  v_anon boolean;
  v_original_authenticated boolean;
BEGIN
  v_authenticated := has_function_privilege('authenticated', 'public.relatorio_consistencia_vendas_gerente(uuid, timestamptz, timestamptz)', 'EXECUTE');
  v_anon := has_function_privilege('anon', 'public.relatorio_consistencia_vendas_gerente(uuid, timestamptz, timestamptz)', 'EXECUTE');
  v_original_authenticated := has_function_privilege('authenticated', 'public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz)', 'EXECUTE');

  IF NOT v_authenticated THEN
    RAISE EXCEPTION 'VERIFY_FALHOU: authenticated deveria poder executar o wrapper';
  END IF;
  IF v_anon THEN
    RAISE EXCEPTION 'VERIFY_FALHOU: anon nao deveria poder executar o wrapper';
  END IF;
  IF v_original_authenticated THEN
    RAISE EXCEPTION 'VERIFY_FALHOU: GATE 9 quebrado — authenticated ganhou EXECUTE na funcao original';
  END IF;

  RAISE NOTICE 'relatorio_consistencia_vendas_gerente: grants OK (authenticated=true, anon=false), Gate 9 intacto (original continua service_role-only).';
END
$verify$;
