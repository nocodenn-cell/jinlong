-- Migration: Autoria de criação/edição em `produtos`
--
-- PROBLEMA: diferente de estoque, vendas e caixa (que têm trilha de auditoria
-- própria em /admin/auditoria), o cadastro de produto não registra quem criou
-- nem quem editou pela última vez — só `created_at`/`updated_at` (timestamp
-- puro, sem autor).
--
-- SOLUÇÃO: duas colunas novas (`criado_por`, `atualizado_por`), preenchidas
-- automaticamente. `atualizado_por` via trigger BEFORE UPDATE lendo
-- `auth.uid()` — igual ao padrão já usado em `alterado_por` de
-- `historico_precos_produto` (migração 259). `criado_por` tem uma trigger
-- BEFORE INSERT de mesmo padrão como fallback (cobre inserts feitos com o
-- client de sessão do usuário), mas o caminho principal de criação
-- (`criar_produto_com_estoque_inicial`) roda como service_role — sem
-- `auth.uid()` no contexto — então `criado_por` fica NULL na própria RPC e é
-- preenchido por um UPDATE de acompanhamento feito pela camada de aplicação
-- logo após o create ter sucesso (`app/admin/produtos/productWriter.ts`),
-- usando o `p_ator_id` que a RPC já recebe explicitamente. Evita reabrir e
-- reeditar a RPC 289 (hardened, coberta por smoke de RLS) só por causa de um
-- campo de auditoria não-crítico.

-- ON DELETE SET NULL: sem isto, apagar um auth.users referenciado aqui falha
-- com foreign_key_violation (RESTRICT é o padrão) — inclusive para LGPD
-- (direito ao esquecimento). O fallback "usuário removido" da UI só faz
-- sentido se a exclusão do usuário for realmente possível.
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS criado_por uuid REFERENCES auth.users ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS atualizado_por uuid REFERENCES auth.users ON DELETE SET NULL;

COMMENT ON COLUMN public.produtos.criado_por IS
  'Quem criou o produto. NULL quando criado via RPC service_role sem o UPDATE de acompanhamento (produtos antigos, pré-migração).';
COMMENT ON COLUMN public.produtos.atualizado_por IS
  'Quem fez a última edição do produto — preenchido pela trigger trg_produtos_atualizado_por a cada UPDATE.';

CREATE OR REPLACE FUNCTION public.registrar_criado_por_produto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.criado_por IS NULL THEN
    NEW.criado_por := auth.uid();
  END IF;
  -- A criação também é "a primeira edição": sem isto, atualizado_por fica
  -- NULL até o primeiro UPDATE (só a trigger BEFORE UPDATE grava), e a UI
  -- mostraria "última edição por usuário removido" num produto recém-criado
  -- que ninguém editou ainda. Achado em teste multi-usuário no ambiente
  -- isolado (2026-08-16), antes de qualquer aplicação em remoto.
  IF NEW.atualizado_por IS NULL THEN
    NEW.atualizado_por := NEW.criado_por;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_produtos_criado_por ON public.produtos;
CREATE TRIGGER trg_produtos_criado_por
  BEFORE INSERT ON public.produtos
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_criado_por_produto();

CREATE OR REPLACE FUNCTION public.registrar_atualizado_por_produto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só sobrescreve quando há um ator de sessão real. NÃO usar
  -- COALESCE(auth.uid(), OLD.atualizado_por): isso reatribuiria o valor
  -- antigo mesmo quando outra coisa (ex.: o cascade ON DELETE SET NULL da FK,
  -- ao excluir o usuário referenciado) já colocou NULL em NEW antes desta
  -- trigger rodar — na prática desfazendo a exclusão do rastro. Achado em
  -- teste multi-usuário no ambiente isolado (2026-08-16): sem esta correção,
  -- apagar o usuário que fez a última edição não limpava atualizado_por.
  -- Sem sessão real (job interno etc.), simplesmente não mexe em NEW: para
  -- um UPDATE comum, NEW já começa como cópia de OLD, então o autor anterior
  -- é preservado sozinho, sem precisar reatribuir.
  IF auth.uid() IS NOT NULL THEN
    NEW.atualizado_por := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_produtos_atualizado_por ON public.produtos;
CREATE TRIGGER trg_produtos_atualizado_por
  BEFORE UPDATE ON public.produtos
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_atualizado_por_produto();
