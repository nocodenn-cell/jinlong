# Plano de saneamento — GitHub `nocodenn-cell/jinlong`

**Data:** 2026-11-11 · **Base:** `docs/governance/GITHUB_AUDIT.md` · **Estado:** plano para aprovação. **Nenhuma ação destrutiva foi executada.**

Legenda: 🔒 = exige autorização específica do dono. Nada marcado 🔒 deve ser feito sem resposta explícita.

## 1. Ordem recomendada de resolução

A ordem segue dependência técnica e risco. Cada onda só começa quando a anterior tem decisão registrada.

### Onda 0 — Decisões de governança (sem código)

1. 🔒 Ativar **revisão obrigatória** (1 aprovação e CODEOWNERS) em `main`. Hoje não há exigência humana.
2. 🔒 Declarar uma **regra de congelamento**: nenhum PR novo entra em `main` com migration fora de `deferred-migrations.json` sem entrada no manifesto. Isso bloqueia a repetição de `#675`.
3. 🔒 Decidir a **versão canônica** de cada par conflitante (seção 6). Sem essa decisão, nenhum PR da cadeia pode ser mesclado.
4. 🔒 Registrar a decisão sobre `20261104120000` (`#669` reescreve a migration de `main`).

### Onda 1 — Segurança (prioridade do dono)

5. `#670` como base do sync-outbox (checagem de token). 🔒 Fechar `#674` depois de `#670` estar aprovado.
6. `#671` (contenção de DML direto). Depende de a versão `20261106140207` entrar no manifesto ou ser aplicada por decisão. 🔒
7. `#669` → `#673`, nesta ordem, depois da decisão da Onda 0, item 4. 🔒
8. `#623` (remover ADMIN): **não mesclar** antes de a decisão de produto sobre ADMIN nos testes estar registrada. Mesclar é 🔒.

### Onda 2 — Governança e drift

9. `#659` (manifesto e CLI do drift). Rever com `#673`, porque os dois alteram o mesmo JSON.
10. `#672` (guarda de drift homolog). Revisão do tech-lead (CODEOWNERS `/.github/`).
11. `#667` (teste do drift gate, "NÃO MESCLAR"): registrar evidência e fechar. 🔒

### Onda 3 — Cadeia P0 financeira (`#500`)

12. Corrigir o P1 de Codex em `#500` (agregados do painel financeiro sem `20261006120000`).
13. Mesclar `#500` **como único PR** da cadeia. 🔒 Depois fechar `#487`, `#488`, `#498`, `#499` (conteúdo contido). Fechar `#484` e `#489` pelo mesmo motivo. 🔒
14. `#485` e `#486` (backup JIT): decidir entre a sonda de `#485` e o diagnóstico de `#506`. Os três tocam o mesmo fluxo de backup. 🔒

### Onda 4 — PDV e caixa

15. Escolher entre `#656` e `#675` (D1). Recomendação: **`#656`** como base (1 migration, menor superfície), e tirar D1 de `#675` antes de mesclá-lo. 🔒
16. `#657` (RN03) só depois de `#656` estar em `main` (o diff dele inclui o commit).
17. `#675`: **não mesclar**. Antes: resolver a colisão `20261107120000` com `#677`, decidir se D2–D5 entram no manifesto ou são aplicados, e fazer a validação presencial do PDV. 🔒
18. `#674` (sync offline) só após `#670`. Hoje tem `outbox-contract` vermelho.
19. `#642`: fixture de caixa. Fechar se `#675` já trouxer a correção. 🔒

### Onda 5 — Leads e Hub Comercial

20. Decidir se as migrations deferidas `20261104150000`–`170000` de `main` são **substituídas** por `#677`, ou se `#677` é descartado. 🔒
21. Mesclar `#677`, depois `#676` (endpoint). Os dois juntos, senão o formulário comercial segue quebrado.
22. `#658` (Growth-001) só depois de a decisão sobre `20261023130000` estar registrada. 🔒

### Onda 6 — Dependências (sequencial)

