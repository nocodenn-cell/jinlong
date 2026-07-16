-- ============================================================
-- Migration 276 — CAPTURE de reconciliação (P0.1, 2ª varredura)
-- Versiona tabela `perfis` — órfã (0 usos no código do app; superada pela
-- coluna usuarios.perfil, que é o que o app realmente consulta). Existe em
-- produção (3 linhas) sem migration correspondente no repo. Captura fiel
-- de 2026-07-16, idempotente. NÃO é o fluxo oficial de permissões
-- (core/auth usa usuarios.perfil) — mantida por fidelidade ao estado real.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.perfis (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  loja_id uuid NOT NULL,
  perfil text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT perfis_pkey PRIMARY KEY (id),
  CONSTRAINT perfis_user_id_loja_id_key UNIQUE (user_id, loja_id),
  CONSTRAINT perfis_perfil_check CHECK (perfil = ANY (ARRAY['OPERADOR','GERENTE','ADMIN'])),
  CONSTRAINT perfis_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT perfis_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES public.lojas (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_perfis_loja_id ON public.perfis USING btree (loja_id);
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS perfis_select_policy ON public.perfis;
CREATE POLICY perfis_select_policy ON public.perfis FOR SELECT TO public
  USING ((SELECT auth.uid()) = user_id OR EXISTS (
    SELECT 1 FROM public.perfis p WHERE p.user_id = (SELECT auth.uid()) AND p.loja_id = perfis.loja_id AND p.perfil = ANY (ARRAY['GERENTE','ADMIN'])));
DROP POLICY IF EXISTS perfis_update_policy ON public.perfis;
CREATE POLICY perfis_update_policy ON public.perfis FOR UPDATE TO public
  USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS perfis_delete_policy ON public.perfis;
CREATE POLICY perfis_delete_policy ON public.perfis FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public.perfis p WHERE p.user_id = (SELECT auth.uid()) AND p.loja_id = perfis.loja_id AND p.perfil = ANY (ARRAY['GERENTE','ADMIN'])));
-- perfis_insert_policy em produção tem USING(-) sem WITH CHECK (equivalente a
-- permissivo/sem-checagem explícita) — captura fiel, não é recomendação de design.
DROP POLICY IF EXISTS perfis_insert_policy ON public.perfis;
CREATE POLICY perfis_insert_policy ON public.perfis FOR INSERT TO public
  WITH CHECK (true);
