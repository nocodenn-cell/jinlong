# GO-LIVE-01 — Relatório de integração Jinlong

Data da auditoria: 2026-10-10.  
Branch de trabalho: `sprint/go-live-01`.  
Base: `origin/main` @ `a39a530986447c2b608ad409c469267f35141744`.  
Escopo executado: leitura de GitHub, Vercel e catálogo Supabase. Nenhuma escrita em produção, staging, merge na `main` ou deploy manual.

Decisão: **NO-GO**.

O painel em produção continua no ar. O conjunto código publicado + banco de produção não está coerente: a correção das RPCs fiscais já está no Git e passa no teste local, e o catálogo de produção ainda executa os corpos antigos.

## 1. GitHub

`git fetch --prune origin` em 2026-10-10. A `main` local e `origin/main` apontam para o mesmo commit. Não há commit da `main` sem push.

| Ref | SHA | Relação |
|---|---|---|
| `main` / `origin/main` | `a39a530986447c2b608ad409c469267f35141744` | Merge do PR #531 em 2026-10-09 18:47:38 -0300 |
| `sprint/go-live-01` | parte de `a39a5309`; upstream removido de propósito | não rastreia `origin/main`, para o push não cair na `main` |

Branches locais com commits não enviados ao upstream delas (não são a `main`):

| Branch | Upstream | Divergência |
|---|---|---|
| `recovery/ux443-rebase` | `origin/claude/jinlong-ux-audit-4ab5be` | ahead 54, behind 26 |
| `feat/pr2d-caixas-elegiveis-rpc` | `origin/feat/pr2d-caixas-elegiveis-rpc` | ahead 32, behind 1 |
| `codex/pdv-pagamentos-desconto` | `origin/codex/pdv-pagamentos-desconto` | ahead 2 |

O prune removeu branches remotas já mergeadas (`chore/gates-n1`, `feat/n1-protecao-preco-custo`, `sec/implantacao-go-live-authz`, a série `ux/pr*`, entre outras). Worktrees e arquivos `_wt-*` / `AGENTS.md` estavam untracked no diretório de trabalho e ficaram de fora desta branch.

## 2. Pull requests

### Pilha de capacidade (#529–#534)

Todas são draft, sem review, e o GitHub marca `MERGEABLE` / `CLEAN` contra a base **delas**, não contra uma integração já validada na `main`.