23. `#636` e `#637` (actions 4→7). Primeiro, entender por que falham com `build-and-test` e `Supabase gates`.
24. `#549` (ESLint 10) e `#547` (eslint-config-next 16) com `#548` (Next 15.5). Não mesclar um sem o outro.
25. `#679` (grupo dev/minor, +16k linhas de lockfile) depois das majors.
26. `#546` (Sentry) por último: rebase, validar `build-and-test`.
27. `#678` (pin SHA rust-cache): pode ir a qualquer momento. 🔒 mesclar.

### Onda 7 — Multiempresa e STG-01

28. Escolher **uma** cópia da M1: `#537` (`migrations/`) ou a cadeia `#493`→`#496`. Recomendação: `#537` como migração final, com `#496` rebaseado sobre ela, porque `#537` está na pasta de migrations ativa. 🔒
29. `#495` e `#492` (docs): fechar ou consolidar em `#496`. 🔒
30. STG-01: decidir estratégia A ou B (`docs/capacity/STG01_ESTRATEGIA_A_VS_B.md`). Depois `#533` (contém `#530` e `#532`), depois `#534`. Fechar `#530` e `#532`. 🔒
31. `#490` (Speed Insights) só depois de `#491`. Verificar custo na Vercel. 🔒

### Onda 8 — Revisão de baixo risco (pode andar em paralelo)

32. `#550`, `#661` (checar `.gitleaks.toml` antes), `#663`, `#668`: revisão e, depois, merge. 🔒 merge.
33. `#541`, `#542`: UX com e2e vermelho e conflito. Rebase e correção dos testes antes de qualquer revisão.
34. `#508`, `#506`: docs de auditoria. Fechar se o conteúdo estiver superado. 🔒

## 2. PRs que devem permanecer abertos (com destino)

| PR | Categoria | Destino |
|---|---|---|
| #659 | NECESSÁRIO | Revisar e mesclar após `#673` ser decidido (mesmo manifesto) |
| #672 | NECESSÁRIO | Revisão do tech-lead; altera CI |
| #500 | BLOQUEADO / CRÍTICO | Único PR da cadeia P0; corrigir P1 de Codex |
| #623 | CRÍTICO | Permanece até decisão de ADMIN; não mesclar antes |
| #669, #671, #673 | CRÍTICO | Segurança; sequência da Onda 1 |
| #670 | DUPLICADO / CRÍTICO | Base do sync-outbox |
| #677, #676 | BLOQUEADO | Par de leads |
| #656, #657 | DUPLICADO / BLOQUEADO | D1 e RN03 |
| #546, #550, #661, #663, #668, #678 | PRONTO PARA REVISÃO | Revisar e decidir merge |
| #537 | BLOQUEADO / CRÍTICO | Candidato a base da M1; "NÃO FAZER MERGE" precisa ser revisto pelo dono |
| #533 | BLOQUEADO / CRÍTICO | Após decisão STG-01 |

## 3. Candidatos a fechamento (exigem autorização)

| PR | Motivo | Pré-condição |
|---|---|---|
| #667 | Teste "NÃO MESCLAR", função cumprida | Registrar evidência |
| #506 | Diagnóstico superado pela sonda JIT | Confirmar que nenhuma recomendação ficou só nele |
| #508 | Auditoria 360° somente leitura, superada | Revisar conteúdo |
| #484 | NO-GO de 2026-10-08, superado | Conteúdo presente em `#500` |
| #489 | Docs de restore sintético, duplicado | `#500` com drill sintético |
| #487, #488, #498, #499 | Cadeia P0 contida em `#500` | `#500` mesclado e validado |
| #530, #532 | Contidos em `#533` | Decisão STG-01 e `#533` |
| #674 *ou* #670 | Mesma correção no sync-outbox | Escolher um (Onda 1) |
| #656 *ou* #675 | Mesma regra D1 | Escolher um (Onda 4) |
| #642 | Fixture obsoleta se `#675` corrigir | Confirmar |

