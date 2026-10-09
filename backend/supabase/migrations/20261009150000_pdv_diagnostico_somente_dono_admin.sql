-- Diagnóstico pré-produção do PDV: só DONO/ADMIN (alinha o banco à restrição já aplicada na UI).
--
-- PROBLEMA: a página/Server Action de Diagnóstico de Caixa passou a exigir DONO/ADMIN (PR #518), mas a
-- RPC `pdv_diagnostico_pre_producao` — o dado por trás dela — ainda aceita GERENTE no próprio banco.
-- Um GERENTE com o próprio token consegue chamá-la direto pela API e ler o checklist (grants, RPCs,
-- configuração, produto de teste). É leitura (STABLE), sem efeito colateral, mas é informação de
-- infraestrutura além do perfil que a tela permite.
--
-- CORREÇÃO: troca apenas a lista de perfis do guard (GERENTE, DONO, ADMIN -> DONO, ADMIN). Em vez de
-- recopiar a função inteira (e arriscar divergir do que está em produção), o bloco abaixo lê a
-- definição VIGENTE no banco, substitui exatamente essa cláusula e a recria. Aborta se a cláusula
-- não for encontrada exatamente uma vez (nada é alterado nesse caso). GRANTs são preservados
-- (CREATE OR REPLACE).
--
-- ROLLBACK (restaura o perfil GERENTE):
--   DO $r$ DECLARE d text; BEGIN
--     d := replace(pg_get_functiondef('public.pdv_diagnostico_pre_producao(text)'::regprocedure),
--                  $$u.perfil IN ('DONO', 'ADMIN')$$, $$u.perfil IN ('GERENTE', 'DONO', 'ADMIN')$$);
--     EXECUTE d; END $r$;

DO $mig$
DECLARE
  v_def text;
  v_novo text;
  v_ocorrencias int;
BEGIN
  v_def := pg_get_functiondef('public.pdv_diagnostico_pre_producao(text)'::regprocedure);

  v_ocorrencias := (length(v_def) - length(replace(v_def, $$u.perfil IN ('GERENTE', 'DONO', 'ADMIN')$$, '')))
                   / length($$u.perfil IN ('GERENTE', 'DONO', 'ADMIN')$$);
  IF v_ocorrencias <> 1 THEN
    RAISE EXCEPTION 'pdv_diagnostico_pre_producao: guard de perfil esperado 1x, encontrado %x — abortado sem alterar nada', v_ocorrencias;
  END IF;

  v_novo := replace(v_def, $$u.perfil IN ('GERENTE', 'DONO', 'ADMIN')$$, $$u.perfil IN ('DONO', 'ADMIN')$$);
  EXECUTE v_novo;
END
$mig$;

COMMENT ON FUNCTION public.pdv_diagnostico_pre_producao(text) IS
  'Checklist read-only pré-produção PDV: RPCs/grants/config/produto. DONO/ADMIN.';
