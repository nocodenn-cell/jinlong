-- Fase 1: remessas / movimentos (sem NF).
-- Fase 4: transferência entre lojas.

CREATE TABLE IF NOT EXISTS public.tipos_movimento_estoque (
  codigo text PRIMARY KEY,
  rotulo text NOT NULL,
  exige_gerente boolean NOT NULL DEFAULT true,
  permite_entrada boolean NOT NULL DEFAULT false,
  permite_saida boolean NOT NULL DEFAULT false
);

INSERT INTO public.tipos_movimento_estoque (codigo, rotulo, exige_gerente, permite_entrada, permite_saida)
VALUES
  ('ENTRADA_REMessa_LOJA', 'Entrada por remessa (outra loja / sem NF)', true, true, false),
  ('ENTRADA_AJUSTE', 'Entrada ajuste manual', true, true, false),
  ('SAIDA_AVARIA', 'Saída por avaria/perda', true, false, true),
  ('TRANSFERENCIA_SAIDA', 'Transferência — saída da loja origem', true, false, true),
  ('TRANSFERENCIA_ENTRADA', 'Transferência — entrada na loja destino', true, true, false)
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.remessas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  origem_descricao text NOT NULL,
  status text NOT NULL DEFAULT 'RASCUNHO'
    CHECK (status IN ('RASCUNHO', 'EM_CONFERENCIA', 'CONCLUIDA', 'CANCELADA')),
  observacao text,
  anexo_url text,
  created_by uuid NOT NULL REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_remessas_loja ON public.remessas (loja_id);
CREATE INDEX IF NOT EXISTS idx_remessas_status ON public.remessas (status);

CREATE TABLE IF NOT EXISTS public.remessa_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remessa_id uuid NOT NULL REFERENCES public.remessas(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  quantidade_esperada numeric(10,3) NOT NULL CHECK (quantidade_esperada >= 0),
  quantidade_conferida numeric(10,3) CHECK (quantidade_conferida IS NULL OR quantidade_conferida >= 0),
  divergencia_obs text,
  UNIQUE (remessa_id, produto_id)
);

CREATE TABLE IF NOT EXISTS public.movimentos_estoque_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  tipo_codigo text NOT NULL REFERENCES public.tipos_movimento_estoque(codigo),
  quantidade_delta numeric(10,3) NOT NULL,
  remessa_id uuid REFERENCES public.remessas(id),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  observacao text,
  anexo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mov_estoque_loja ON public.movimentos_estoque_log (loja_id);
CREATE INDEX IF NOT EXISTS idx_mov_estoque_prod ON public.movimentos_estoque_log (produto_id);

ALTER TABLE public.remessas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remessa_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentos_estoque_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_movimento_estoque ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tipos_mov_select" ON public.tipos_movimento_estoque;
CREATE POLICY "tipos_mov_select"
  ON public.tipos_movimento_estoque FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "remessas_gerente_all" ON public.remessas;
CREATE POLICY "remessas_gerente_all"
  ON public.remessas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

DROP POLICY IF EXISTS "remessa_itens_gerente_all" ON public.remessa_itens;
CREATE POLICY "remessa_itens_gerente_all"
  ON public.remessa_itens FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

DROP POLICY IF EXISTS "mov_estoque_log_gerente_all" ON public.movimentos_estoque_log;
CREATE POLICY "mov_estoque_log_gerente_all"
  ON public.movimentos_estoque_log FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