**Atenção:** fechar um PR não apaga a branch. Fechar e apagar branch são ações separadas (ver seção 5).

## 4. Candidatos a substituição

| Substituído | Por | Observação |
|---|---|---|
| `#488` | `#500` | 8/8 commits contidos |
| `#498` | `#500` | 9 commits, 8 de `#488` |
| `#499` | `#500` | 10 commits, contido |
| `#487` | `#500` | Sobreposição de 4 arquivos |
| `#493` | `#496` (ou `#537`) | Mesmo arquivo M1 |
| `#495` | `#496` | Mesmos docs M2a |
| `#530`, `#532` | `#533` | Cadeia cumulativa |
| `#484` | `#500` / `#485` | Docs do mesmo sprint |

## 5. Branches

Números medidos com `git for-each-ref`, `git branch --merged` e `gh pr list --state all` (668 PRs no histórico).

| Grupo | Quantidade | Ação recomendada |
|---|---|---|
| Remotas já ancestrais de `origin/main` | **18** | Candidatas a exclusão 🔒 |
| Remotas com PR **MERGED** (squash/rebase, não ancestrais) | **100** | Candidatas a exclusão 🔒. Verificar com `git cherry origin/main <branch>` que não há trabalho fora do merge |
| Remotas com PR **CLOSED sem merge** | **76** | **Não excluir em lote.** Verificar commits únicos (`git log origin/main..<branch>`) e decidir caso a caso. Alguns podem ser reabertos |
| Remotas **sem PR** e não ancestrais | **27** (10 anteriores a 2026-09-01) | Revisar manualmente; podem ser trabalho em andamento |
| Remotas com PR **aberto** | **53** | Mantidas (são os PRs desta auditoria) |
| Locais | **245** | — |
| Locais ancestrais de `origin/main` | **139** | Candidatas a exclusão local 🔒 |
| Locais com upstream **removido** e **sem merge** | **21** | **Risco de perda.** Antes de qualquer ação, verificar commits únicos. Lista no apêndice |
| Locais sem upstream | **86** | Verificar; muitos são trabalho local de sessões anteriores |

**Regra para exclusão** (quando autorizada): (1) confirmar `git cherry` sem `+`; (2) confirmar PR `MERGED` ou branch ancestral; (3) excluir em lotes pequenos, com a lista registrada.

A lista completa está no apêndice de `GITHUB_AUDIT.md` (seção 9).

## 6. Pares em conflito que exigem decisão

| Par | Conflito | Recomendação |
|---|---|---|
| `#537` × `main` | Versão `20261010120000` já usada por `caixa_sem_loja_padrao` (deferida) | Renumerar `#537` ou tirar a entrada deferida. 🔒 |
| `#623` × `main` | Versão `20261028120000` já usada por `revoga_helpers_tenant_authenticated` | Renumerar. 🔒 |
| `#675` × `#677` | Versão `20261107120000` em dois arquivos | Renumerar um deles. 🔒 |
| `#677` × `main` (deferidas `20261104150000`–`170000`) | Mesmas funções recriadas | Escolher a versão canônica. 🔒 |
| `#669` × `main` | Reescreve `20261104120000` (deferida) | Decidir qual versão vale. 🔒 |
| `#656` × `#675` | Mesma regra D1 | Escolher um. 🔒 |
| `#670` × `#674` | Mesmo arquivo sync-outbox | Escolher um. 🔒 |
| `#493`/`#496`/`#537` | M1 em três cópias | Escolher uma. 🔒 |

## 7. Ações que exigem autorização explícita

Nenhuma destas foi executada. Respostas curtas (sim/não/ajuste) bastam.

**Governança e proteção**
- G1. Exigir revisão humana (1 aprovação, CODEOWNERS) em `main`.
- G2. Ativar secret scanning, push protection e Dependabot alerts.
- G3. Pinar actions de terceiros por SHA (política).
- G4. Repositório público: manter ou tornar privado. Se manter, avaliar rotação da anon key e remover o ref do projeto de produção dos docs versionados.
- G5. Adicionar `#659` (manifesto) e `#672` (guarda de drift) como necessários. Não tornar o drift gate obrigatório enquanto a dívida existir.

