-- ============================================================================
-- M1 — Backfill controlado da empresa legada (ESPEC §12, etapa 2).
--
-- Idempotente: pode ser executado N vezes com o mesmo efeito de uma vez.
-- Não altera saldos, lançamentos, preços, estoque ou papéis legados.
-- Não promove ninguém a administrador de plataforma (ADMIN não recebe vínculo: D9).
-- Não atribui CNPJ: a empresa legada nasce com cnpj NULL.
--
-- Corte: lojas criadas DEPOIS do corte NÃO são associadas à empresa legada
-- automaticamente. Elas ficam sem empresa (fail closed) e são reportadas em
-- m1_backfill_excecoes, para decisão operacional explícita.
--
-- Exceções tratadas explicitamente (m1_backfill_excecoes):
--   ADMIN_SEM_VINCULO              — ADMIN legado (D9), inclusive conta técnica de teste (Anexo A)
--   LOJA_SEM_EMPRESA_POS_CORTE     — usuário cuja loja foi criada após o corte
--   LOJA_INEXISTENTE               — usuário apontando para loja inexistente
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.m1_backfill_controle (
  chave       text        PRIMARY KEY,
  valor       timestamptz NOT NULL,
  registrado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.m1_backfill_excecoes (
  id             bigserial   PRIMARY KEY,
  usuario_id     uuid        REFERENCES public.usuarios (id) ON DELETE CASCADE,
  loja_id        uuid,
  motivo         text        NOT NULL,
  detalhe        text,
  registrado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, loja_id, motivo)
);

ALTER TABLE public.m1_backfill_controle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m1_backfill_excecoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.m1_backfill_controle, public.m1_backfill_excecoes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.m1_backfill_controle, public.m1_backfill_excecoes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.m1_backfill_excecoes_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.m1_backfill_empresa_legada()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_empresa      uuid;
  v_corte        timestamptz;
  v_empresa_nova int := 0;
  v_lojas        int := 0;
  v_vinculos     int := 0;
  v_excecoes     int := 0;
  v_n            int;
  r              record;
BEGIN
  -- Corte: gravado na primeira execução e reutilizado nas seguintes (idempotência).
  SELECT valor INTO v_corte FROM public.m1_backfill_controle WHERE chave = 'corte_lojas';
  IF v_corte IS NULL THEN
    v_corte := now();
    INSERT INTO public.m1_backfill_controle (chave, valor) VALUES ('corte_lojas', v_corte);
  END IF;

  -- 1. Empresa legada única (sem CNPJ).
  SELECT id INTO v_empresa FROM public.empresas WHERE origem = 'LEGADA_M1';
  IF v_empresa IS NULL THEN
    INSERT INTO public.empresas (nome, origem, status)
    VALUES ('Empresa legada (migrada na M1)', 'LEGADA_M1', 'ATIVA')
    RETURNING id INTO v_empresa;
    v_empresa_nova := 1;
  END IF;

  -- 2. Lojas existentes no corte, ainda sem empresa.
  UPDATE public.lojas l
     SET empresa_id = v_empresa
   WHERE l.empresa_id IS NULL
     AND l.created_at <= v_corte;
  GET DIAGNOSTICS v_lojas = ROW_COUNT;

  -- 3. Vínculos derivados da fonte legada (usuarios). Sem duplicar.
  -- 3. DONO, GERENTE e OPERADOR: a empresa do vínculo é a empresa da loja legada do
  -- usuário (usuarios.loja_id). Nunca presumida: se a loja não tem empresa, é exceção.
  FOR r IN
    SELECT u.id AS usuario_id, u.perfil, u.loja_id, u.ativo, l.id AS loja_existe, l.empresa_id
      FROM public.usuarios u
      LEFT JOIN public.lojas l ON l.id = u.loja_id
     WHERE u.perfil IN ('DONO', 'GERENTE', 'OPERADOR')
  LOOP
    IF r.loja_existe IS NULL THEN
      INSERT INTO public.m1_backfill_excecoes (usuario_id, loja_id, motivo, detalhe)
      VALUES (r.usuario_id, r.loja_id, 'LOJA_INEXISTENTE', r.perfil)
      ON CONFLICT (usuario_id, loja_id, motivo) DO NOTHING;
      CONTINUE;
    END IF;
    IF r.empresa_id IS NULL THEN
      INSERT INTO public.m1_backfill_excecoes (usuario_id, loja_id, motivo, detalhe)
      VALUES (r.usuario_id, r.loja_id, 'LOJA_SEM_EMPRESA_POS_CORTE', r.perfil)
      ON CONFLICT (usuario_id, loja_id, motivo) DO NOTHING;
      CONTINUE;
    END IF;
    -- DONO: vínculo de empresa inteira (loja NULL); GERENTE/OPERADOR: vínculo de loja
    IF NOT EXISTS (
      SELECT 1 FROM public.usuario_vinculos v
       WHERE v.usuario_id = r.usuario_id AND v.empresa_id = r.empresa_id
         AND v.papel = r.perfil
         AND v.loja_id IS NOT DISTINCT FROM (CASE WHEN r.perfil = 'DONO' THEN NULL ELSE r.loja_id END)) THEN
      INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo, created_by)
      VALUES (r.usuario_id, r.empresa_id, CASE WHEN r.perfil = 'DONO' THEN NULL ELSE r.loja_id END, r.perfil, r.ativo, NULL);
      v_vinculos := v_vinculos + 1;
    END IF;
  END LOOP;

  -- 4. ADMIN legado: sem vínculo (D9). Registrado como exceção explícita.
  INSERT INTO public.m1_backfill_excecoes (usuario_id, loja_id, motivo, detalhe)
  SELECT u.id, u.loja_id, 'ADMIN_SEM_VINCULO', 'ADMIN legado não recebe vínculo; promoção a plataforma depende de D9'
    FROM public.usuarios u
   WHERE u.perfil = 'ADMIN'
  ON CONFLICT (usuario_id, loja_id, motivo) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_excecoes := v_excecoes + v_n;

  RETURN jsonb_build_object(
    'empresa_legada_id', v_empresa,
    'empresa_criada', v_empresa_nova,
    'lojas_associadas', v_lojas,
    'vinculos_criados', v_vinculos,
    'excecoes_novas', v_excecoes,
    'corte_lojas', v_corte,
    'divergencias', (SELECT count(*) FROM public.fp_divergencias_vinculos_legados())
  );
END
$$;

REVOKE ALL ON FUNCTION public.m1_backfill_empresa_legada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m1_backfill_empresa_legada() TO service_role;

-- Execução da própria migration (idempotente).
SELECT public.m1_backfill_empresa_legada();

COMMIT;
