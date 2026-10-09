-- GO-LIVE: só DONO/ADMIN autoriza, e a atribuição passa a ser gravada pelo banco.
--
-- PROBLEMA (reproduzido em stack local, 2026-10-08): as políticas de implantacao_checklists
-- (migration 20260719032927) liberam INSERT/UPDATE a qualquer GERENTE da loja, em TODAS as colunas.
-- A regra "só DONO/ADMIN autoriza o GO-LIVE" existia apenas na Server Action
-- (`autorizarGoLiveAction`). Um GERENTE com o próprio token conseguia, direto na API, gravar
-- go_autorizado = true e go_autorizado_por = <qualquer usuário> (ex.: o DONO), contornando a regra
-- e forjando a trilha de quem autorizou.
--
-- CORREÇÃO: trigger BEFORE INSERT/UPDATE que
--   1. só permite alterar as colunas de autorização (go_autorizado, go_autorizado_em,
--      go_autorizado_por, go_observacao) a DONO ou ADMIN da loja (ADMIN: qualquer loja);
--   2. ao autorizar, IGNORA o que o cliente mandou em go_autorizado_por/go_autorizado_em e grava
--      auth.uid() e now() — a atribuição deixa de ser forjável;
--   3. não toca em mais nada: o GERENTE continua criando o cabeçalho e preenchendo os itens
--      (implantacao_checklist_itens e demais colunas do cabeçalho não mudam).
-- Sessões sem usuário (auth.uid() nulo: service_role, migrations, manutenção) passam como antes.
--
-- NÃO cobre (continua só na aplicação): o bloqueio por itens obrigatórios pendentes. O catálogo de
-- itens obrigatórios vive em TypeScript (implantacaoCatalog.ts); duplicá-lo em SQL criaria duas
-- fontes de verdade. Esta migration fecha a fronteira de PERFIL e de ATRIBUIÇÃO.
--
-- ROLLBACK (idempotente; só remove a proteção, não toca em dados):
--   DROP TRIGGER IF EXISTS trg_implantacao_checklists_proteger_go ON public.implantacao_checklists;
--   DROP FUNCTION IF EXISTS public.implantacao_checklists_proteger_go();

CREATE OR REPLACE FUNCTION public.implantacao_checklists_proteger_go()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pode boolean;
  v_mudou boolean;
BEGIN
  -- Sem usuário autenticado (service_role / manutenção): comportamento anterior.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_mudou := COALESCE(NEW.go_autorizado, false)
      OR NEW.go_autorizado_em IS NOT NULL
      OR NEW.go_autorizado_por IS NOT NULL
      OR NEW.go_observacao IS NOT NULL;
  ELSE
    v_mudou := (NEW.go_autorizado, NEW.go_autorizado_em, NEW.go_autorizado_por, NEW.go_observacao)
      IS DISTINCT FROM
      (OLD.go_autorizado, OLD.go_autorizado_em, OLD.go_autorizado_por, OLD.go_observacao);
  END IF;

  IF NOT v_mudou THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = v_uid
      AND u.ativo
      AND u.perfil IN ('DONO', 'ADMIN')
      AND (u.perfil = 'ADMIN' OR u.loja_id = NEW.loja_id)
  ) INTO v_pode;

  IF NOT v_pode THEN
    RAISE EXCEPTION 'GO_LIVE_SOMENTE_DONO_OU_ADMIN'
      USING ERRCODE = '42501',
            HINT = 'Somente DONO ou ADMIN da loja pode autorizar ou revogar o GO-LIVE.';
  END IF;

  -- Atribuição confiável: o banco decide quem e quando.
  IF COALESCE(NEW.go_autorizado, false) THEN
    NEW.go_autorizado_por := v_uid;
    NEW.go_autorizado_em := now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.implantacao_checklists_proteger_go() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_implantacao_checklists_proteger_go ON public.implantacao_checklists;
CREATE TRIGGER trg_implantacao_checklists_proteger_go
  BEFORE INSERT OR UPDATE ON public.implantacao_checklists
  FOR EACH ROW
  EXECUTE FUNCTION public.implantacao_checklists_proteger_go();

COMMENT ON FUNCTION public.implantacao_checklists_proteger_go() IS
  'GO-LIVE: só DONO/ADMIN da loja altera go_autorizado/_em/_por/_observacao; atribuição gravada pelo banco (auth.uid(), now()). Ver migration 20261009120000.';