**Decisões de produto e técnicas**
- D1. `#623`: comportamento esperado sem ADMIN (remover de vez ou manter em testes).
- D2. Growth-001: aplicar `20261023130000` ou manter adiada (`#658`).
- D3. Leads: qual versão de `registrar_lead_comercial` é canônica (`#677` ou `main`).
- D4. `#675`: D2–D5 entram no manifesto de adiadas ou são aplicados. E o label `deploy-prod:aprovado` deve ser removido do PR se não houver autorização de deploy.
- D5. `#669`: a migration `20261104120000` de `main` fica como está ou é substituída.
- D6. STG-01: estratégia A ou B (`#533`).
- D7. `#537`: "NÃO FAZER MERGE" é definitivo? Se não, qual versão de migration ela ocupa.
- D8. Qual M1 sobrevive (`#493`/`#496` ou `#537`).

**Ações sobre PRs e branches**
- A1. Fechar cada PR da seção 3, um por um ou em lote.
- A2. Mesclar qualquer PR da seção 2 (incluindo "pronto para revisão").
- A3. Excluir branches (remotas ou locais) listadas na seção 5.
- A4. Reabrir `#534`, `#530`, `#532` se a decisão STG-01 mudar o escopo.

**Fora do escopo desta auditoria e proibido sem autorização específica**
- Aplicar qualquer migration em homologação ou produção.
- Alterar banco, secrets ou infraestrutura.
- Fazer deploy.
- Force push.
- Alterar permissões de usuários.

## 8. O que foi feito nesta rodada

- Coleta de dados (somente leitura) de 53 PRs abertos, 668 PRs no histórico, 275 branches remotas e 245 locais.
- Classificação de cada PR (seção 3 de `GITHUB_AUDIT.md`).
- Escrita de `docs/governance/GITHUB_AUDIT.md`, `docs/governance/GITHUB_CLEANUP_PLAN.md` e `docs/governance/GITHUB_WORKFLOW.md`.
- Atualização de `PROXIMOS_PASSOS.md`.
- **Não feito:** nenhum comentário, label, merge, fechamento, exclusão, push ou alteração de proteção no GitHub.

## 9. Apêndice — listas de branches

### Remotas já ancestrais de origin/main (18)

- `autonomous/nightly-20260418`
- `chore/pdv-importados-package-lock-supabase-zustand`
- `copilot/validation-phase-a`
- `feat/autonomous-20260417-132823`
- `feat/proxima-feature`
- `fix/build-clientes-i18n`
- `fix/homologacao-rpc-venda-v2-estoque-diagnostico-ps`
- `fix/pdv-sonar-build-unblock`
- `main`
- `merge/consolidacao`
- `onda-5-etapa-1-header`
- `onda-5-fase-0-dialog-caixa`
- `perf/caixa-fluidez-bundle`
- `premium-ui`
- `refactor/gerente-wave2`
- `release/admin-auth-stable-v1`
- `v0/nocodenn-cell-e59f9875`
- `vercel/install-and-configure-vercel-w-vgx389`

### Remotas com PR fechado sem merge (PR CLOSED, não ancestral) (76)

