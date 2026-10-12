CREATE TABLE lojas(id uuid PRIMARY KEY);
CREATE TABLE vendas(id uuid PRIMARY KEY, loja_id uuid NOT NULL REFERENCES lojas(id));
CREATE TABLE documentos_fiscais_pendentes(
  id uuid PRIMARY KEY,
  venda_id uuid NOT NULL REFERENCES vendas(id),
  status text NOT NULL
);
CREATE OR REPLACE FUNCTION public.fiscal_reprocessar_documento(p_documento_id uuid)
RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$;

ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas FORCE ROW LEVEL SECURITY;
ALTER TABLE documentos_fiscais_pendentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos_fiscais_pendentes FORCE ROW LEVEL SECURITY;

CREATE POLICY vendas_loja ON vendas
  USING (loja_id = nullif(current_setting('app.loja_id', true), '')::uuid);
CREATE POLICY fila_loja ON documentos_fiscais_pendentes
  USING (venda_id IN (
    SELECT id FROM vendas
    WHERE loja_id = nullif(current_setting('app.loja_id', true), '')::uuid
  ));

INSERT INTO lojas VALUES
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');
INSERT INTO vendas VALUES
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002');
INSERT INTO documentos_fiscais_pendentes VALUES
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000011', 'ERRO'),
  ('00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000012', 'ERRO');
