-- D0 rollout — Alternativa A (decisão comercial de 23/08/2026, ver
-- docs/piloto-d0/PREFLIGHT_ROLLOUT_PRICING_D0.md): cria faixa de atacado
-- equivalente ao preco_atacado legado para os produtos identificados pelo
-- preflight corrigido (backend/scripts/d0-pricing-legacy-preflight.sql) como
-- sem tier ativo que cubra o limiar legado hoje efetivamente aplicado.
--
-- ============================================================================
-- NÃO EXECUTAR SEM AUTORIZAÇÃO EXPLÍCITA. Este arquivo é uma PROPOSTA.
-- ============================================================================
--
-- Leitura de origem: 23/08/2026, projeto kbabmewnahysfvlybiak, somente SELECT.
-- 34 produtos (29 ativos, 5 inativos), todos da loja
-- a0000001-0000-4000-8000-000000000001 (única loja com dado real hoje).
--
-- Este arquivo NÃO versiona nome, preço ou qualquer outro dado comercial —
-- só os produto_id (identificadores internos opacos). Preço, nome e demais
-- campos são lidos AO VIVO do banco no momento da execução, nunca gravados
-- aqui. A tabela com nome/preço por produto foi entregue fora do repositório
-- (mesma política do preflight, já documentada em
-- docs/piloto-d0/PREFLIGHT_ROLLOUT_PRICING_D0.md).
--
-- Limiar preservado: 6 unidades. Não é suposição — é o valor lido de
-- pdv_config.id=1 (quantidade_minima_atacado_padrao=6), a ÚNICA fonte que a
-- calcular_preco_produto hoje em produção realmente usa como fallback
-- (confirmado via pg_get_functiondef; a função ignora
-- produtos.quantidade_gatilho_atacado e pdv_config.id=2). Reproduzir com:
--   SELECT pg_get_functiondef('public.calcular_preco_produto(uuid,integer,uuid)'::regprocedure);
--
-- Achado relevante durante a preparação (contagens agregadas, sem dado por
-- produto): 21 dos 34 produtos têm produtos.quantidade_gatilho_atacado
-- preenchido e diferente de 6 — campo que atualizar_produto_com_faixa_atacado
-- trata como fonte da faixa "do catálogo", mas que calcular_preco_produto
-- hoje ignora ao decidir o fallback. 7 já têm tier sincronizado nesse
-- gatilho (preço idêntico ao legado, confirmado via join abaixo); 14 nunca
-- foram sincronizados. Preservar comportamento comercial = usar 6 para os
-- 34; o descompasso catálogo-declarado × preço-efetivamente-aplicado nesses
-- 14 fica sinalizado para decisão manual separada, sem bloquear esta
-- inserção.
--
-- O que este script faz:
--   1. Fixa os 34 produto_id (só o identificador, nada além disso) numa
--      tabela temporária.
--   2. Lê preco_atacado, ativo e existência de tier cobrindo o limiar AO
--      VIVO, no momento da execução — nunca de um valor congelado.
--   3. Aborta a transação inteira se QUALQUER um dos 34 tiver sumido, não
--      tiver mais preco_atacado, ou já tiver ganho tier cobrindo o limiar
--      desde a leitura de 23/08/2026 — força reler o preflight em vez de
--      aplicar dado obsoleto.
--   4. Insere uma faixa GLOBAL (loja_id NULL) ativa em quantidade_minima=6
--      com preco_unitario = preco_atacado (lido ao vivo), só para quem
--      ainda não tem.
--
-- O que este script NÃO faz:
--   - não altera produtos.preco_varejo nem produtos.preco_atacado;
--   - não altera produtos.quantidade_gatilho_atacado;
--   - não desativa, edita nem apaga nenhuma faixa existente;
--   - não cria segunda faixa para quem já tem tier em qty>6 — essa faixa
--     permanece intocada, cobrindo as quantidades maiores.
--
-- Idempotência: a chave (produto_id, quantidade_minima) WHERE loja_id IS
-- NULL AND ativo=true já é única no schema (índice
-- precos_atacado_global_prod_min, migration 077). ON CONFLICT DO NOTHING
-- garante que reexecução não duplica nem falha.
--
-- Auditoria: cada linha inserida carrega created_at (default now()); não há
-- coluna de autor em precos_atacado — o autor/ticket desta operação fica
-- registrado no commit que versiona este arquivo e em
-- docs/piloto-d0/DIVERGENCIAS_E_DECISOES.md (DIV-D0-001).

BEGIN;

CREATE TEMP TABLE _d0_tier_backfill (produto_id uuid PRIMARY KEY) ON COMMIT DROP;