- `chore/dominio-onda0-onda-a`
- `chore/go-live-neutralize-verify-blocks`
- `chore/node22-alignment`
- `claude/audit-findings-go-live-qldlgw`
- `claude/auditoria-2-validacao-integridade-v3x7en`
- `claude/auditoria-cadastro-produto-d9b1d6`
- `claude/confident-thompson-dgobyr`
- `claude/ecstatic-jang-b1fa40`
- `claude/hardening-certificacao-operacional-f2e6ce`
- `claude/jinlong-design-system-analysis-8cin6w`
- `claude/jinlong-doc-assimilation-f155hr`
- `claude/jinlong-ux-audit-4ab5be`
- `claude/magical-ride-afqco2`
- `claude/organize-jinlong-delivery-d71d60`
- `claude/product-form-ux-audit-1jv0k5`
- `claude/sprint-ux-onda2-pdv-busca`
- `codex/jinlong-sprint-close`
- `codex/piloto-d0-hardening`
- `cursor/auditoria-ssot-dominios-regras-7da4`
- `cursor/auditoria-uiux-performance-pos-sprints-22e2`
- `cursor/bugs-cr-ticos-recentes-13e4`
- `cursor/bugs-cr-ticos-recentes-301a`
- `cursor/bugs-cr-ticos-recentes-3410`
- `cursor/bugs-cr-ticos-recentes-4725`
- `cursor/bugs-cr-ticos-recentes-834a`
- `cursor/bugs-cr-ticos-recentes-8966`
- `cursor/bugs-cr-ticos-recentes-ae0e`
- `cursor/bugs-cr-ticos-recentes-c3ca`
- `cursor/bugs-cr-ticos-recentes-dc25`
- `cursor/bugs-cr-ticos-recentes-efba`
- `cursor/estoque-compras-admin-v2-633a`
- `cursor/executive-dashboard-layout-fase1-bd0e`
- `cursor/fechamento-ui-ux-633a`
- `cursor/go-condicional-bloqueadores-fiscais-7da4`
- `cursor/governanca-dominios-regras-negocio-7da4`
- `cursor/onda1-busca-autocomplete-5-6-0a79`
- `cursor/onda1-categoria-marca-121-122-0a79`
- `cursor/onda1-historico-vendas-27-0a79`
- `cursor/onda1-hover-selection-221-222-0a79`
- `cursor/onda1-i18n-219-220-0a79`
- `cursor/onda1-reimpressao-recibo-28-0a79`
- `cursor/p0-backup-restore-verification-0a79`
- `cursor/p0-reconciliacao-migrations-ci-1966`
- `cursor/reconciliacao-supabase-audit-633a`
- `cursor/remediacao-ssot-bloqueadores-001-004-7da4`
- `cursor/sprint-6-ux-simplify-633a`
- `cursor/sprint-7-hub-ux-633a`
- `cursor/uiux-estoque-e3d1`
- `devin/1781304017-improve-error-handling`
- `devin/1781304103-deduplicate-shared-utilities`
- `devin/1781304121-add-unit-tests-coverage`
- `devin/1781304134-security-fixes`
- `feat/multiempresa-fase1`
- `feat/pr2d-caixas-elegiveis-rpc`
- `feat/sprint-ux-go-live`
- `feature/demo-comercial-estabilizacao`
- `feature/go-live-integration`
- `fix/e2e-prod-server`
- `fix/e2e-selectors-mobile`
- `fix/e2e-wait-hydration`
- `fix/pdv-invoke-args`
- `fix/produto-form-opcoes-merge-local`
- `fix/react-duplicado-build-vercel`
- `fix/seguranca-gerente-escopo-e-cobranca`
- `hotfix/vercel-site-ignore-step`
- `onda-5-etapa-2-busca`
- `onda-5-etapa-3-carrinho`
- `onda-5-etapa-4-resumo-financeiro`
- `onda-5-lote-1-button`
- `onda1/financeiro-compras`
- `rescue/jinlong-pre-sprint-20261008`
- `security/produtos-custos-invoker`
- `test/sentry-preview`
- `vercel/install-vercel-speed-insights-0fpp78`
- `vercel/install-vercel-speed-insights-3x2940`
- `vercel/install-vercel-web-analytics-sjssgl`

### Remotas com PR MERGED mas não ancestrais (squash/rebase) (100)

