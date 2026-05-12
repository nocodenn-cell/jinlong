-- Hardening mínimo (Opção 1): isolamento por loja na fila fiscal + RLS em idempotência de transferências.
-- ADMIN: visão global. GERENTE/DONO: apenas documentos cuja venda passa por caixa da mesma `usuarios.loja_id`.
-- OPERADOR: sem policies diretas na tabela (continua a usar RPCs). Sem função auxiliar exposta ao PostgREST.

-- ---------------------------------------------------------------------------
-- 1) transferencias_idempotencia: RLS + SELECT apenas das próprias linhas
-- ---------------------------------------------------------------------------

ALTER TABLE public.transferencias_idempotencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transferencias_idempotencia_self_select ON public.transferencias_idempotencia;
CREATE POLICY transferencias_idempotencia_self_select
  ON public.transferencias_idempotencia
  FOR SELECT
  TO authenticated
  USING (usuario_id = auth.uid());

COMMENT ON POLICY transferencias_idempotencia_self_select ON public.transferencias_idempotencia IS
  'Cada utilizador autenticado vê apenas os seus registros de idempotência; escrita via RPC SECURITY DEFINER.';

-- ---------------------------------------------------------------------------
-- 2) documentos_fiscais_pendentes: substituir FOR ALL por comandos + escopo loja (predicado inline)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "doc_fiscal_gerente" ON public.documentos_fiscais_pendentes;

CREATE POLICY doc_fiscal_pendentes_select_loja
  ON public.documentos_fiscais_pendentes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      INNER JOIN public.vendas v ON v.id = documentos_fiscais_pendentes.venda_id
      INNER JOIN public.caixas c ON c.id = v.caixa_id
      WHERE u.id = auth.uid()
        AND (
          u.perfil = 'ADMIN'
          OR (
            u.perfil IN ('GERENTE', 'DONO')
            AND c.loja_id = u.loja_id
          )
        )
    )
  );

CREATE POLICY doc_fiscal_pendentes_insert_loja
  ON public.documentos_fiscais_pendentes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      INNER JOIN public.vendas v ON v.id = venda_id
      INNER JOIN public.caixas c ON c.id = v.caixa_id
      WHERE u.id = auth.uid()
        AND (
          u.perfil = 'ADMIN'
          OR (
            u.perfil IN ('GERENTE', 'DONO')
            AND c.loja_id = u.loja_id
          )
        )
    )
  );

CREATE POLICY doc_fiscal_pendentes_update_loja
  ON public.documentos_fiscais_pendentes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      INNER JOIN public.vendas v ON v.id = documentos_fiscais_pendentes.venda_id
      INNER JOIN public.caixas c ON c.id = v.caixa_id
      WHERE u.id = auth.uid()
        AND (
          u.perfil = 'ADMIN'
          OR (
            u.perfil IN ('GERENTE', 'DONO')
            AND c.loja_id = u.loja_id
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      INNER JOIN public.vendas v ON v.id = venda_id
      INNER JOIN public.caixas c ON c.id = v.caixa_id
      WHERE u.id = auth.uid()
        AND (
          u.perfil = 'ADMIN'
          OR (
            u.perfil IN ('GERENTE', 'DONO')
            AND c.loja_id = u.loja_id
          )
        )
    )
  );

CREATE POLICY doc_fiscal_pendentes_delete_loja
  ON public.documentos_fiscais_pendentes
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      INNER JOIN public.vendas v ON v.id = documentos_fiscais_pendentes.venda_id
      INNER JOIN public.caixas c ON c.id = v.caixa_id
      WHERE u.id = auth.uid()
        AND (
          u.perfil = 'ADMIN'
          OR (
            u.perfil IN ('GERENTE', 'DONO')
            AND c.loja_id = u.loja_id
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 3) documentos_fiscais_eventos: SELECT com mesmo critério via documento pai
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "doc_fiscal_eventos_gerente_select" ON public.documentos_fiscais_eventos;

CREATE POLICY doc_fiscal_eventos_select_loja
  ON public.documentos_fiscais_eventos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.documentos_fiscais_pendentes d
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      INNER JOIN public.vendas v ON v.id = d.venda_id
      INNER JOIN public.caixas c ON c.id = v.caixa_id
      WHERE d.id = documentos_fiscais_eventos.documento_id
        AND (
          u.perfil = 'ADMIN'
          OR (
            u.perfil IN ('GERENTE', 'DONO')
            AND c.loja_id = u.loja_id
          )
        )
    )
  );

COMMENT ON POLICY doc_fiscal_pendentes_select_loja ON public.documentos_fiscais_pendentes IS
  'Leitura da fila fiscal restrita à loja do caixa da venda (ADMIN sem limite de loja).';

COMMENT ON POLICY doc_fiscal_eventos_select_loja ON public.documentos_fiscais_eventos IS
  'Timeline fiscal apenas para documentos no escopo de loja do utilizador (ADMIN global).';
