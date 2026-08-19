# Auditoria de código morto — backend e frontend

**Data:** 2026-08-19
**Base:** `origin/main` em `54b84851` (pós PR [#309](https://github.com/nocodenn-cell/fastproduct/pull/309)) + Fase 1B deste branch
**Produção:** projeto `jinlong`, consultas **somente leitura**
**Status:** ✅ **EXECUTADO em 2026-08-19** — 10 funções SQL + **48** módulos frontend removidos.

> ## ⚠️ Duas correções a esta auditoria, feitas na hora de executar
>
> **1. Eram 53 candidatos frontend, não 54.** A varredura original cruzou os imports
> de apenas `app/`, `components/`, `lib/` e `hooks/`. O pacote tem **mais 13 diretórios**
> (`core/`, `e2e/`, `scripts/`, `src/`, `stores/`, `stories/`, `tests/`, `types/`, …) e
> **8 arquivos `.ts` na raiz**. Refeita com a superfície completa — 3.687 specifiers
> contra 3.326 —, **`lib/admin/auth/middlewareSupabase.ts` saiu da lista**: é importado
> por `middleware.ts`, na raiz do pacote. **Não era código morto**, e teria sido removido
> por um furo do método original.
>
> **2. Cinco arquivos foram SEGURADOS**, apesar da autorização ter sido "todos".
> `tests/consolidacao-post-audit.test.ts` contém um teste chamado, literalmente,
> *"componentes gerente órfãos marcados @legacy (não apagar até validação)"*. É uma
> decisão humana versionada que **esta lista não mencionava** quando foi enviada para
> aprovação — ou seja, a autorização foi dada sem esse dado. Ver §E.

Total removido: **48 de 53**. Os 5 restantes aguardam decisão explícita.

---

## Método

**Backend (funções SQL).** Para cada função em `public` (excluídas as de extensão via
`pg_depend`), foi medido em produção se ela é: função de trigger; referenciada no corpo de
outra função (`pg_get_functiondef`); citada em `pg_trigger`, `pg_policies`, `pg_views`,
`pg_constraint` ou `pg_attrdef`. As sobreviventes foram cruzadas com todas as chamadas
`.rpc()` do `pdv-importados`, do `pdv-local`, das Edge Functions e dos scripts de
`backend/scripts`.

Referências que aparecem **apenas** em `database.types.ts` não contam como consumo — o
arquivo é gerado a partir do schema, então toda função aparece nele por construção. É
justamente o que faz uma função morta parecer viva num `grep` ingênuo.

**`pg_cron` foi verificado:** a extensão está instalada e `cron.job` está **vazio**. Nenhuma
função é chamada por agendamento.

**Frontend.** Os 608 módulos `.ts`/`.tsx` de `app/`, `components/`, `lib/` e `hooks/` foram
cruzados com os 3.326 specifiers de import do próprio app. Entrypoints do App Router
(`page`, `layout`, `route`, `template`, `loading`, `error`, `not-found`, `default`,
`middleware`, …) foram excluídos por não serem importados por ninguém — o Next.js os resolve
por convenção de arquivo. Cada candidato passou por uma segunda verificação, por nome de
módulo e por caminho de barril, para eliminar falso-positivo de substring.

---

## A. Backend — remoção segura recomendada

Nenhum consumidor em lugar algum: não é trigger, não é chamada por outra função, não aparece
em policy, view, constraint ou default, não tem `.rpc()` no código, e não há agendamento.

### A.1 CRUD de `funcionarios_meta` — nunca consumido

Seis funções da migration `20260711143312_267_funcionarios_meta_crud.sql`. Aparecem
**somente** em `database.types.ts`.

| Função | Observação |
|---|---|
| `fn_criar_funcionario(8 args)` | — |
| `fn_atualizar_funcionario(6 args)` | — |
| `fn_desativar_funcionario(uuid)` | — |
| `fn_listar_funcionarios_gerente(3 args)` | — |
| `resumo_comissoes_por_funcionario(3 args)` | não confundir com `resumo_comissoes_por_operador`, que **é** consumida |
| `total_vendas_por_funcionario(3 args)` | — |

> **O repositório já sabia disso.** Quatro delas foram alvo de
> `20260731201500_revoke_anon_authenticated_funcoes_sem_uso_publico.sql` — uma migration cujo
> próprio nome diz "funções sem uso público". O passo seguinte, remover, nunca foi dado.

**Cuidado ao remover:** a tela de funcionários do gerente usa `funcionarios_meta` por outros
caminhos. É o CRUD via RPC que está morto, **não a tabela**.

### A.2 Conferência de recebimento — sem consumidor

| Função | Origem | Observação |
|---|---|---|
| `registrar_conferencia_nfe(2 args)` | `20260805213357_296_nfe_conferencia.sql` | — |
| `registrar_conferencia_remessa(3 args)` | `20260801120000_recebimento_conferencia_explicita.sql` | já catalogada como 🟡 sem consumidor na auditoria de catálogo §3.3; **não existe em produção** |

### A.3 Helpers órfãos

| Função | Observação |
|---|---|
| `venda_eventos_items_from_payload(jsonb)` | par de `venda_eventos_items_from_sale`, que **é** chamada 2×. Esta não é chamada por ninguém. |
| `decrementar_estoque_idempotente(3 args)` | shim legado: a `070` fez com que delegue a `decrementar_estoque_seguro` e a `071` removeu `EXECUTE` de `authenticated`. `pdv-importados/core/sync/TAURI_SYNC.md` documenta que a `sync-outbox` migrou para `decrementar_estoque_seguro`. **Risco residual:** um binário antigo do `pdv-local` em campo ainda poderia chamá-la. Remover só depois de confirmar que não há cliente desatualizado. |

---

## B. Backend — NÃO remover (aparecem como órfãs, mas não são)

Registrado explicitamente porque uma varredura automática as classificaria como mortas.

| Função | Por que fica |
|---|---|
| `verificar_consistencia_venda(uuid)` | Diagnóstico operacional. Sem consumidor por **desenho** — restrita a `service_role` justamente para não ser alcançável pelo app. **GATE 9** existe para provar que ela permanece fechada. |
| `relatorio_consistencia_vendas(4 args)` | Idem. |
| `transferir_estoque_entre_lojas(5 args)` | Sem consumidor no app (o app usa `transferir_estoque_seguro`), mas é exercitada por **3 das 42 regras** de `test:rls-scope`. Removê-la reduz a cobertura de autorização. Decisão de teste, não de código morto. |
| `caixa_integridade_gate_check()`, `listar_valores_sistema_dinheiro_caixas(uuid[])`, `shadow_validar_venda_engine_v4(jsonb)` | Existem **só em produção** — nenhuma migration do repositório as cria. Removê-las é DDL em produção, item **1B-5** da Fase 1B, não limpeza de repositório. |

---

## C. Backend — achado que NÃO é código morto: um reaper que nunca rodou

> ### 🟠 `fiscal_reaper_documentos(p_timeout_minutos, p_max_tentativas)` nunca foi agendada

Criada por `20260806135429_307_d3_reaper_fiscal_em_processamento.sql` para recuperar
documentos fiscais presos em `EM_PROCESSAMENTO` — a garantia de que um worker que morre no
meio não deixa documento travado para sempre.

**Ela não é chamada por nada.** Não há `.rpc()` no código, não há workflow no
`.github/`, e `cron.job` em produção está **vazio**.

Isto não é código morto — é uma **salvaguarda operacional inerte**. Apagá-la seria a decisão
errada: o correto é agendá-la. Enquanto isso não acontece, documento fiscal preso em
`EM_PROCESSAMENTO` fica preso indefinidamente, e ninguém é avisado.

Hoje o dano é nulo porque o fiscal está em `stub`. Arma junto com o fiscal real.

**Recomendação:** não remover; abrir item de backlog para agendar (pg_cron ou workflow).

---

## D. Frontend — 54 módulos nunca importados

Nenhum dos 54 é importado por rota, componente, teste ou barril. Verificados um a um.

### D.1 🔴 Sobras da migração `/gerente` → `/admin` (24 arquivos)

**Achado estrutural:** `app/gerente/` tem **4** `page.tsx`, contra **28** em `app/admin/`. O
que restou em `app/gerente/[...path]/page.tsx` é um catch-all que redireciona tudo para
`/admin` via `legacyGerenteRedirect`. **As rotas do gerente não existem mais.**

Os arquivos abaixo são clientes de página cujo `page.tsx` foi removido na migração. São
componentes React completos, órfãos de rota — o maior bloco de código morto do repositório.

```
app/gerente/atividades/AtividadesPageClient.tsx
app/gerente/categorias-financeiras/CategoriasFinanceirasPageClient.tsx
app/gerente/categorias-produtos/CategoriasProdutosPageClient.tsx
app/gerente/comissoes/ComissoesPageClient.tsx
app/gerente/compras/ComprasGerentePageClient.tsx
app/gerente/configuracoes/ConfiguracoesClient.tsx
app/gerente/configuracoes/ConfiguracoesGerentePageClient.tsx
app/gerente/dashboard-actions.ts
app/gerente/features/FeatureToggle.tsx
app/gerente/financeiro/FinanceiroGerentePageClient.tsx
app/gerente/produtos/ProdutosGerentePageClient.tsx
app/gerente/produtos/produtoGerenteListagemDefaults.ts
app/gerente/relatorios/RelatoriosGerentePageClient.tsx
app/gerente/relatorios/estoque/RelatorioEstoqueClient.tsx
app/gerente/relatorios/sem-giro/RelatoriosSemGiroPageClient.tsx
app/gerente/relatorios/vendas/RelatorioVendasClient.tsx
app/gerente/suspensao/SuspensaoPageClient.tsx
app/gerente/vendas/VendasGerenteListClient.tsx
components/gerente/DashboardHeader.tsx
components/gerente/ExportCsvButton.tsx
components/gerente/GerenteNavLink.tsx
components/gerente/GerentePageZone.tsx
components/gerente/GerenteRouteLoading.tsx
components/gerente/produtos/ProdutosToolbar.tsx
```

⚠️ **Verificar antes de apagar:** alguns diretórios contêm `actions.ts` que **continua vivo**
(importado pelas telas de `/admin`). Remover o `PageClient` sem tocar no `actions.ts` do mesmo
diretório. Ex.: `app/gerente/comissoes/` tem `actions.ts` **e** `actions.test.ts` ativos.

### D.2 Forks legados de UI, já substituídos

| Arquivo | Substituto |
|---|---|
| `components/ui/StatCard.tsx` | `components/ui/admin-v2/MetricCard.tsx`, que exporta `StatCard = MetricCard`. O comentário do próprio MetricCard diz: *"Substitui forks legados (ui/MetricCard, gerente/MetricCard, StatCard)"*. |
| `components/forms/FormField.tsx` | shim de reexport de `@/components/ui/forms/Field`; ninguém importa o shim |
| `components/gerente/Sparkline.tsx` | — |
| `components/branding/Logo.tsx` | — |
| `components/caixa/CaixaLoadingStates.tsx` | — |
| `components/forms/PendingSubmitButton.tsx` | — |
| `components/ui/ClientOnly.tsx` | — |

### D.3 Barris nunca importados (5)

Nenhum import de `@/lib/admin/auth`, `@/lib/admin/context`, `@/lib/admin/policy`,
`@/lib/gerente/auth` nem `@/hooks` — o código importa os módulos internos direto.

```
hooks/index.ts
lib/admin/auth/index.ts
lib/admin/context/index.ts
lib/admin/policy/index.ts
lib/gerente/auth/index.ts
```

⚠️ Apagar **só o `index.ts`**, nunca o diretório — os módulos vizinhos estão vivos.

### D.4 Módulos avulsos (18)

```
app/admin/financeiro/_components/FinanceiroTabNav.tsx
app/admin/financeiro/_components/ReprocessarDocumentoButton.tsx
app/caixa/CaixaFooter.tsx
app/caixa/CaixaMovimentacoesTimeline.tsx
app/caixa/CaixaPdvOperacoesButtons.tsx
app/caixa/server/caixaGerenteValidation.types.ts
hooks/useAccessibility.ts
lib/adapters/supabase/produtoRepository.ts
lib/admin/auth/middlewareSupabase.ts
lib/auth/gerenteOuDono.ts
lib/format/fmtQuantidadeEstoque.ts
lib/gerente/caixaRowDerivados.ts
lib/gerente/dashboardMetaConfig.ts
lib/gerente/produtoExclusaoLote.ts
lib/navigation/adminSidebarNav.ts
lib/navigation/financeiroHubNav.ts
lib/supabase/financialRpcContract.ts
lib/tokens/rechartThemes.ts
```

⚠️ **Dois merecem olhar antes:** `lib/supabase/financialRpcContract.ts` (nome sugere contrato
de RPC financeira — se for documentação executável de contrato, o valor não é o import) e
`app/admin/financeiro/_components/ReprocessarDocumentoButton.tsx` (chama
`fiscal_reprocessar_documento`, que **é** consumida em `app/gerente/financeiro/actions.ts`;
pode ser UI planejada e não ligada).

---

## Resumo

| Grupo | Itens | Recomendação |
|---|---:|---|
| A — funções SQL sem consumidor | 10 | remover, com as ressalvas de A.3 |
| B — parecem órfãs, não são | 6 | **manter** |
| C — reaper nunca agendado | 1 | **manter e agendar** |
| D — módulos frontend órfãos | 54 | remover, com as ressalvas de D.1/D.3/D.4 |

**Maior achado:** os 24 arquivos de D.1 — a migração `/gerente` → `/admin` levou as rotas e
deixou os clientes de página para trás.

**Nada foi removido.** Aguardando autorização.

### Se autorizado, a ordem sugerida

1. **D.1, D.2, D.3** — frontend puro, risco baixo, verificável por `build` + `typecheck`.
2. **D.4**, depois de olhar os dois itens marcados.
3. **A.1 e A.2** — uma migration de `DROP FUNCTION`, guardada por `to_regprocedure`, seguida
   de `db reset` + `test:rls-scope` + gates financeiros + regeneração de `database.types.ts`.
4. **A.3** — só depois de confirmar que não há `pdv-local` desatualizado em campo.

Para o item C, abrir tarefa de agendamento em vez de remoção.


---

## E. Os 5 arquivos segurados

`tests/consolidacao-post-audit.test.ts` marca estes cinco como `@legacy` e o nome do
teste diz **"não apagar até validação"**:

```
app/gerente/compras/ComprasGerentePageClient.tsx
app/gerente/financeiro/FinanceiroGerentePageClient.tsx
app/gerente/produtos/ProdutosGerentePageClient.tsx
app/gerente/relatorios/RelatoriosGerentePageClient.tsx
app/gerente/vendas/VendasGerenteListClient.tsx
```

**A validação que o guard esperava provavelmente já aconteceu:** `app/gerente/` tem 4
`page.tsx` contra 28 em `app/admin/`, e `app/gerente/[...path]/page.tsx` redireciona
tudo via `legacyGerenteRedirect`. As rotas não existem, e nada importa estes arquivos.

Mesmo assim não foram removidos. Sobrescrever um "não apagar" escrito por uma pessoa
merece o "sim" de uma pessoa — ainda mais na véspera do treinamento do cliente #1.

**Para removê-los**, além dos 5 arquivos é preciso apagar o bloco de teste que os
protege (`tests/consolidacao-post-audit.test.ts`, describe *"consolidação pós-audit —
guarda SSoT"*), senão a suíte quebra.

---

## F. Guards atualizados, não enfraquecidos

Dois testes asseveravam a existência de arquivos removidos. Nenhum foi simplesmente
apagado:

| Teste | O que mudou |
|---|---|
| `tests/p0-venda-homologacao.matrix.test.ts` | Apontava para `FinanceiroTabNav.tsx`. Verificado que a nav **viva** é `components/ui/admin-v2/FinanceiroHubNavShell.tsx` (o `page.tsx` importa `parseFinanceiroTab` de `financeiroTabs.ts`; o shell renderiza). O guard passou a apontar para o arquivo que de fato implementa a feature — **deixou de ser vácuo**. |
| `app/caixa/caixaSemCadastroProduto.test.ts` | Varre superfícies do caixa que não podem reintroduzir o modal de cadastro relâmpago. `CaixaFooter.tsx` saiu da lista porque o arquivo deixou de existir; as demais seguem varridas. |

---

## G. Validação da remoção

Em banco reconstruído do zero (`db reset`):

- **10 removidas, 0 já ausentes** (a migration reporta cada uma por `NOTICE`)
- `test:rls-scope` — **42/42**
- `FINANCIAL ADVERSARIAL GATES: OK`
- `verificacao-pos-apply.sql` — **0 falhas**, ledger **311** (constante atualizada junto)
- `check:types-drift` — **OK**, 6222 linhas
- **nenhum import pendurado** após as 48 remoções; nenhum dos 5 barris era importado como diretório

**Não verificado localmente:** `build` e `typecheck` do frontend — `node_modules` não está
instalado neste worktree. Fica para o CI.