- `audit/promocao-lote-1`
- `chore/fase2-infra-hardening`
- `chore/lockfile-update`
- `claude/alinhamento-ambientes-85e4f3`
- `claude/audit-critical-items-51ca1c`
- `claude/audit-recebimento-screen-8a9b2b`
- `claude/backend-frontend-global-reconciliation`
- `claude/cashier-screen-redesign-2d4d32`
- `claude/critical-flows-product-entry-sales-5333a3`
- `claude/desconto-pagamento-dinheiro-pdv-63e58b`
- `claude/employee-registration-ux-analysis-c9ef2e`
- `claude/fase-6-validacao-fechamento-6e9af7`
- `claude/fastproduct-atacado-wave-2-cf14cd`
- `claude/gate-convergencia-auditorias-171f73`
- `claude/go-live-fase0-catalog-diff`
- `claude/growth-001-conversion-hub-42e56e`
- `claude/i18n-golive-hardening-pt-zh`
- `claude/jinlong-barcode-audit-fa8da6`
- `claude/jinlong-completude-audit-647308`
- `claude/jinlong-focus-nfe-readiness-d5524b`
- `claude/jinlong-pilot-prep-7tjrbs`
- `claude/jinlong-print-audit-53e9d9`
- `claude/jinlong-ux-polish-convergence-b4d26b`
- `claude/pdv-stress-test-operational-abd0b6`
- `claude/post-merge-docs-verification-43d8bd`
- `claude/salvage-human-gate-and-docs`
- `claude/vendas-caixa-ux-improvements-278e93`
- `codex/ap-payments-reconciliation`
- `codex/piloto-d0-main-clean`
- `codex/visual-qa-round2-continuation`
- `consolidate/main-lote1-20260928`
- `consolidate/missao3-20260718`
- `convergencia-pre-cliente-candidata`
- `cursor/bugs-cr-ticos-recentes-09e1`
- `cursor/bugs-cr-ticos-recentes-1c6f`
- `cursor/go-live-docs-passo6-dce4`
- `demo-pilot-readiness`
- `docs/contratos-c2-1-c3-pagamento-a-prazo`
- `docs/fechamento-sprint-bl2-cicd`
- `docs/reconcile-mcp-migration-versions`
- `feat/admin-screen-consolidation`
- `feat/cadastro-produto-rapido-completo`
- `feat/catalogo-navegacao-cadastro-completo`
- `feat/missao5-1a-inventario-boundary-guards`
- `feat/multiempresa-fase1-provisionamento`
- `feat/screens-100-first-customer`
- `feature/cadastro-produto-melhorias`
- `feature/cadastro-produto-ux`
- `feature/recover-sale-finalization-v3`
- `feature/zinc-redesign`
- `fix-atacado-primeira-faixa-cadastro`
- `fix/ci-baseline-verde`
- `fix/ci-supabase-auth-readiness-timeouts`
- `fix/estabilizacao-piloto-jinlong`
- `fix/estoque-bypass-delete-insert-nan`
- `fix/estoque-inicial-cadastro-produto`
- `fix/fornecedores-schema-canonico`
- `fix/go-live-produto-opcoes-webkit`
- `fix/golive-faixa-atacado-toast`
- `fix/guard-hardening`
- `fix/integrate-claude-line-post-pr300`
- `fix/item10-catalog-migration-drift`
- `fix/item11-required-checks-fallback`
- `fix/item4-receivable-loja-id`
- `fix/item7-storage-produto-imagens-tenant`
- `fix/item8-npm-cve-bump`
- `fix/items5-6-followup-review`
- `fix/items5-6-housekeeping`
- `fix/loja-scope-consolidacao`
- `fix/migration-drift-reconciliation-20260820150000`
- `fix/nfe-conferencia-ui-flx05`
- `fix/nfe-parser-duplicata-invalida`
- `fix/oc-busca-uuid`
- `fix/piloto-sku-exato-e-trava-finalizar`
- `fix/pr1b-kardex-imutavel`
- `fix/pr1c-estoque-quantidade-protecao`
- `fix/produto-form-dirty-baseline`
- `fix/provisionamento-formas-pagamento`
- `fix/totalLiquido-positivo`
- `fix/vitest-peer-dep`
- `hotfix/chart-imports`
- `onda-5-etapa-5a-tokens-pagamento`
- `onda-5-etapa-5b-select-radiogroup`
- `onda-5-etapa-5c-pagamento-consumidores`
- `onda-6a-modais-baixo-risco`
- `onda-6b-modais-risco-medio`
- `onda-6c-fechamento-bloqueios`
- `onda-6c-gerente-modal`
- `perf/auth-navegacao-autenticada`
- `perf/finalizacao-revalidacao-preco-paralela`
- `pilot-go`
- `preserve/dirty-20260929-business-rules`
- `remediation/fase1-hardening-grants`
- `remediation/fase2-coalesce-regression`
- `remediation/fase3-tenant-isolation-transferencias-remessas`
- `remediation/fase4-idempotencia-remessa-payload-hash`
- `remediation/fase5-doc-drift-authorization-matrix`
- `security/residual-grants-3-tabelas`
- `staging/demo-2026-06-18`
- `test/diagnose-runner-allocation`

