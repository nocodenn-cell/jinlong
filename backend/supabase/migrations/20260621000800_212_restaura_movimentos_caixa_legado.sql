-- Restaura a tabela legada public.movimentos_caixa.
--
-- Contexto / drift:
--   A migration 001 cria movimentos_caixa e a 045 faz backfill lendo dela (sem guarda),
--   logo a tabela existia quando 045 rodou. Nenhuma migration a dropa, mas no banco de
--   produção atual ela não existe mais (drop manual / restore parcial — schema fantasma).
--
-- Efeito do drift:
--   calcular_valor_sistema_dinheiro_caixa (053/116/atual) lê movimentos_caixa no CTE
--   mov_legado. Sem a tabela, o Postgres lança `relation "movimentos_caixa" does not exist`,
--   que a UI traduz como "Valor sistema (caixa): Falta alguma tabela ou função no banco de
--   dados." => fechamento de caixa quebrado para todos os operadores.
--
-- Fix:
--   Recriar a tabela vazia exatamente como na 001. Os movimentos legados antigos já foram
--   incorporados em caixas.saldo_atual no backfill da 045 e nenhum fluxo novo escreve aqui,
--   portanto a soma legada volta a ser 0 e o cálculo fica correto. Mudança não-destrutiva
--   (IF NOT EXISTS): se a tabela já existir em outro ambiente, esta migration é no-op.

CREATE TABLE IF NOT EXISTS public.movimentos_caixa (
  id uuid primary key default gen_random_uuid(),
  caixa_id uuid not null references public.caixas(id),
  tipo text not null check (tipo in ('VENDA', 'SANGRIA', 'SUPRIMENTO', 'DESCONTO_MANUAL')),
  valor numeric(10,2) not null,
  referencia_id uuid,
  observacao text,
  created_at timestamptz not null default now()
);

ALTER TABLE public.movimentos_caixa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "movimentos_gerente" ON public.movimentos_caixa;
CREATE POLICY "movimentos_gerente"
  ON public.movimentos_caixa FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

DROP POLICY IF EXISTS "movimentos_insert" ON public.movimentos_caixa;
CREATE POLICY "movimentos_insert"
  ON public.movimentos_caixa FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