INSERT INTO _d0_tier_backfill (produto_id) VALUES
  ('c0f8db78-386f-42a7-8a7f-7ca8e2f4e18f'),
  ('d2deb8c7-de22-48e9-8bdb-b0507b319c62'),
  ('026c8ce8-bee7-4a09-962d-037b5bca25e8'),
  ('5c41ac2f-14c2-4a25-9bbd-348a0257ff08'),
  ('5e32c053-2bfa-46dc-8c3c-6680dfd5b0af'),
  ('b9fdf51c-66d1-404d-973d-bea0c0765464'),
  ('ee5adab4-30d0-420a-b355-263848614263'),
  ('d1c0d200-0003-4000-8000-000000000003'),
  ('d1c0d200-0005-4000-8000-000000000005'),
  ('d1c0d200-0009-4000-8000-000000000009'),
  ('d1c0d200-000a-4000-8000-00000000000a'),
  ('d1c0d200-000b-4000-8000-00000000000b'),
  ('d1c0d200-000c-4000-8000-00000000000c'),
  ('18f00c83-435c-4b29-9f91-74cd5ba3c776'),
  ('f524037c-f837-4f79-9ad0-cc3c00680187'),
  ('a88791f6-1e1c-4f67-bed1-e12ba0237485'),
  ('fc1eebb6-1f09-4704-a34d-6b70e53549a7'),
  ('1164905b-f570-47b0-9eb6-620b8c7e8b50'),
  ('d63cff2a-4ef8-4b1f-b05d-0f1280f42d6c'),
  ('41e3bcf1-159f-4846-be0f-972b46e6e473'),
  ('d2fd4b90-47c2-4cde-95d8-a6e636a8de66'),
  ('a8a5f486-2588-410f-b3a9-a62c697b8cea'),
  ('9ebd1c52-10ae-4df7-9c92-ba5396ffce43'),
  ('6d05b51a-0ac2-40e2-8808-2f76930b1402'),
  ('6a31526e-b475-4951-91f6-c62d67e7dcf1'),
  ('b19a109d-67a2-4e05-b3a7-0e709a788d73'),
  ('4ca4e5e3-99f0-4c47-b13a-4a78cdfac8d2'),
  ('6e5ead95-d025-40d8-b747-ee4310f07563'),
  ('65da5afe-0111-4fb5-a4ec-80d05f32f860'),
  ('1a7ab011-866d-4970-bc91-da9c97e39534'),
  ('9b05b12e-3e19-414f-9f8d-a0fd7da82a5a'),
  ('745022fa-f9b1-4105-a523-97c29af3780e'),
  ('387d352c-2ff4-4229-9949-983e996560da'),
  ('98b55eb9-232f-4dc2-844a-278011248bbc')
;

DO $check$
DECLARE
  v_total     int;
  v_sumiu     int;
  v_sem_preco int;
  v_ja_coberto int;
BEGIN
  SELECT count(*) INTO v_total FROM _d0_tier_backfill;
  IF v_total <> 34 THEN
    RAISE EXCEPTION 'D0_TIER_BACKFILL_LISTA_MUDOU: esperado 34 produto_id fixados, encontrado %', v_total;
  END IF;

  SELECT count(*) INTO v_sumiu
  FROM _d0_tier_backfill b
  WHERE NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = b.produto_id);
  IF v_sumiu > 0 THEN
    RAISE EXCEPTION 'D0_TIER_BACKFILL_PRODUTO_SUMIU: % produto(s) da lista não existem mais — releia o preflight', v_sumiu;
  END IF;

  SELECT count(*) INTO v_sem_preco
  FROM _d0_tier_backfill b
  JOIN public.produtos p ON p.id = b.produto_id
  WHERE p.preco_atacado IS NULL;
  IF v_sem_preco > 0 THEN
    RAISE EXCEPTION 'D0_TIER_BACKFILL_SEM_PRECO_ATACADO: % produto(s) perderam preco_atacado desde a leitura — releia o preflight', v_sem_preco;
  END IF;

  SELECT count(*) INTO v_ja_coberto
  FROM _d0_tier_backfill b
  JOIN public.produtos p ON p.id = b.produto_id
  WHERE EXISTS (
    SELECT 1 FROM public.precos_atacado pa
    WHERE pa.produto_id = b.produto_id
      AND pa.ativo = true
      AND pa.quantidade_minima <= 6
      AND (pa.loja_id IS NULL OR pa.loja_id = p.loja_id)
  );
  IF v_ja_coberto > 0 THEN
    RAISE EXCEPTION 'D0_TIER_BACKFILL_JA_COBERTO: % produto(s) já ganharam tier cobrindo o limiar desde a leitura — releia o preflight antes de aplicar', v_ja_coberto;
  END IF;
END;
$check$;

-- Inserção idempotente: preco_unitario lido AO VIVO de produtos.preco_atacado
-- no momento da execução — nunca de um valor gravado neste arquivo. Só cria
-- quem ainda não tem faixa global ativa em 6 (ON CONFLICT DO NOTHING sobre a
-- unique key já existente do schema).
INSERT INTO public.precos_atacado (produto_id, quantidade_minima, preco_unitario, loja_id, ativo)
SELECT b.produto_id, 6, p.preco_atacado, NULL, true
FROM _d0_tier_backfill b
JOIN public.produtos p ON p.id = b.produto_id
ON CONFLICT (produto_id, quantidade_minima) WHERE loja_id IS NULL AND ativo = true
DO NOTHING;

