-- PROPOSTA FASE 3.1 (NÃO APLICADA). Substitui o corpo de internal.plataforma_provisionar_empresa_nucleo.
-- Testada localmente em transação (ROLLBACK). Ver docs/ops/FASE3_1_PENDENCIAS_TECNICAS.md §1.
BEGIN;
CREATE OR REPLACE FUNCTION internal.plataforma_provisionar_empresa_nucleo(p jsonb, p_ator uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_emp uuid;
  v_loja jsonb; v_usr jsonb; v_chave text;
  v_lojas jsonb := '{}'::jsonb;
  v_loja_id uuid; v_codigo text; v_papel text; v_primeira uuid;
  v_max_lojas int; v_max_usuarios int; n int;
  v_donos int := 0;
BEGIN
  IF p IS NULL OR jsonb_typeof(p->'empresa') <> 'object' OR jsonb_typeof(p->'lojas') <> 'array'
     OR jsonb_typeof(p->'usuarios') <> 'array' THEN
    RAISE EXCEPTION 'PROVISIONAR_PAYLOAD_INVALIDO';
  END IF;
  n := jsonb_array_length(p->'lojas');
  IF n < 1 THEN RAISE EXCEPTION 'PROVISIONAR_SEM_LOJA'; END IF;
  v_max_lojas := nullif(p->'empresa'->>'max_lojas', '')::int;
  v_max_usuarios := nullif(p->'empresa'->>'max_usuarios', '')::int;
  IF v_max_lojas IS NOT NULL AND n > v_max_lojas THEN RAISE EXCEPTION 'PROVISIONAR_LIMITE_LOJAS'; END IF;
  IF v_max_usuarios IS NOT NULL AND jsonb_array_length(p->'usuarios') > v_max_usuarios THEN
    RAISE EXCEPTION 'PROVISIONAR_LIMITE_USUARIOS';
  END IF;

  INSERT INTO public.empresas (nome, razao_social, cnpj, plano, max_lojas, max_usuarios)
  VALUES (btrim(p->'empresa'->>'nome'), nullif(btrim(p->'empresa'->>'razao_social'), ''),
          nullif(regexp_replace(coalesce(p->'empresa'->>'cnpj', ''), '[^0-9]', '', 'g'), ''),
          coalesce(nullif(p->'empresa'->>'plano', ''), 'PILOTO'), v_max_lojas, v_max_usuarios)
  RETURNING id INTO v_emp;

  FOR v_loja IN SELECT * FROM jsonb_array_elements(p->'lojas') LOOP
    v_chave := coalesce(nullif(v_loja->>'chave', ''), v_loja->>'nome');
    IF v_lojas ? v_chave THEN RAISE EXCEPTION 'PROVISIONAR_LOJA_DUPLICADA'; END IF;
    v_codigo := upper(nullif(btrim(v_loja->>'codigo'), ''));
    -- código global ainda é UNIQUE (D11): prefixa com o início do id da empresa em caso de colisão.
    IF v_codigo IS NOT NULL AND EXISTS (SELECT 1 FROM public.lojas WHERE codigo = v_codigo) THEN
      v_codigo := v_codigo || '-' || upper(left(replace(v_emp::text, '-', ''), 6));
    END IF;
    INSERT INTO public.lojas (nome, codigo, ativo, empresa_id)
    VALUES (btrim(v_loja->>'nome'), v_codigo, true, v_emp)
    RETURNING id INTO v_loja_id;
    v_lojas := v_lojas || jsonb_build_object(v_chave, v_loja_id);
  END LOOP;

  FOR v_usr IN SELECT * FROM jsonb_array_elements(p->'usuarios') LOOP
    v_papel := v_usr->>'papel';
    IF v_papel NOT IN ('DONO', 'GERENTE', 'OPERADOR') THEN RAISE EXCEPTION 'PROVISIONAR_PAPEL_INVALIDO'; END IF;
    IF v_papel = 'DONO' THEN
      v_donos := v_donos + 1;
      -- legado: usuarios.loja_id do DONO = primeira loja da empresa
      v_primeira := (v_lojas->>coalesce(nullif(p->'lojas'->0->>'chave', ''), p->'lojas'->0->>'nome'))::uuid;
    ELSE
      IF jsonb_typeof(v_usr->'lojas') <> 'array' OR jsonb_array_length(v_usr->'lojas') < 1 THEN
        RAISE EXCEPTION 'PROVISIONAR_USUARIO_SEM_LOJA';
      END IF;
      IF v_papel = 'OPERADOR' AND jsonb_array_length(v_usr->'lojas') > 1 THEN
        RAISE EXCEPTION 'PROVISIONAR_OPERADOR_UMA_LOJA';
      END IF;
      v_primeira := (v_lojas->>(v_usr->'lojas'->>0))::uuid;
      IF v_primeira IS NULL THEN RAISE EXCEPTION 'PROVISIONAR_LOJA_DESCONHECIDA'; END IF;
    END IF;

    -- usuário já vinculado a outra empresa ⇒ recusa (sessão é de uma empresa, §4/§9)
    -- FASE 3.1: usuário já existente não é reatribuído por provisionamento (ON CONFLICT reescreveria perfil/loja).
    IF EXISTS (SELECT 1 FROM public.usuarios WHERE id = (v_usr->>'id')::uuid)
       OR EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = (v_usr->>'id')::uuid AND ativo AND empresa_id <> v_emp)
       OR EXISTS (SELECT 1 FROM public.usuarios WHERE id = (v_usr->>'id')::uuid AND perfil = 'ADMIN') THEN
      RAISE EXCEPTION 'PROVISIONAR_USUARIO_DE_OUTRA_EMPRESA';
    END IF;

    INSERT INTO public.usuarios (id, nome, perfil, idioma_preferido, loja_id, ativo)
    VALUES ((v_usr->>'id')::uuid, btrim(v_usr->>'nome'), v_papel, coalesce(nullif(v_usr->>'idioma', ''), 'pt'), v_primeira, true)
    ON CONFLICT (id) DO UPDATE
      SET nome = EXCLUDED.nome, perfil = EXCLUDED.perfil, idioma_preferido = EXCLUDED.idioma_preferido,
          loja_id = EXCLUDED.loja_id, ativo = true;
    -- trigger criou o vínculo principal; GERENTE multi-loja recebe os demais aqui.
    IF v_papel = 'GERENTE' THEN
      FOR v_chave IN SELECT jsonb_array_elements_text(v_usr->'lojas') LOOP
        v_loja_id := (v_lojas->>v_chave)::uuid;
        IF v_loja_id IS NULL THEN RAISE EXCEPTION 'PROVISIONAR_LOJA_DESCONHECIDA'; END IF;
        INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, created_by)
        VALUES ((v_usr->>'id')::uuid, v_emp, v_loja_id, 'GERENTE', p_ator)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;

  IF v_donos < 1 THEN RAISE EXCEPTION 'PROVISIONAR_SEM_DONO'; END IF;

  RETURN jsonb_build_object('empresa_id', v_emp, 'lojas', v_lojas);
END $$;
