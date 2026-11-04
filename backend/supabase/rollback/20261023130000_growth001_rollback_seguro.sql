-- ROLLBACK SEGURO de 20261023130000_growth001_central_conversao
-- STATUS: PREPARADO PARA REVISÃO. NÃO APLICADO EM PRODUÇÃO.
--
-- O que faz: remove SOMENTE funções (RPCs e helpers) criadas pela Growth-001 e revoga o UPDATE
-- concedido a authenticated. Não faz DELETE, não remove colunas, constraints nem índice.
-- Resultado: o Hub volta a ler leads normalmente (/leads, detalhe, /clientes), mas /conversao e
-- o pedido de contratação do ERP voltam a falhar, como antes. ERP do teste grátis segue funcionando
-- (a chamada a commercial_trial_garantir_lead já é capturada e logada, não bloqueia o cadastro).
--
-- Dados preservados: leads (inclusive origem = teste_gratis), eventos (inclusive solicitacao e
-- conversao), clientes e saas.assinaturas / saas.assinatura_auditoria. Nada é apagado.
--
-- Para voltar a colunas/constraints exatamente como antes, use o arquivo separado
-- 20261023130000_growth001_rollback_colunas_guardado.sql (aborta se houver dados da Central).
--
-- Execução prevista (somente após autorização): psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f <este arquivo>
BEGIN;

DROP FUNCTION IF EXISTS public.commercial_solicitar_contratacao(text, text);
DROP FUNCTION IF EXISTS public.commercial_converter_trial(uuid, text, text[], int, int, text, int, text);
DROP FUNCTION IF EXISTS public.commercial_planos();
DROP FUNCTION IF EXISTS public.commercial_trials_listar(uuid);
DROP FUNCTION IF EXISTS public.commercial_trial_garantir_lead(uuid, text);
DROP FUNCTION IF EXISTS internal.commercial_valor_tabela(text, text[], int, int);
DROP FUNCTION IF EXISTS internal.commercial_trial_lead(uuid, text);
DROP FUNCTION IF EXISTS internal.commercial_protocolo();

REVOKE UPDATE (interesse, proximo_contato) ON public.commercial_leads FROM authenticated;

COMMIT;