-- Prova de preço efetivo preservado: para cada um dos 34, o preço resolvido
-- em qty=6 depois da inserção tem que bater com produtos.preco_atacado lido
-- ao vivo (nunca um número fixado neste arquivo).
DO $prova$
DECLARE
  r record;
  v_falhas int := 0;
BEGIN
  FOR r IN
    SELECT b.produto_id, p.preco_atacado AS esperado,
           (public.calcular_preco_produto(b.produto_id, 6)->>'preco')::numeric AS resolvido,
           (public.calcular_preco_produto(b.produto_id, 6)->>'tipo') AS tipo
    FROM _d0_tier_backfill b
    JOIN public.produtos p ON p.id = b.produto_id
  LOOP
    IF r.tipo <> 'ATACADO' OR r.resolvido IS DISTINCT FROM r.esperado THEN
      v_falhas := v_falhas + 1;
      RAISE WARNING 'D0_TIER_BACKFILL_PROVA_FALHOU produto_id=% tipo=% resolvido=% esperado=%',
        r.produto_id, r.tipo, r.resolvido, r.esperado;
    END IF;
  END LOOP;

  IF v_falhas > 0 THEN
    RAISE EXCEPTION 'D0_TIER_BACKFILL_PROVA_FALHOU: % de 34 produto(s) não resolveram para o preço atacado esperado em qty=6', v_falhas;
  END IF;

  RAISE NOTICE 'D0 TIER BACKFILL: prova de preço efetivo OK nos 34 produtos.';
END;
$prova$;

-- Trocar por ROLLBACK para dry-run (nada é persistido, as provas acima ainda
-- rodam e validam contra o estado atual + a inserção hipotética da sessão).
COMMIT;

-- ============================================================================
-- VALIDAÇÃO PÓS-OPERAÇÃO (rodar depois do COMMIT, sessão separada)
-- ============================================================================
-- Confere: exatamente 34 faixas novas criadas hoje, todas em
-- quantidade_minima=6, loja_id NULL, ativo=true, preco_unitario batendo com
-- produtos.preco_atacado; e que o preflight corrigido não acusa mais nenhum
-- dos 34 como descoberto.

-- SELECT count(*) AS faixas_criadas_hoje
-- FROM public.precos_atacado pa
-- WHERE pa.quantidade_minima = 6 AND pa.loja_id IS NULL AND pa.ativo = true
--   AND pa.created_at >= now() - interval '1 hour'
--   AND EXISTS (
--     SELECT 1 FROM (VALUES ('c0f8db78-386f-42a7-8a7f-7ca8e2f4e18f'::uuid), ...) AS v(id)
--     WHERE v.id = pa.produto_id
--   );
-- -- esperado: 34 (substituir "..." pelos mesmos 34 produto_id do bloco acima)

-- SELECT pa.produto_id, pa.preco_unitario, p.preco_atacado
-- FROM public.precos_atacado pa JOIN public.produtos p ON p.id = pa.produto_id
-- WHERE pa.quantidade_minima = 6 AND pa.loja_id IS NULL AND pa.ativo = true
--   AND pa.preco_unitario IS DISTINCT FROM p.preco_atacado;
-- -- esperado: 0 linhas para os 34 desta lista

-- \i backend/scripts/d0-pricing-legacy-preflight.sql
-- -- esperado: os 34 produto_id desta lista não aparecem mais no relatório
-- -- (pode haver produtos novos cadastrados depois da leitura — não é
-- -- regressão desta operação).

-- ============================================================================
-- ROLLBACK (se algo saiu errado DEPOIS do COMMIT)
-- ============================================================================
-- Reversível porque a operação só INSERE linhas novas — nunca edita nem
-- desativa nada preexistente. Desfazer é desativar (nunca DELETE, para manter
-- rastro) exatamente as 34 linhas criadas por este script:
--
-- BEGIN;
-- UPDATE public.precos_atacado
-- SET ativo = false
-- WHERE quantidade_minima = 6 AND loja_id IS NULL AND ativo = true
--   AND produto_id IN ( <os mesmos 34 produto_id do bloco acima> )
--   AND created_at >= '<timestamp do COMMIT desta operação>';
-- -- confirmar count = 34 antes de COMMIT; se diferente, ROLLBACK e investigar.
-- COMMIT;
--
-- Se por algum motivo for necessário apagar de fato (ex.: linha criada por
-- engano, nunca usada em venda): DELETE FROM public.precos_atacado WHERE id = '<tier_id>';
-- só depois de confirmar que nenhuma venda referenciou esse regra_id.
