-- 216 — Corrige drift da tabela marcas e unifica autorização em usuarios.
--
-- A migration 083 cria marcas com `ativo`/`updated_at` + trigger updated_at e política de escrita
-- via `usuarios`. Em produção houve drift: a tabela ficou só com (id, nome, created_at), o trigger
-- não existe e a política de escrita passou a depender de `perfis` (parcial, sem os DONOs).
-- O código (pdv-importados/app/gerente/produtos/actions.ts) consulta marcas.ativo, o que quebra.
-- Restaura o estado canônico da 083, de forma idempotente.

-- 1) Colunas ausentes
ALTER TABLE public.marcas ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;
ALTER TABLE public.marcas ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2) Índices (idempotentes)
CREATE INDEX IF NOT EXISTS idx_marcas_nome ON public.marcas (nome);
CREATE INDEX IF NOT EXISTS idx_marcas_ativo ON public.marcas (ativo) WHERE ativo = true;

-- 3) Trigger de updated_at (recria caso ausente)
DROP TRIGGER IF EXISTS marcas_updated_at ON public.marcas;
CREATE TRIGGER marcas_updated_at
  BEFORE UPDATE ON public.marcas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Autorização unificada em usuarios (remove variantes baseadas em perfis)
DROP POLICY IF EXISTS "marcas_write_gerente_dono_admin" ON public.marcas;
DROP POLICY IF EXISTS "marcas_escrita_gerencial" ON public.marcas;
CREATE POLICY "marcas_escrita_gerencial"
  ON public.marcas FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

-- Leitura permanece liberada a qualquer autenticado (idempotente)
DROP POLICY IF EXISTS "marcas_select_authenticated" ON public.marcas;
DROP POLICY IF EXISTS "marcas_leitura" ON public.marcas;
CREATE POLICY "marcas_leitura"
  ON public.marcas FOR SELECT
  TO authenticated
  USING (true);
