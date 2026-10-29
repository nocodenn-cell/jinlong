-- ============================================================================
-- G14 — Transferência entre lojas só move produto equivalente confirmado.
--
-- PROBLEMA: transferir_estoque_seguro usava o mesmo produto_id na origem e no destino.
-- Produtos cadastrados em duplicidade por loja (mesmo item, ids diferentes) podiam
-- gerar estoque no destino com um produto de outra loja.
--
-- SOLUÇÃO (ajustada no PR #648 após revisão: a regra anterior bloqueava o catálogo da
-- empresa da fase 5, em que o mesmo produto_id vale em todas as lojas):
--  1. produto_equivalencias: tradução explícita (produto da origem -> produto da loja
--     destino), criada só por DONO/GERENTE com vínculo às duas lojas (critério MANUAL).
--     Sem vínculo automático por código de barras (só sugestão futura).
--  2. Trigger valida: produtos existem, produto destino é da loja destino, lojas
--     distintas, mesma empresa.
--  3. Transferência: sem equivalência, o destino usa o mesmo produto_id (catálogo da
--     empresa, já limitado a mesma empresa por fp_assert_produto/fp_assert_mesma_empresa).
--     Com equivalência confirmada, o destino usa produto_destino_id.
--
-- Impacto: sem mudança de dados. Transferências existentes e o catálogo compartilhado
-- seguem como antes. Só a duplicidade por loja precisa de equivalência cadastrada.
-- Rollback: 20261029150000_g14_..._rollback.sql
-- ============================================================================

BEGIN;

-- 1. Tabela ------------------------------------------------------------------
CREATE TABLE public.produto_equivalencias (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid        NOT NULL REFERENCES public.empresas(id),
  produto_origem_id  uuid        NOT NULL REFERENCES public.produtos(id),
  loja_destino_id    uuid        NOT NULL REFERENCES public.lojas(id),
  produto_destino_id uuid        NOT NULL REFERENCES public.produtos(id),
  criterio           text        NOT NULL CHECK (criterio IN ('MANUAL')),
  confirmado_por     uuid        NOT NULL REFERENCES public.usuarios(id),
  confirmado_em      timestamptz NOT NULL DEFAULT now(),
  ativo              boolean     NOT NULL DEFAULT true,
  CONSTRAINT produto_equivalencias_uniq UNIQUE (produto_origem_id, loja_destino_id)
);

COMMENT ON TABLE public.produto_equivalencias IS
  'G14: produto equivalente entre lojas para transferência. Criado só por RPC (critério MANUAL), validado por trigger.';

-- 2. Validação de integridade -------------------------------------------------
CREATE OR REPLACE FUNCTION internal.tg_produto_equivalencias_valida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE
  v_loja_origem uuid;
  v_loja_prod_destino uuid;
  v_emp_origem uuid;
  v_emp_destino uuid;
BEGIN
  SELECT p.loja_id INTO v_loja_origem FROM public.produtos p WHERE p.id = NEW.produto_origem_id;
  SELECT p.loja_id INTO v_loja_prod_destino FROM public.produtos p WHERE p.id = NEW.produto_destino_id;
  IF v_loja_origem IS NULL OR v_loja_prod_destino IS NULL THEN
    RAISE EXCEPTION 'PE_PRODUTO_INEXISTENTE';
  END IF;
  IF v_loja_origem = NEW.loja_destino_id THEN
    RAISE EXCEPTION 'PE_LOJA_IGUAL';
  END IF;
  IF v_loja_prod_destino <> NEW.loja_destino_id THEN
    RAISE EXCEPTION 'PE_PRODUTO_DESTINO_OUTRA_LOJA';
  END IF;
  SELECT l.empresa_id INTO v_emp_origem FROM public.lojas l WHERE l.id = v_loja_origem;
  SELECT l.empresa_id INTO v_emp_destino FROM public.lojas l WHERE l.id = NEW.loja_destino_id;
  IF v_emp_origem IS NULL OR v_emp_origem <> v_emp_destino OR v_emp_origem <> NEW.empresa_id THEN
    RAISE EXCEPTION 'PE_EMPRESA_DIVERGENTE';
  END IF;
  RETURN NEW;
