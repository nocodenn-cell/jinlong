-- Fase 2 (stub): fila de documento fiscal — sem integração SAT/Sefaz.
-- Fase 3: cliente + conta a receber + liquidação simples.

ALTER TABLE public.vendas DROP CONSTRAINT IF EXISTS vendas_forma_pagamento_check;

ALTER TABLE public.vendas
  ADD CONSTRAINT vendas_forma_pagamento_check CHECK (
    forma_pagamento IN (
      'DINHEIRO',
      'PIX',
      'CARTAO_DEBITO',
      'CARTAO_CREDITO',
      'FIADO'
    )
  );

CREATE TABLE IF NOT EXISTS public.documentos_fiscais_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  tipo_doc text NOT NULL DEFAULT 'NFC_E_STUB' CHECK (tipo_doc IN ('NFC_E_STUB', 'NFCE', 'NFE')),
  status text NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE', 'EMITIDO', 'ERRO', 'CANCELADO')),
  payload jsonb,
  ultimo_erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_fiscal_venda ON public.documentos_fiscais_pendentes (venda_id);

ALTER TABLE public.documentos_fiscais_pendentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doc_fiscal_gerente" ON public.documentos_fiscais_pendentes;
CREATE POLICY "doc_fiscal_gerente"
  ON public.documentos_fiscais_pendentes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

CREATE TABLE IF NOT EXISTS public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  documento text,
  telefone text,
  limite_credito numeric(12,2) NOT NULL DEFAULT 0 CHECK (limite_credito >= 0),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contas_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  venda_id uuid REFERENCES public.vendas(id),
  descricao text,
  valor_total numeric(12,2) NOT NULL CHECK (valor_total >= 0),
  valor_aberto numeric(12,2) NOT NULL CHECK (valor_aberto >= 0),
  vencimento date,
  status text NOT NULL DEFAULT 'ABERTO'
    CHECK (status IN ('ABERTO', 'PARCIAL', 'QUITADO', 'CANCELADO')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cr_cliente ON public.contas_receber (cliente_id);
CREATE INDEX IF NOT EXISTS idx_cr_status ON public.contas_receber (status);

CREATE TABLE IF NOT EXISTS public.liquidacoes_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo_id uuid NOT NULL REFERENCES public.contas_receber(id) ON DELETE CASCADE,
  valor numeric(12,2) NOT NULL CHECK (valor > 0),
  forma_pagamento text NOT NULL CHECK (
    forma_pagamento IN ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'OUTROS')
  ),
  observacao text,
  created_by uuid NOT NULL REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liquidacoes_receber ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_gerente" ON public.clientes;
CREATE POLICY "clientes_gerente"
  ON public.clientes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

DROP POLICY IF EXISTS "contas_receber_gerente" ON public.contas_receber;
CREATE POLICY "contas_receber_gerente"
  ON public.contas_receber FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

DROP POLICY IF EXISTS "liquidacoes_gerente" ON public.liquidacoes_receber;
CREATE POLICY "liquidacoes_gerente"
  ON public.liquidacoes_receber FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

CREATE OR REPLACE FUNCTION public.registrar_liquidacao_receber(
  p_titulo_id uuid,
  p_valor numeric,
  p_forma_pagamento text,
  p_observacao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_aberto numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'LIQUIDACAO_AUTH';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.perfil IN ('GERENTE', 'DONO')
  ) THEN
    RAISE EXCEPTION 'LIQUIDACAO_PERFIL';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'LIQUIDACAO_VALOR';
  END IF;

  SELECT c.valor_aberto INTO v_aberto
  FROM public.contas_receber c
  WHERE c.id = p_titulo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIQUIDACAO_TITULO';
  END IF;
  IF p_valor > v_aberto THEN
    RAISE EXCEPTION 'LIQUIDACAO_EXCEDE_ABERTO';
  END IF;

  INSERT INTO public.liquidacoes_receber (
    titulo_id, valor, forma_pagamento, observacao, created_by
  ) VALUES (
    p_titulo_id, p_valor, p_forma_pagamento, p_observacao, v_uid
  );

  UPDATE public.contas_receber c
  SET
    valor_aberto = c.valor_aberto - p_valor,
    status = CASE
      WHEN c.valor_aberto - p_valor <= 0.009 THEN 'QUITADO'::text
      ELSE 'PARCIAL'::text
    END
  WHERE c.id = p_titulo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_liquidacao_receber(uuid, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_liquidacao_receber(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_liquidacao_receber(uuid, numeric, text, text) TO service_role;
