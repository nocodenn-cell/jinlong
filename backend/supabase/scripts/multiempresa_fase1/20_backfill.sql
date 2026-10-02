-- Multiempresa Fase 1 — BACKFILL (ESCREVE). NÃO executar em produção sem autorização explícita.
--
-- Uso (transação única, aborta tudo em qualquer erro):
--   psql "$DB_URL" -1 -v ON_ERROR_STOP=1 -v empresa_nome='Nome do cliente' -f 20_backfill.sql
--
-- Cria a Empresa 1, vincula todas as lojas sem empresa a ela e cria um vínculo por usuário
-- DONO/GERENTE/OPERADOR espelhando `usuarios` (fonte de verdade continua `usuarios`, D17).
-- ADMIN legado é ignorado (D9). Idempotente: reexecutar não duplica nada.
--
-- O id fixo abaixo existe só para tornar o script idempotente. Código de aplicação NUNCA
-- deve referenciá-lo (D18: tenant não é escolhido por constante).

\if :{?empresa_nome}
\else
  \set empresa_nome 'Empresa 1 (migração multiempresa)'
\endif

SELECT set_config('fase1.empresa_nome', :'empresa_nome', false);

DO $backfill$
DECLARE
  c_empresa  constant uuid := 'e0000001-0000-4000-8000-000000000001';
  v_outras   integer;
  v_lojas    integer;
  v_vinc     integer;
  v_esperado integer;
BEGIN
  IF to_regclass('public.usuario_vinculos') IS NULL THEN
    RAISE EXCEPTION 'FASE1_BACKFILL: migration 20261003090000 não aplicada';
  END IF;

  -- Só roda em base de tenant único: qualquer outra empresa existente aborta.
  SELECT count(*) INTO v_outras FROM public.empresas WHERE id <> c_empresa;
  IF v_outras > 0 THEN
    RAISE EXCEPTION 'FASE1_BACKFILL: já existem % empresa(s) além da Empresa 1 — backfill de tenant único não se aplica', v_outras;
  END IF;

  INSERT INTO public.empresas (id, nome, plano, status, vigencia_inicio)
  VALUES (c_empresa, current_setting('fase1.empresa_nome'), 'PADRAO', 'ATIVA', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.lojas SET empresa_id = c_empresa WHERE empresa_id IS NULL;
  GET DIAGNOSTICS v_lojas = ROW_COUNT;

  INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo)
  SELECT u.id,
         c_empresa,
         CASE WHEN u.perfil = 'DONO' THEN NULL ELSE u.loja_id END,
         u.perfil,
         u.ativo
  FROM public.usuarios u
  WHERE u.perfil IN ('DONO', 'GERENTE', 'OPERADOR')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_vinc = ROW_COUNT;

  -- Asserções de equivalência (abortam a transação inteira).
  IF EXISTS (SELECT 1 FROM public.lojas WHERE empresa_id IS NULL) THEN
    RAISE EXCEPTION 'FASE1_BACKFILL: restou loja sem empresa';
  END IF;

  SELECT count(*) INTO v_esperado FROM public.usuarios WHERE perfil IN ('DONO', 'GERENTE', 'OPERADOR');
  IF (SELECT count(*) FROM public.usuario_vinculos WHERE empresa_id = c_empresa) <> v_esperado THEN
    RAISE EXCEPTION 'FASE1_BACKFILL: vínculos (%) ≠ usuários DONO/GERENTE/OPERADOR (%)',
      (SELECT count(*) FROM public.usuario_vinculos WHERE empresa_id = c_empresa), v_esperado;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.perfil IN ('DONO', 'GERENTE', 'OPERADOR')
      AND NOT EXISTS (
        SELECT 1 FROM public.usuario_vinculos v
        WHERE v.usuario_id = u.id AND v.empresa_id = c_empresa AND v.papel = u.perfil
          AND v.ativo = u.ativo
          AND v.loja_id IS NOT DISTINCT FROM CASE WHEN u.perfil = 'DONO' THEN NULL ELSE u.loja_id END)
  ) THEN
    RAISE EXCEPTION 'FASE1_BACKFILL: vínculo não espelha usuarios para algum usuário';
  END IF;

  IF EXISTS (SELECT 1 FROM public.usuario_vinculos v JOIN public.usuarios u ON u.id = v.usuario_id
             WHERE u.perfil = 'ADMIN') THEN
    RAISE EXCEPTION 'FASE1_BACKFILL: ADMIN legado recebeu vínculo (proibido, D9)';
  END IF;

  IF EXISTS (SELECT 1 FROM public.plataforma_admins) THEN
    RAISE EXCEPTION 'FASE1_BACKFILL: plataforma_admins deve continuar vazia na Fase 1';
  END IF;

  RAISE NOTICE 'FASE1_BACKFILL OK: lojas vinculadas agora=%, vínculos criados agora=%, vínculos totais=%',
    v_lojas, v_vinc, v_esperado;
END
$backfill$;
