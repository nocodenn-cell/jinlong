# Auditoria RPC SECURITY DEFINER executáveis por `authenticated`

Data: 2026-10-28 · Escopo: funções `SECURITY DEFINER` do schema `public` com `EXECUTE` para `authenticated` (132 funções; `internal.*` fora do alcance do PostgREST).
Método: enumeração no PGlite com as 439 migrations; triagem de corpos; matriz de acesso cruzado chamando cada RPC como três usuários da empresa A (gerente, operador, vendedora) com IDs reais da empresa B (loja, caixa, produto, venda, usuário, empresa); controle positivo e verificação de dependências antes de qualquer correção.
Ambiente: PGlite local. Não há homologação acessível nesta sessão, então os testes não rodaram em homologação. Produção não foi tocada.

## Resultado

| Classe | Qtde | Observação |
|---|---|---|
| **VULNERÁVEL (corrigida)** | 4 | `fp_empresa_da_loja`, `fp_empresa_operacional`, `fp_pdv_config_id`, `fp_mesma_empresa` revelavam dados da empresa B a um usuário da A. |
| **SEGURA** | 121 | Bloqueio por guarda de loja/empresa/perfil, ou retorno apenas do próprio escopo. |
| **NÃO VALIDADA** | 7 | Precisam de objeto da empresa B que o fixture não cria (ver lista). |

Total: 132.

## Vulnerabilidade corrigida

- **Comprovação:** usuário da empresa A chamou `fp_empresa_da_loja(loja_B)` e recebeu o id da empresa B. Também obteve `fp_empresa_operacional(empresa_B)` = `true` (empresa ativa), `fp_pdv_config_id(loja_B)` com o id da configuração de PDV, e `fp_mesma_empresa` como oráculo de pertencimento.
- **Gravidade:** baixa. Não há leitura de dados de negócio. Os valores são metadados, mas permitem enumeração entre tenants.
- **Correção:** migration `backend/supabase/migrations/20261028120000_revoga_helpers_tenant_authenticated.sql`. Remove EXECUTE de `PUBLIC`, `anon` e `authenticated`; mantém `service_role`. Os corpos não mudam.
- **Por que é seguro revogar:** todos os chamadores no banco são `SECURITY DEFINER` (verificado: zero chamadores `SECURITY INVOKER`), nenhuma view nem policy de RLS os usa, e nenhum código do app chama essas RPCs.
- **Regressão:** `backend/scripts/rpc-helpers-tenant-authenticated.test.mjs` (5 testes, passando). Suítes multiempresa 1, 3, 4, go-live-01, fiscal-rpc-loja-authz, financeiro, PDV/caixa e comissão mantiveram o mesmo resultado de antes. `multiempresa-fase2` e `fase5` continuam vermelhas pelos motivos já registrados, sem novas falhas.

## Verificado e considerado seguro

- **Guardas que bloqueiam (ACESSO_LOJA_NEGADO, SEM_PERMISSAO, FORBIDDEN, perfil):** `cancelar_venda_transacional`, `devolver_ou_trocar_venda`, `finalizar_venda_transacional_canonica_v4`, `registrar_movimentacao`, `registrar_liquidacao_receber`, `registrar_pagamento_contas_pagar`, `retomar_caixa_atomico`, `relatorio_consistencia_vendas_gerente`, `listar_vendas_gerente`, `kpis_*`, `marcar_comissoes_pagas`, `liquidar_comissoes`, `transferir_estoque_seguro`, `obter_estoque_disponivel_transferencia`, `fiscal_cancelar_documento`, `fiscal_enfileirar_documento_venda`, `fiscal_registrar_evento_enqueue_erro`, `pdv_registrar_alertas_margem_venda`, `registrar_pricing_version_venda`, `resetar_pin_operador_pdv`, `comissao_*` (relatórios, config, simulação, export), `reprocessar_comissao_venda`, `definir_vendedor_venda`, `import_*` (escrita e leitura por operação), `financeiro_*` (loja obrigatória), `pdv_diagnostico_pre_producao` (DONO/ADMIN).
- **Retorno apenas do próprio escopo:** `listar_caixas_elegiveis_desembolso`, `listar_vendas_em_espera`, `status_pin_equipe_pdv`, `minhas_comissoes`, `produtos_custos_autorizados` (com IDs de produto da B devolveu 0 linhas), `listar_vendedores_loja` (0 linhas), `financeiro_painel` (usa a loja do chamador), `obter_*`/`pdv_config_*` (config do chamador), `planos_catalogo` (catálogo público).
- **Auxiliares de autenticação e pertencimento:** `fp_pode_loja`, `fp_pode_empresa`, `fp_pode_modulo`, `fp_pode_loja_nula`, `fp_empresas_do_usuario`, `fp_lojas_cerca`, `fp_empresas_arr`, `fp_empresa_contexto`, `fp_empresa_contexto_modulo`, `fp_import_pode_*`, `auth_*`, `is_commercial_admin`, `fp_minha_assinatura`, `fp_minhas_faturas`. Com IDs da B devolvem `false`, vazio ou o próprio contexto. Não há valor da B.
- **Nota:** `fiscal_registrar_evento_enqueue_erro` com UUID de venda inexistente retorna sem gravar (o `internal` faz `RETURN` quando não acha documento). Não é escrita órfã.

## Risco aceito, documentado (não corrigido)

- **Perfil `ADMIN` legado tem escopo global.** `fp_pode_loja`, `fp_admin_legado`, `produtos_custos_autorizados`, `fiscal_*`, `ajustar_estoque_manual_seguro`, `transferir_estoque_entre_lojas`, `criar_produto_com_estoque_inicial`, `vincular_usuario_loja` e `plataforma_provisionar_empresa` dão acesso a todas as lojas quando `usuarios.perfil = 'ADMIN'`. Está documentado na migration `20261019120000` como "modo compatibilidade (Fases 1–5)", com remoção prevista no "Corte ADMIN". Testei: um ADMIN da empresa A lê o custo de produto da B (1 linha). Isso segue o modelo documentado, então não foi tratado como vulnerabilidade a corrigir agora.
- **Pendência:** não encontrei caminho de tenant para atribuir `ADMIN` (app e RPCs). Confirmar isso antes do Corte ADMIN.

## NÃO VALIDADA (7)

Retornam "não encontrado" com IDs da B, então a guarda não foi exercitada com objeto real da B:

- `converter_venda_em_espera`, `descartar_venda_em_espera`, `devolver_venda_em_espera`, `retomar_venda_em_espera` (precisam de venda em espera da B)
- `aprovar_movimentacao`, `cancelar_movimentacao` (precisam de movimentação de caixa da B)
- `fiscal_reprocessar_documento` (precisa de documento fiscal da B)

Próximo passo para fechar: criar esses objetos no fixture da B e repetir a matriz.

## Limitações

- Testes em PGlite, não em homologação nem no Supabase real. O comportamento de `ADMIN` e de privilégios padrão do Supabase pode diferir.
- A matriz cobre um usuário por perfil em A e objetos da B criados pelo fixture. Não testei combinações entre lojas da mesma empresa.
