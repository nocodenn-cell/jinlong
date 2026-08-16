-- Reaplica migração 102 (produtos_unique_codigo_loja) — DDL idempotente.
--
-- REGRA DE NEGÓCIO (determinada e documentada nesta sprint, 2026-08-16):
-- código de barras é único POR LOJA, não globalmente. Decisão já tomada na
-- migração 102 original: lojas diferentes deste ERP (matriz/filiais de um
-- mesmo cliente, ou clientes distintos no futuro) podem cadastrar produtos
-- importados com o MESMO GTIN/código de barras sem conflito — cada loja tem
-- seu próprio catálogo. Confirma-se lendo o próprio header da 102 ("Substitui
-- a constraint UNIQUE global em codigo_barras por uma constraint por-loja")
-- e o código de aplicação já escrito para essa regra: `produtoCodigoBarrasDuplicado.ts`
-- já busca duplicidade escopada por loja_id e formata a mensagem como
-- "já cadastrado NESTA LOJA" — a intenção sempre foi por-loja.
--
-- ACHADO (sprint de reconciliação, 2026-08-16): `supabase_migrations.schema_migrations`
-- já lista a versão "102" como aplicada, mas o schema ao vivo de produção
-- ainda reflete a constraint global antiga (`produtos_codigo_barras_key`,
-- da migração 001) — a constraint composta por-loja
-- (`produtos_codigo_barras_loja_unique`) nunca existiu de fato. Mesma classe
-- de drift já diagnosticada nesta sprint: migrations marcadas como aplicadas
-- na tabela de tracking sem efeito confirmado no schema real. A própria
-- migração 222 (`drop_indices_duplicados`) reforça essa suspeita: ela tentou
-- remover `idx_produtos_codigo_barras` alegando ser redundante com
-- `produtos_codigo_barras_key` — sinal de que a 102 nunca rodou de fato em
-- produção (senão a 102 já teria dropado essa constraint antes da 222 rodar).
--
-- Efeito concreto do bug: o código de detecção de duplicidade
-- (`isProdutosCodigoBarrasLojaUniqueViolation`) procura pelo nome da
-- constraint `produtos_codigo_barras_loja_unique` no erro do Postgres — que
-- nunca aparece, porque o erro real cita `produtos_codigo_barras_key`. Ou
-- seja: a mensagem amigável de duplicidade nunca dispara em produção, e a
-- unicidade hoje é global entre lojas (mais restritiva que o pretendido).
--
-- VERIFICAÇÃO DE DADOS (2026-08-16, antes de aplicar): 111 produtos com
-- codigo_barras preenchido, todos em 1 única loja em operação hoje, 0 pares
-- (loja_id, codigo_barras) duplicados. Como o conjunto atual já satisfaz a
-- constraint GLOBAL (mais restritiva), ele satisfaz trivialmente a
-- constraint por-loja (mais permissiva) — o índice composto pode ser criado
-- sem qualquer conflito ou necessidade de resolução manual de dados.
--
-- DDL abaixo é o conteúdo original da migração 102, sem alteração — todo
-- idempotente (IF EXISTS/IF NOT EXISTS), seguro para reaplicar mesmo que
-- parte já tenha efeito (loja_id já existe e já é NOT NULL em produção,
-- provavelmente via outra migração — os passos 1-3 serão no-op).

-- 1. Adicionar coluna (nullable para permitir backfill)
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS loja_id uuid REFERENCES public.lojas(id)
  DEFAULT 'a0000001-0000-4000-8000-000000000001'::uuid;

-- 2. Backfill de produtos existentes sem loja_id
UPDATE public.produtos
  SET loja_id = 'a0000001-0000-4000-8000-000000000001'::uuid
  WHERE loja_id IS NULL;

-- 3. NOT NULL após backfill
ALTER TABLE public.produtos
  ALTER COLUMN loja_id SET NOT NULL;

-- 4. Remover constraint global antiga
ALTER TABLE public.produtos
  DROP CONSTRAINT IF EXISTS produtos_codigo_barras_key;

-- 5. Criar índice único por loja (NULL permitido — produto sem barcode)
CREATE UNIQUE INDEX IF NOT EXISTS produtos_codigo_barras_loja_unique
  ON public.produtos (loja_id, codigo_barras)
  WHERE codigo_barras IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_loja_id
  ON public.produtos (loja_id);
