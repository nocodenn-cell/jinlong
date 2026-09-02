-- Gate de Convergência A04-4.2 — varejo pode cair abaixo de um tier de
-- atacado já existente, invertendo o preço (atacado > varejo).
--
-- Achado provado (docs/audits/GATE_CONVERGENCIA_AUDITORIAS_OPENCODE_01_04.md,
-- BEGIN...ROLLBACK contra produção): a trigger
-- `trg_validar_tier_preco_menor_que_varejo` (20260901000000) só dispara em
-- INSERT/UPDATE de `precos_atacado`, nunca em UPDATE de `produtos.preco_varejo`.
-- Prova: produto com varejo=100 e tier(qtd>=10)=90; UPDATE produtos SET
-- preco_varejo=80 foi ACEITO sem erro; o tier de 90 permaneceu ativo; e
-- calcular_preco_produto(produto, 10) passou a devolver {tipo: ATACADO,
-- preco: 90} — MAIOR que o varejo (80).
--
-- Correção mínima: trigger simétrica em `produtos`, que rejeita um estado
-- final onde algum tier ATIVO do produto fica >= o varejo. Mesmo ERRCODE
-- (23514) e mesma filosofia da trigger irmã em precos_atacado — a invariante
-- "todo tier ativo < varejo" passa a valer nos dois sentidos de escrita.
--
-- Cenário A (tier >= varejo na criação/edição do tier) já é bloqueado pela
-- trigger 20260901000000 — não há alteração aqui.
--
-- CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED, não BEFORE UPDATE
-- simples (achado do gate de revisão pré-commit, provado contra produção
-- via BEGIN...ROLLBACK): o writer real `atualizar_produto_com_faixa_atacado`
-- (20260829120000_fase6_consolida_padrao_a_dono_global.sql) faz, na MESMA
-- transação, primeiro `UPDATE produtos SET preco_varejo = ...` e só DEPOIS
-- o `UPDATE`/upsert do tier (`precos_atacado`) — é assim que a tela de
-- editar produto deixa gerente/dono baixar varejo E tier juntos num único
-- salvamento. Uma trigger BEFORE UPDATE simples dispara no primeiro UPDATE,
-- quando o tier ainda está no valor ANTIGO, e rejeita uma edição
-- perfeitamente válida (ex.: varejo 100→80 e tier 90→70 juntos — estado
-- final consistente, mas o passo intermediário varejo=80/tier=90 não é).
-- Prova: reproduzindo essa exata sequência de dois UPDATEs numa transação,
-- a versão BEFORE simples rejeitava o primeiro UPDATE com
-- VAREJO_MENOR_OU_IGUAL_TIER_ATIVO mesmo o resultado final sendo válido.
-- DEFERRABLE INITIALLY DEFERRED adia a checagem para o commit da transação
-- (semântica padrão de constraint, igual a uma FK) — os dois UPDATEs
-- terminam e só então o estado FINAL é validado. Uma chamada isolada (só
-- `UPDATE produtos SET preco_varejo=...`, sem tocar o tier, o caso comum de
-- edição rápida) continua sendo sua própria transação implícita: o commit
-- dela é imediato, então o comportamento de rejeição continua idêntico ao
-- de uma trigger BEFORE para esse caso.
--
-- ROLLBACK: DROP TRIGGER trg_validar_varejo_maior_que_tiers_ativos ON public.produtos;

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_varejo_maior_que_tiers_ativos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier record;
BEGIN
  SELECT pa.id, pa.quantidade_minima, pa.preco_unitario INTO v_tier
  FROM public.precos_atacado pa
  WHERE pa.produto_id = NEW.id
    AND pa.ativo = true
    AND pa.preco_unitario >= NEW.preco_varejo
  ORDER BY pa.preco_unitario DESC
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'VAREJO_MENOR_OU_IGUAL_TIER_ATIVO: novo preco_varejo (%) ficaria <= tier ativo (qtd_min=%, preco=%) do produto %. Desative ou ajuste o tier antes de baixar o varejo.',
      NEW.preco_varejo, v_tier.quantidade_minima, v_tier.preco_unitario, NEW.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validar_varejo_maior_que_tiers_ativos() IS
  'Gate A04-4.2: rejeita (no commit da transação — constraint trigger deferrable) um preco_varejo final que deixaria algum tier ativo de precos_atacado >= o varejo (inversão de preço atacado > varejo). Espelha, do lado de produtos, a trigger trg_validar_tier_preco_menor_que_varejo (20260901000000). Deferrable: atualizar_produto_com_faixa_atacado atualiza varejo e tier em dois UPDATEs na mesma transação — checar de imediato rejeitaria o passo intermediário mesmo com o estado final válido.';

DROP TRIGGER IF EXISTS trg_validar_varejo_maior_que_tiers_ativos ON public.produtos;
CREATE CONSTRAINT TRIGGER trg_validar_varejo_maior_que_tiers_ativos
  AFTER UPDATE OF preco_varejo ON public.produtos
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.preco_varejo IS DISTINCT FROM OLD.preco_varejo)
  EXECUTE FUNCTION public.validar_varejo_maior_que_tiers_ativos();

COMMIT;
