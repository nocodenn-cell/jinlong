-- ============================================================================
-- aprovar_movimentacao: EXECUTE para `authenticated`
-- ============================================================================
-- `aprovar_movimentacao` deriva o solicitante de `auth.uid()` e exige que ele
-- seja o operador da movimentacao ou gerente/dono/admin da mesma loja
-- (MOV_CAIXA_APROVACAO_SOLICITANTE_SEM_PERMISSAO). Mas EXECUTE estava concedido
-- apenas a `service_role`, e a action chamava a RPC com o client de service
-- role -- onde `auth.uid()` e NULL, porque a chave de service role nao carrega
-- `sub`. Resultado: o guard `MOV_CAIXA_APROVACAO_AUTH` disparava SEMPRE e
-- nenhuma sangria acima do limite gerencial conseguia ser aprovada pelo PDV.
--
-- Reproduzido no PDV: sangria de R$ 210,00 (limite R$ 200,00) com senha de
-- gerente valida -> "Movimentacao pendente criada, mas a aprovacao falhou:
-- MOV_CAIXA_APROVACAO_AUTH", movimentacao presa em `pendente`.
--
-- Correcao: conceder EXECUTE a `authenticated`, alinhando com as RPCs irmas do
-- caixa (`registrar_movimentacao`, `cancelar_movimentacao`,
-- `estornar_movimentacao`, `fechar_caixa_atomico`), que ja seguem esse modelo.
-- A action passa a chamar com o client de sessao, para que `auth.uid()` seja o
-- operador real.
--
-- Seguranca inalterada: a funcao continua SECURITY DEFINER e mantem TODAS as
-- suas guardas internas -- token tipado obrigatorio, ligado a finalidade + alvo
-- + loja e de uso unico (`consumir_token_autorizacao_operacao`), aprovador
-- revalidado como gerente ativo da mesma loja, e solicitante restrito ao
-- operador da movimentacao ou a um gestor da loja. A autoridade e o TOKEN, nao
-- o chamador; expor a RPC a `authenticated` nao cria caminho novo de aprovacao.
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.aprovar_movimentacao(
  uuid, inet, text, text, text, uuid, text
) TO authenticated;