END
$f$;

REVOKE ALL ON FUNCTION internal.tg_produto_equivalencias_valida() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_produto_equivalencias_valida
  BEFORE INSERT OR UPDATE ON public.produto_equivalencias
  FOR EACH ROW EXECUTE FUNCTION internal.tg_produto_equivalencias_valida();

-- 3. RLS e grants (escrita só pela RPC) ---------------------------------------
ALTER TABLE public.produto_equivalencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.produto_equivalencias FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.produto_equivalencias TO authenticated;
CREATE POLICY produto_equivalencias_select ON public.produto_equivalencias
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT public.fp_empresas_do_usuario()));

-- 4. RPC de registro (DONO/GERENTE com vínculo às duas lojas) -----------------
CREATE OR REPLACE FUNCTION public.produto_equivalencia_registrar(
  p_produto_origem uuid, p_loja_destino uuid, p_produto_destino uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $f$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_origem uuid;
  v_emp uuid;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'PE_AUTH'; END IF;
  SELECT u.perfil INTO v_perfil FROM public.usuarios u WHERE u.id = v_uid AND u.ativo;
  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO') THEN
    RAISE EXCEPTION 'PE_PERFIL';
  END IF;
  SELECT p.loja_id INTO v_loja_origem FROM public.produtos p WHERE p.id = p_produto_origem;
  IF v_loja_origem IS NULL THEN RAISE EXCEPTION 'PE_PRODUTO_INEXISTENTE'; END IF;
  IF NOT (public.fp_usuario_pode_loja(v_uid, v_loja_origem, ARRAY['GERENTE', 'DONO'])
          AND public.fp_usuario_pode_loja(v_uid, p_loja_destino, ARRAY['GERENTE', 'DONO'])) THEN
    RAISE EXCEPTION 'PE_LOJA_NEGADA';
  END IF;
  SELECT l.empresa_id INTO v_emp FROM public.lojas l WHERE l.id = v_loja_origem;
  INSERT INTO public.produto_equivalencias (
    empresa_id, produto_origem_id, loja_destino_id, produto_destino_id, criterio, confirmado_por
  ) VALUES (
    v_emp, p_produto_origem, p_loja_destino, p_produto_destino, 'MANUAL', v_uid
  )
  ON CONFLICT (produto_origem_id, loja_destino_id) DO UPDATE
    SET produto_destino_id = EXCLUDED.produto_destino_id,
        criterio = 'MANUAL',
        confirmado_por = EXCLUDED.confirmado_por,
        confirmado_em = now(),
        ativo = true
  RETURNING id INTO v_id;
  RETURN v_id;
END
$f$;

REVOKE ALL ON FUNCTION public.produto_equivalencia_registrar(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.produto_equivalencia_registrar(uuid, uuid, uuid) TO authenticated, service_role;

-- 5. Transferência: produto da origem e produto equivalente no destino --------
DO $g14$
DECLARE
  v_def text;
  v_n int;
  v_ancora_decl text := E'  v_dummy numeric;\n';
  v_ancora_lock text := E'  -- Lock deterministico para reduzir risco de deadlock entre concorrencias cruzadas.\n';
  v_guarda text := E'  -- G14: catálogo da empresa usa o mesmo produto_id nas lojas (fase 5). Equivalência\n'
    || E'  -- confirmada só traduz produto cadastrado em duplicidade numa loja; sem ela, vale o mesmo id.\n'
    || E'  SELECT pe.produto_destino_id INTO v_produto_destino\n'
    || E'    FROM public.produto_equivalencias pe\n'
    || E'   WHERE pe.produto_origem_id = p_produto_id AND pe.loja_destino_id = p_loja_destino AND pe.ativo;\n'
    || E'  v_produto_destino := COALESCE(v_produto_destino, p_produto_id);\n\n';
BEGIN
  v_def := pg_get_functiondef('internal.transferir_estoque_seguro(uuid,uuid,uuid,numeric,text,text,numeric)'::regprocedure);

  -- Âncoras de substituição: cada uma precisa aparecer exatamente o número esperado de vezes.
  v_n := (length(v_def) - length(replace(v_def, v_ancora_decl, ''))) / length(v_ancora_decl);
  IF v_n <> 1 THEN RAISE EXCEPTION 'G14: âncora DECLARE encontrada % vezes', v_n; END IF;
  v_n := (length(v_def) - length(replace(v_def, v_ancora_lock, ''))) / length(v_ancora_lock);
  IF v_n <> 1 THEN RAISE EXCEPTION 'G14: âncora LOCK encontrada % vezes', v_n; END IF;

  v_def := replace(v_def, v_ancora_decl, v_ancora_decl || E'  v_produto_destino uuid;\n');
  v_def := replace(v_def, v_ancora_lock, v_guarda || v_ancora_lock);

  -- Lock do destino passa a usar o produto destino (2 ocorrências: uma em cada ramo do lock)
  v_n := (length(v_def) - length(replace(v_def, 'WHERE e.loja_id = p_loja_destino AND e.produto_id = p_produto_id', ''))) / length('WHERE e.loja_id = p_loja_destino AND e.produto_id = p_produto_id');
  IF v_n <> 2 THEN RAISE EXCEPTION 'G14: lock do destino encontrado % vezes', v_n; END IF;
  v_def := replace(v_def, 'WHERE e.loja_id = p_loja_destino AND e.produto_id = p_produto_id', 'WHERE e.loja_id = p_loja_destino AND e.produto_id = v_produto_destino');

  -- Estoque e movimento de entrada do destino
  v_n := (length(v_def) - length(replace(v_def, 'VALUES (p_loja_destino, p_produto_id, p_quantidade, 0)', ''))) / length('VALUES (p_loja_destino, p_produto_id, p_quantidade, 0)');
  IF v_n <> 1 THEN RAISE EXCEPTION 'G14: insert do destino encontrado % vezes', v_n; END IF;
  v_def := replace(v_def, 'VALUES (p_loja_destino, p_produto_id, p_quantidade, 0)', 'VALUES (p_loja_destino, v_produto_destino, p_quantidade, 0)');

  -- Movimento de entrada: a forma em linhas (sem a migration de movimentos_estoque_log) ou a forma em uma linha
  -- (com ela, que grava transferencia_id). Só uma das duas pode existir na função.
  v_n := (length(v_def) - length(replace(v_def, E'    p_loja_destino,\n    p_produto_id,\n', ''))) / length(E'    p_loja_destino,\n    p_produto_id,\n');
  IF v_n = 1 THEN
    v_def := replace(v_def, E'    p_loja_destino,\n    p_produto_id,\n', E'    p_loja_destino,\n    v_produto_destino,\n');
  ELSE
    v_n := (length(v_def) - length(replace(v_def, 'p_loja_destino, p_produto_id, ''TRANSFERENCIA_ENTRADA''', ''))) / length('p_loja_destino, p_produto_id, ''TRANSFERENCIA_ENTRADA''');
    IF v_n <> 1 THEN RAISE EXCEPTION 'G14: movimento de entrada do destino encontrado % vezes', v_n; END IF;
    v_def := replace(v_def, 'p_loja_destino, p_produto_id, ''TRANSFERENCIA_ENTRADA''', 'p_loja_destino, v_produto_destino, ''TRANSFERENCIA_ENTRADA''');
  END IF;

  EXECUTE v_def;
END
$g14$;

DO $prova$
BEGIN
  IF position('G14: catálogo da empresa usa o mesmo produto_id' IN pg_get_functiondef('internal.transferir_estoque_seguro(uuid,uuid,uuid,numeric,text,text,numeric)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'G14 PROVA FAIL';
  END IF;
END
$prova$;

NOTIFY pgrst, 'reload schema';
COMMIT;
