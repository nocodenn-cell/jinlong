-- Integridade: impede código de barras duplicado dentro da mesma loja.
-- Execução segura: exclui duplicatas via deduplicação antes de adicionar a constraint.
-- Mantém o produto mais recente (maior updated_at) em caso de duplicata.

DO $$
DECLARE
  dup RECORD;
BEGIN
  -- Para cada par (loja_id, codigo_barras) duplicado, inativa os mais antigos
  FOR dup IN
    SELECT loja_id, codigo_barras
    FROM public.produtos
    WHERE codigo_barras IS NOT NULL
    GROUP BY loja_id, codigo_barras
    HAVING COUNT(*) > 1
  LOOP
    UPDATE public.produtos
       SET codigo_barras = NULL
     WHERE (loja_id, codigo_barras) = (dup.loja_id, dup.codigo_barras)
       AND id NOT IN (
         SELECT id FROM public.produtos
          WHERE loja_id = dup.loja_id
            AND codigo_barras = dup.codigo_barras
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 1
       );
  END LOOP;
END;
$$;

-- Constraint UNIQUE por (loja_id, codigo_barras), ignorando NULLs naturalmente
ALTER TABLE public.produtos
  ADD CONSTRAINT produtos_codigo_barras_loja_uq
    UNIQUE (loja_id, codigo_barras);
