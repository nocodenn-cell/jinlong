-- Dados complementares de funcionários (telefone/WhatsApp, CPF, cargo, admissão, observações).
-- ADITIVA e opcional: nova tabela 1:1 com public.usuarios, todas as colunas NULL.
-- Tabela separada (e não colunas em public.usuarios) porque operadores podem ler linhas
-- de usuarios da própria loja; assim o CPF fica isolado sob RLS só DONO/GERENTE da mesma empresa.
BEGIN;

CREATE TABLE IF NOT EXISTS public.funcionario_dados (
  usuario_id     uuid PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  empresa_id     uuid NOT NULL REFERENCES public.empresas(id),
  telefone       text NULL CHECK (telefone IS NULL OR telefone ~ '^[0-9+]{8,16}$'),
  cpf            text NULL CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$'),
  cargo          text NULL CHECK (cargo IS NULL OR char_length(cargo) <= 80),
  data_admissao  date NULL,
  observacoes    text NULL CHECK (observacoes IS NULL OR char_length(observacoes) <= 1000),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS funcionario_dados_cpf_empresa_uniq
  ON public.funcionario_dados (empresa_id, cpf) WHERE cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS funcionario_dados_empresa_idx ON public.funcionario_dados (empresa_id);

-- empresas onde o usuário logado é DONO ou GERENTE (SECURITY DEFINER evita recursão de RLS)
CREATE OR REPLACE FUNCTION public.fp_empresas_gerenciais_do_usuario()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT v.empresa_id
    FROM public.usuario_vinculos v
    JOIN public.usuarios u ON u.id = v.usuario_id
   WHERE v.usuario_id = (SELECT auth.uid()) AND v.ativo AND u.ativo
     AND v.papel IN ('DONO', 'GERENTE');
$$;
REVOKE ALL ON FUNCTION public.fp_empresas_gerenciais_do_usuario() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fp_empresas_gerenciais_do_usuario() TO authenticated, service_role;

-- empresa_id sempre igual à empresa do funcionário (não pode ser forjada)
CREATE OR REPLACE FUNCTION public.trg_fn_funcionario_dados_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_emp uuid;
BEGIN
  SELECT l.empresa_id INTO v_emp FROM public.usuarios u JOIN public.lojas l ON l.id = u.loja_id WHERE u.id = NEW.usuario_id;
  IF v_emp IS NULL THEN
    SELECT v.empresa_id INTO v_emp FROM public.usuario_vinculos v WHERE v.usuario_id = NEW.usuario_id AND v.ativo LIMIT 1;
  END IF;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'funcionario sem empresa'; END IF;
  NEW.empresa_id := v_emp;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trg_fn_funcionario_dados_empresa() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_funcionario_dados_empresa ON public.funcionario_dados;
CREATE TRIGGER trg_funcionario_dados_empresa
  BEFORE INSERT OR UPDATE ON public.funcionario_dados
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_funcionario_dados_empresa();

ALTER TABLE public.funcionario_dados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.funcionario_dados FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funcionario_dados TO authenticated;

-- Só DONO/GERENTE da mesma empresa. OPERADOR não lê nem o próprio registro pela API.
CREATE POLICY funcionario_dados_gerencial_select ON public.funcionario_dados
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT public.fp_empresas_gerenciais_do_usuario()));
CREATE POLICY funcionario_dados_gerencial_insert ON public.funcionario_dados
  FOR INSERT TO authenticated
  WITH CHECK (empresa_id IN (SELECT public.fp_empresas_gerenciais_do_usuario()));
CREATE POLICY funcionario_dados_gerencial_update ON public.funcionario_dados
  FOR UPDATE TO authenticated
  USING (empresa_id IN (SELECT public.fp_empresas_gerenciais_do_usuario()))
  WITH CHECK (empresa_id IN (SELECT public.fp_empresas_gerenciais_do_usuario()));
CREATE POLICY funcionario_dados_gerencial_delete ON public.funcionario_dados
  FOR DELETE TO authenticated
  USING (empresa_id IN (SELECT public.fp_empresas_gerenciais_do_usuario()));

COMMENT ON TABLE public.funcionario_dados IS 'Dados complementares opcionais de funcionários; CPF restrito a DONO/GERENTE da mesma empresa.';
COMMIT;