CREATE OR REPLACE FUNCTION public.confirmar_remessa_entrada(p_remessa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_it record;
  v_qtd numeric;
  v_tipo text := 'ENTRADA_REMessa_LOJA';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'REMESSA_AUTH';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.perfil IN ('GERENTE', 'DONO')
  ) THEN
    RAISE EXCEPTION 'REMESSA_PERFIL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.remessas rm0
    WHERE rm0.id = p_remessa_id AND rm0.status = 'EM_CONFERENCIA'
  ) THEN
    RAISE EXCEPTION 'REMESSA_STATUS_INVALIDO';
  END IF;

  FOR v_it IN
    SELECT i.produto_id,
           COALESCE(i.quantidade_conferida, i.quantidade_esperada) AS qtd
    FROM public.remessa_itens i
    WHERE i.remessa_id = p_remessa_id
  LOOP
    v_qtd := v_it.qtd;
    IF v_qtd IS NULL OR v_qtd <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.estoque (loja_id, produto_id, quantidade_atual, estoque_minimo)
    SELECT rm.loja_id, v_it.produto_id, v_qtd, 0
    FROM public.remessas rm
    WHERE rm.id = p_remessa_id
    ON CONFLICT (loja_id, produto_id) DO UPDATE
      SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
          version = public.estoque.version + 1,
          updated_at = now();

    INSERT INTO public.movimentos_estoque_log (
      loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id
    )
    SELECT
      rm.loja_id,
      v_it.produto_id,
      v_tipo,
      v_qtd,
      p_remessa_id,
      v_uid
    FROM public.remessas rm
    WHERE rm.id = p_remessa_id;
  END LOOP;

  UPDATE public.remessas
  SET status = 'CONCLUIDA', finalized_at = now()
  WHERE id = p_remessa_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_remessa_entrada(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirmar_remessa_entrada(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_remessa_entrada(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.transferir_estoque_entre_lojas(
  p_loja_origem uuid,
  p_loja_destino uuid,
  p_produto_id uuid,
  p_quantidade numeric,
  p_observacao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_atual numeric;
  v_ver integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'TRANSFERENCIA_AUTH';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.perfil IN ('GERENTE', 'DONO')
  ) THEN
    RAISE EXCEPTION 'TRANSFERENCIA_PERFIL';
  END IF;
  IF p_loja_origem = p_loja_destino THEN
    RAISE EXCEPTION 'TRANSFERENCIA_LOJA_IGUAL';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'TRANSFERENCIA_QTD';
  END IF;

  SELECT e.quantidade_atual, e.version INTO v_atual, v_ver
  FROM public.estoque e
  WHERE e.loja_id = p_loja_origem AND e.produto_id = p_produto_id
  FOR UPDATE;

  IF NOT FOUND OR v_atual < p_quantidade THEN
    RAISE EXCEPTION 'TRANSFERENCIA_ESTOQUE_INSUFICIENTE';
  END IF;

  UPDATE public.estoque e
  SET
    quantidade_atual = e.quantidade_atual - p_quantidade,
    version = e.version + 1,
    updated_at = now()
  WHERE e.loja_id = p_loja_origem
    AND e.produto_id = p_produto_id
    AND e.version = v_ver;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRANSFERENCIA_CONCORRENCIA';
  END IF;

  INSERT INTO public.movimentos_estoque_log (
    loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao
  ) VALUES (
    p_loja_origem,
    p_produto_id,
    'TRANSFERENCIA_SAIDA',
    -p_quantidade,
    NULL,
    v_uid,
    p_observacao
  );

  INSERT INTO public.estoque (loja_id, produto_id, quantidade_atual, estoque_minimo)
  VALUES (p_loja_destino, p_produto_id, p_quantidade, 0)
  ON CONFLICT (loja_id, produto_id) DO UPDATE
    SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
        version = public.estoque.version + 1,
        updated_at = now();

  INSERT INTO public.movimentos_estoque_log (
    loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao
  ) VALUES (
    p_loja_destino,
    p_produto_id,
    'TRANSFERENCIA_ENTRADA',
    p_quantidade,
    NULL,
    v_uid,
    p_observacao
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transferir_estoque_entre_lojas(uuid, uuid, uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transferir_estoque_entre_lojas(uuid, uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transferir_estoque_entre_lojas(uuid, uuid, uuid, numeric, text) TO service_role;