### Remotas sem nenhum PR e não ancestrais de main (27)

- `backup/audit-promocao-lote-1-20260928 (2026-09-27)`
- `backup/main-41-commits-20260928 (2026-09-19)`
- `checkpoint/missao5-fundacao (2026-07-18)`
- `checkpoint/wip-missao3-20260718 (2026-07-18)`
- `ci/site-workflow (2026-10-20)`
- `claude/e2e-stabilization-sprint-824f51 (2026-08-29)`
- `claude/golden-flow-pdv-work (2026-11-05)`
- `claude/jinlong-field-validation-audit-5b7938 (2026-11-04)`
- `claude/jinlong-import-costs-audit-555ab3 (2026-11-03)`
- `claude/jinlong-prs-closure-ce466a (2026-10-28)`
- `claude/s4-desenho-ap-nfe (2026-10-29)`
- `claude/sprint-ux-onda1-cadastro (2026-08-31)`
- `codex/estoque-entradas-seguranca (2026-10-06)`
- `codex/pdv-pagamentos-desconto (2026-10-06)`
- `codex/piloto-d0-auditoria (2026-08-23)`
- `codex/reconcile-db-final (2026-08-13)`
- `cursor/palm-v1-pedidos-assistidos-6e92 (2026-10-12)`
- `cursor/pdv-varejo-atacado-ux-20e2 (2026-10-12)`
- `cursor/sprint-ci-alinhamento-aee6 (2026-10-06)`
- `cursor/sprint-types-drift-aee6 (2026-10-06)`
- `feat/estoque-ux-operacional-20261020 (2026-10-19)`
- `feat/fechamento-comercial-cash-financial (2026-07-18)`
- `feat/first-customer-go-live (2026-07-19)`
- `fix/e2e-playwright-webkit-install (2026-08-23)`
- `loop/ux-caixa-gold-token (2026-10-14)`
- `ops/golive-584 (2026-10-20)`
- `v0/design-application-7ff1fa35 (2026-05-15)`

### Locais com upstream removido (gone) e não ancestrais de origin/main — risco de perda (21)

- `claude/analise-plano-07c0fc`
- `claude/jinlong-modularity-audit-507d84`
- `claude/jinlong-supabase-audit-dc2a57`
- `claude/pedido-nota-chegada-fluxo-6b66db`
- `claude/project-analysis-client-readiness-16b6e4`
- `codex/cnpj-entrada-limite`
- `codex/financeiro-abrir-titulo`
- `codex/fix-nota-financeiro-ci`
- `codex/recebimento-manual-valores`
- `codex/recebimento-produto-digitado`
- `codex/recebimento-validar-produto`
- `dependabot/npm_and_yarn/dev-minor-patch-86fc811b19`
- `feat/onda-ab-integridade-vendas-datas`
- `feat/site-integrar-main`
- `fix/620-reduzido`
- `fix/perfis-rls-recursao`
- `fix/pr1-c1-c2-authz-suspensao`
- `fix/produtos-custos-rpc`
- `release/ux443-p0-dashboard`
- `sec/diagnostico-caixa-dono-admin`
- `sec/implantacao-go-live-authz`