| PR | Base | Head | CI | Recomendação |
|---|---|---|---|---|
| [#529](https://github.com/nocodenn-cell/fastproduct/pull/529) | `main` | `cursor/capacidade-resiliencia-fase1-010e` @ `cbc08bcb` | Actions verdes (docs; `build-and-test` ~3s). `pdv-importados` cancelado pelo Ignored Build Step. `jinlong-site` concluiu. | Manter draft. Não entra no go-live. Só documentação e esqueleto k6. |
| [#530](https://github.com/nocodenn-cell/fastproduct/pull/530) | branch do #529 | `cursor/stg-01-homologacao-isolada-010e` | Sem GitHub Actions (a base não é `main`). Vercel dos dois projetos: cancelado pelo ignore. | Não mergear. O diff de scripts/docs reaparece no #533. |
| [#532](https://github.com/nocodenn-cell/fastproduct/pull/532) | branch do #530 | `cursor/stg-01-reassessment-migrations-010e` | Idem #530. ~20 mil linhas, a maior parte em `docs/capacity/staging/repair-prep/`. | Não mergear. Redundante com o #533. |
| [#533](https://github.com/nocodenn-cell/fastproduct/pull/533) | branch do #529 | `cursor/stg-01-al1-capacity-local-010e` | Idem. Inclui os arquivos do #530 e do #532 mais o stack local `fastproduct-capacity`. | Candidato único da linha de capacidade, depois de rebase na `main` e CI de verdade. Fora desta sprint. |
| [#534](https://github.com/nocodenn-cell/fastproduct/pull/534) | branch do #533 | `cursor/cap-02-k6-progressive-010e` | Idem. k6 T00–T05. | Só depois do #533. Não executar carga nem o ensaio de 12 h. |

Ordem se a linha de capacidade for aprovada mais tarde: **#529 → rebase do #533 na `main` → #534**. Fechar #530 e #532 como supersedidos pelo #533. Não mergear os cinco.

### Outros PRs abertos (não integrar nesta sprint)

Há dezenas de PRs abertos anteriores a 2026-10-09. Vários estão `CONFLICTING` (#485, #487, #488, #493, #495, #496, #498, #499, #500). #502–#505 falham `e2e-playwright` e o check `Vercel – jinlong-site`. #491 (`feat/site-comercial-bilingue-v1`) ficou para trás: o site entrou na `main` pelo #507 (`19f05be5`). Não rebaseei nem fechei esses PRs.

## 3. Vercel

Time `jinlong` (NatureCode). Conta CLI autenticada. AgeGuard fora do escopo.

| Projeto | Root Directory | Build / install | Produção agora |
|---|---|---|---|
| `pdv-importados` | `pdv-importados` | `npm run build` / `npm ci`, Node 24 | **READY** `dpl_DbrwZ7G4dWe6isCfQpVEg9rwyv1U`, criado 2026-10-09 18:47:43 -0300, no mesmo instante do merge `a39a5309`. Alias `https://www.jinlong.app` respondeu **307** para `/login`. |
| `jinlong-site` | `site` | `npm run build` / `npm ci`, Node 24. `ignoreCommand`: `sh scripts/vercel-ignore.sh` (`site/vercel.json`) | Último deployment de produção consultado, `dpl_B9afcX9x7t5BeQBbd2cconpYh3Dg`, **Canceled**. No commit `a39a5309` o GitHub registra `Vercel – jinlong-site` = success, descrição **Skipped - Not affected**. |

O cancelamento é o contrato do Ignored Build Step (exit 0 = não construir). No `pdv-importados` os previews de branch saem como **Canceled by Ignored Build Step** e o check fica verde. No `jinlong-site`, push na `main` que não altera `site/`, `package.json`, `package-lock.json` nem `.npmrc` também é ignorado. O último site que **construiu** foi o #507, commit `19f05be5`: os dois projetos Vercel em `Deployment has completed`. O alias `https://jinlong-site-jinlong.vercel.app` respondeu **302** para o SSO da Vercel.

Não há falha de build de produção para corrigir. Não reativei previews do ERP: um preview com env de produção apontaria para o banco real. O `vercel.json` da raiz do monorepo não é o que esses dois projetos leem (cada um tem Root Directory próprio). Nenhuma configuração remota foi alterada.

## 4. Supabase (somente leitura)

| Projeto | Ref | Estado | Ledger |
|---|---|---|---|
| Produção `jinlong` | `kbabmewnahysfvlybiak` | `ACTIVE_HEALTHY`, Postgres 17 | **396** linhas em `supabase_migrations.schema_migrations`. Maior `version`: **`20261009140739`** (`revoga_leitura_direta_preco_custo_fase_b`). |
| Staging `jinlong-staging` | `tarxrbxddcwvjkimkbnr` | `ACTIVE_HEALTHY`, criado 2026-10-09 | **339** linhas. Maior `version`: **`20261010000342`**, `name` = `20261001100400_c3_devolver_retry_autorizacao`. |
| AgeGuard | — | fora do escopo | — |

As versões remotas de produção não coincidem com o prefixo do arquivo quando a aplicação foi via MCP. Os pares já registrados em `backend/supabase/migration-human-gates.json` cobrem o N1, o diagnóstico e o GO-LIVE. Esta sessão não executou `db push`, `migration repair`, `apply_migration` nem SQL de escrita.

### O que está coerente em produção

- N1 fase A `20261009135940` / arquivo `20261009180000`.
- N1 fase B `20261009140739` / arquivo `20261009180001`. É a última versão do ledger.
- View `public.produtos_custos` existe com `security_invoker=off`. Isso é o desenho da fase A (`backend/supabase/migrations/20261009180000_protege_preco_custo_operador.sql`, linhas 50–62): a view é do dono e a autorização é o `JOIN` com `usuarios` (GERENTE/DONO da loja, ADMIN). `security_invoker` sozinho não separaria OPERADOR de GERENTE, porque o papel de banco é o mesmo.
- GO-LIVE `20261009033124` e diagnóstico `20261009115256` constam no ledger, com par no human-gates.
- Financeiro/operacional de 05–06/10 localizado por nome: `financeiro_loja_contas_ledger`, `financeiro_hardening_final`, `entrada_manual_fornecedor_sem_cnpj`, `estoque_ajuste_concorrente`, `entrada_documento_posterior`, `financeiro_contas_operacionais`, `desconto_comercial_operador_dinheiro`.

### P0 confirmado — RPCs fiscais

Consulta de catálogo em produção, 2026-10-10:

| Função `public` | `fiscal_sessao_privilegiada` no corpo | `current_user` no corpo | `search_path` |
|---|---|---|---|
| `fiscal_reprocessar_documento` | não | sim | `public` |
| `fiscal_enfileirar_documento_venda` | não | sim | `public` |
| `fiscal_registrar_evento_enqueue_erro` | não | sim | `public` |
| `fiscal_cancelar_documento` | — | — | **ausente** em `pg_proc` (`proname` em `public`) |

O arquivo que troca esse predicado é `backend/supabase/migrations/20261009220000_fiscal_rpc_isola_loja.sql` (PR #527, commit `67e78acc`, merge `cf5385bd`). Ele **não** aparece no ledger (consulta por `name` contendo `fiscal_rpc` / `fiscal_cancel` / `ssot` de outubro não retornou essas versões) e **não** tem par em `migration-human-gates.json`.

Efeito, já reproduzido pelo teste local contra os corpos históricos e descrito no cabeçalho da migration (linhas 1–18): dentro de `SECURITY DEFINER` cujo dono é `postgres`, `current_user <> 'postgres'` é sempre falso. `GRANT EXECUTE` para `authenticated` deixa um operador da loja A reprocessar, enfileirar ou gravar evento fiscal da loja B. O cancelamento entre lojas está no mesmo arquivo; em produção a função `fiscal_cancelar_documento` nem está em `public`, enquanto o app publicado chama essa RPC em `pdv-importados/app/gerente/financeiro/actions.ts` (por volta da linha 168).

`search_path=public` nas três funções que existem não fecha o bypass. O problema é o predicado de autorização.

### Outras migrations no Git sem par e sem nome correspondente no ledger

Consulta por nome (`financeiro`, `ssot`, `fiscal_cancel`, `fiscal_rpc`, `caixas_fechamento_formas`, entre outros) e leitura de `migration-human-gates.json` até `20261009180001`. Não aplicadas, ou não registradas:

| Arquivo | Evidência |
|---|---|
| `20261006120000_financeiro_contas_formas_e_painel.sql` | sem par; o nome não apareceu entre os `financeiro_*` do ledger |
| `20261007161220_fiscal_cancelado_ssot.sql` | sem par; `fiscal_cancelar_documento` ausente em `public` |
| `20261007163000_ssot_001_002_painel_ec_cache.sql` | sem par; nomes `ssot` do ledger são de agosto/2026, não desta leva |
| `20261007163100_ssot_003_nfe_obrigacao_duplicata.sql` | idem |
| `20261007163200_ssot_004_revoke_insert_documentos_fiscais.sql` | idem |
| `20261007170000_ssot_002_mov_ar_ec_cache.sql` | idem |
| `20261007171000_ssot_002_cancel_guard_antes_devolucao.sql` | idem |
| `20261007190000_caixas_fechamento_formas_snapshot.sql` | sem par; nome não retornou na consulta |
| `20261009220000_fiscal_rpc_isola_loja.sql` | sem par; corpos antigos ainda no catálogo |

`20261007180000_calcular_valor_sistema_por_forma_caixa.sql` não tem par no human-gates. O filtro de nomes desta sessão não incluiu esse identificador, então a ausência no ledger por esse nome **não** foi consultada à parte.

### Staging

O staging não é cópia da produção. As 339 versões foram regravadas em 2026-10-09/10. O último nome lógico é `20261001100400_c3_devolver_retry_autorizacao`. Não há N1, não há `fiscal_rpc_isola_loja` e a replay para antes do financeiro de 05/10. O ledger também contém os dois nomes `20260930090200_p03_vendas_lista_kpi_uma_linha_por_venda` e `20260930120000_vendas_lista_kpis_por_venda`. Não usei esse projeto para carga e não apliquei migration nele.

## 5. Correções nesta branch

Nenhuma alteração de aplicação, migration ou painel.

A correção do P0 fiscal **já está na `main`**. Reaplicar o mesmo SQL num arquivo novo duplicaria o histórico. Aplicar em `kbabmewnahysfvlybiak` ou no staging exige autorização explícita; esta sprint não a tinha. Não registrei par no human-gates: o par só existe depois da aplicação, senão o gate de drift passa a tratar migration pendente como já reconciliada.

O que esta branch entrega é este relatório.

## 6. Testes executados

| Comando | Onde | Resultado |
|---|---|---|
| `npm run test:fiscal-rpc-authz` | `backend/` | **FAIL** na 1ª vez: `Cannot find package '@electric-sql/pglite'`. O pacote está no `package.json` / lock (`0.3.14`) e não estava em `node_modules`. |
| `npm install --workspace fastproduct-backend --ignore-scripts` | raiz | exit 0. 12 packages adicionados. `git status` não mostrou mudança de lockfile. |
| `npm run test:fiscal-rpc-authz` | `backend/` | **PASS** (exit 0). O teste reproduz o bypass histórico (operador da loja A reprocessa, enfileira e grava evento da loja B; gerente da loja A cancela documento da loja B) e, depois da migration `20261009220000`, nega outra loja e usuário inativo. Mensagem final: `OK: isolamento fiscal entre lojas`. |

Não executados, e portanto sem declaração de PASS: typecheck, lint, suíte unitária completa, build Next.js, `supabase db reset` local, ensaio de carga, teste de 12 horas. O CI da `main` no SHA `a39a5309` que esta sessão listou foi Secret scan success e Release validate (SSRA) skipped. O job `migration-remote-drift` não roda em push na `main` (só `pull_request` com paths de `backend/**`).

Segredos: este arquivo não contém service role, senha nem token. Refs de projeto são os identificadores já usados na missão.

## 7. Deploys de produção

- ERP: **READY** em `a39a5309`, domínio `www.jinlong.app` respondendo.
- Site: último build de produção **concluído** em `19f05be5`. Deploys posteriores da `main` que não tocam o site aparecem **Canceled** / Skipped - Not affected. Comportamento do `site/scripts/vercel-ignore.sh`, não falha.
- Previews do ERP nas branches de capacidade: **Canceled by Ignored Build Step**. Intencional. Não contornar.

Push desta branch de documentação pode gerar os mesmos previews cancelados. Não forçar build.

## 8. Riscos ainda abertos

1. **P0** Bypass de loja nas três RPCs fiscais que existem em produção, e `fiscal_cancelar_documento` ausente enquanto o app a chama.
2. **P0/P1** Lote `20261006`/`20261007` acima sem par de versão. O efeito funcional de cada uma não foi reexecutado em produção nesta sessão.
3. **P1** Staging atrás da `main` e da produção. Homologação e k6 não têm alvo fiel.
4. **P1** PRs #530–#534 sem Actions porque a base não é `main`. Merge direto herdaria isso.
5. **P2** Backlog de PRs conflitantes e e2e vermelho (#502–#505, #491 e a série `cursor/p0-*`).
6. Branches locais ahead (recovery / pr2d / codex) não foram integradas nem descartadas.

## 9. Ordem de merge

1. **Não mergear** esta entrega até o confronto com a auditoria do Claude e uma autorização explícita.
2. Quando autorizado, o passo de produção é aplicar, numa janela com backup, **somente** `20261009220000_fiscal_rpc_isola_loja.sql` e em seguida o lote `20261007*` / `20261006120000` cuja ausência for reconfirmada no ledger — cada uma com pré-check de catálogo. Só então criar o par no human-gates. Isso **não** está neste PR.
3. PRs prontos para merge agora: **nenhum** dos #529–#534.
4. Se a capacidade for retomada depois do banco coerente: #529, depois #533 rebaseado, depois #534. Fechar #530 e #532.

## 10. Entrega

| Campo | Valor |
|---|---|
| Branch | `sprint/go-live-01` |
| Commit do relatório | `8fbecf1aa93588ba9560fa6b3da0fa876a4356e1` |
| Commit que grava esse SHA | `d9856ae4` (ver `git log` da branch para o HEAD final) |
| PR | https://github.com/nocodenn-cell/fastproduct/pull/535 |
| Auto-merge | não solicitado |
| Produção alterada | não |

## 11. Decisão

**NO-GO** para declarar código, deploy e banco coerentes.

- GO operacional estreito do piloto já publicado: o deploy do ERP está READY e o N1 de preço de custo está no ledger (`20261009140739`).
- NO-GO de segurança fiscal: o Git e o teste local estão corrigidos; a produção não.
- NO-GO de homologação: o staging não reproduz a produção.

Parar aqui, antes de qualquer merge, para confrontar com a auditoria independente do Claude.
