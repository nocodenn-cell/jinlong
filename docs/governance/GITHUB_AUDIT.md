# Auditoria GitHub — nocodenn-cell/jinlong

**Data da coleta:** 2026-11-11 · **Branch da auditoria:** `claude/jinlong-repo-audit-governance-1708f1` · **main em:** `2929b09a`
**Escopo:** 53 PRs abertos (todos consultados via `gh`), branches locais e remotas, proteções de branch, CI, migrations e CODEOWNERS.
**Somente leitura:** nenhum PR foi mesclado, fechado, comentado ou reclassificado no GitHub. Nenhuma branch foi excluída. Nenhuma migration foi aplicada. Esta auditoria só escreve arquivos em `docs/governance/`.

## 0. Limites desta auditoria (leia antes de decidir)

- **Princípios de Engenharia do Jinlong não estão no repositório.** O documento é citado como "Princípios de Engenharia.txt" em `docs/AUDITORIA_FLUXOS_ROADMAP.md` (linha 17) e `docs/piloto-d0/DIVERGENCIAS_E_DECISOES.md` (DIV-D0-018, status ABERTA) reconhece que o arquivo não foi obtido. A classificação usou os oito critérios listados na missão (redução de complexidade, preservação arquitetural, redução de acoplamento, SSoT, testabilidade, segurança, previsibilidade, manutenibilidade). Se o documento existir fora do repositório, a classificação deve ser revalidada contra ele.
- **Profundidade por PR.** Para todos os 53 PRs foram coletados: metadados, arquivos, commits, checks, reviews, comentários, estado de merge e migrations. Para as colisões, dependências e sobreposições foram comparados os commits e arquivos de cada branch. **Nem todos os diffs foram lidos linha a linha.** Onde a classificação depende de leitura de conteúdo que não foi feita, a evidência diz isso.
- **Checks "vermelhos" não são todos bloqueantes.** Só seis contextos são obrigatórios em `main` (ver seção 2). `migration-remote-drift`, `deploy-governance`, `e2e-playwright`, `e2e-critical` e `Vercel` estão vermelhos em vários PRs e não bloqueiam merge.

## 1. Resposta resumida (critério da missão, item 10)

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PRs auditados | **53** abertos (de 668 PRs no histórico: 382 mesclados, 233 fechados sem merge, 53 abertos) |
| 2 | Necessários (permanecem abertos) | **2** (#659, #672) |
| 3 | Duplicados | **6** (DUPLICADO) — e mais **9** SUBSTITUÍDOS, que também são sobreposição total ou parcial |
| 4 | Obsoletos | **3** (#506, #508, #667) |
| 5 | Bloqueados | **18** (BLOQUEADO) |
| 6 | Prontos para revisão | **6** (#546, #550, #661, #663, #668, #678) |
| 7 | Dependências entre PRs | **4** PRs empilhados por base de branch; **6** pares com commits compartilhados na cadeia 488→498→499→500; **6** na cadeia 530→532→533→534; **1** (656⊂657); e **11** dependências semânticas (ver seção 5) |
| 8 | Conflitos | **18** PRs com `mergeStateStatus = DIRTY` (conflito real com main); **3** colisões de versão de migration com main ou entre PRs (seção 4) |
| 9 | Maiores riscos | Ver seção 7 |
| 10 | Decisões que dependem do dono | Ver `GITHUB_CLEANUP_PLAN.md`, seção 7 |

**Classificação consolidada:** BLOQUEADO 18 · SUBSTITUÍDO 9 · PRONTO PARA REVISÃO 6 · DUPLICADO 6 · EM DESENVOLVIMENTO 4 · CRÍTICO 5 · OBSOLETO 3 · NECESSÁRIO 2 (total 53).

**Estado geral dos 53 PRs:** 32 são draft · 18 em conflito (DIRTY) · 11 bloqueados por review ou check (BLOCKED) · 15 instáveis (UNSTABLE, checks não obrigatórios vermelhos) · 9 limpos (CLEAN) · 14 PRs com pelo menos um contexto obrigatório de `main` vermelho.

## 2. Proteções, rulesets, CODEOWNERS, CI e segurança do repositório

Fatos verificados com `gh api` e leitura de `.github/`:

| Item | Estado | Avaliação |
|---|---|---|
| Branch protection de `main` | Ativa. `required_status_checks.contexts` = `build-and-test`, `gitleaks`, `Supabase local gates (RLS smoke + scope + REST)`, `edge-functions-typecheck`, `outbox-contract`, `anti-replay-diagnostic-gate`. `strict = false`. `enforce_admins = true`. `allow_force_pushes = false`. `allow_deletions = false`. | Bom. Igual à política em `docs/CI_POLICY.md`. |
| **Revisão obrigatória** | **Não configurada.** A chave `required_pull_request_reviews` não existe na resposta da API. | **Lacuna crítica.** Um PR pode ser mesclado sem nenhuma aprovação humana, desde que os seis checks passem. O `CODEOWNERS` não é exigido. |
| Rulesets | Nenhum (`/rulesets` retorna `[]`). | Sem camada moderna de governança. |
| `required_signatures` | Desativado. | Aceitável para o porte, mas registrar a decisão. |
| `required_linear_history` | Desativado. Merge commit, squash e rebase permitidos. | Mistura de estilos dificulta a leitura do histórico. Padronizar (ver `GITHUB_WORKFLOW.md`). |
| `delete_branch_on_merge` | Ativado. | Bom, mas as branches antigas mostram que nem sempre é usado. |
| `allow_auto_merge` | Ativado. | Só usar com revisão obrigatória, o que hoje não existe. |
| **Visibilidade** | **Repositório público.** | Qualquer dado em histórico ou docs é público. Ver item de segredos abaixo. |
| Secret scanning e push protection | **Desativados** (`security_and_analysis`). | Recomendado ativar. A ação é de configuração e exige autorização do dono. |
| Dependabot security updates | Desativado. Dependabot *version updates* ativo (`.github/dependabot.yml`, grupos por ecossistema). | Alertas de CVE dependem de ativação na UI (o próprio arquivo avisa). |
| Permissões do workflow (`GITHUB_TOKEN`) | `default_workflow_permissions = read`. `can_approve_pull_request_reviews = false`. | Bom. |
| Pin de actions por SHA | `sha_pinning_required = false`. Actions de terceiros permitidas sem restrição. | Risco de cadeia de suprimento. #678 já pina `Swatinem/rust-cache` por SHA. Ampliar a prática. |
| CODEOWNERS | 121 linhas, com owners por time (`@nocodenn-cell/backend-lead`, `security`, `fiscal`, etc.). | Bem estruturado, mas não exigido pela proteção (ver primeira linha). |
| Workflows | 11 arquivos em `.github/workflows/`. `ci-backend-supabase.yml` é o gate central. | Vários PRs alteram o mesmo workflow (ver seção 5). |
| Drift de migrations | `.github/deploy-governance/deferred-migrations.json` lista **18** versões adiadas em `main`. | Ver seção 4. |
| Segredos em código | `pdv-importados/.env.test` e `.env.production.example` estão versionados com `NEXT_PUBLIC_SUPABASE_ANON_KEY`. A chave decodificada tem `role = anon`, ou seja, é a chave pública, não a de serviço. Nenhum JWT de `service_role` ou token `sbp_`/`ghp_`/`gho_` foi encontrado nos arquivos rastreados de `main`. | Risco baixo, mas o `.env.test` deveria conter placeholder. Além disso, o ref do projeto de produção (`kbabmewnahysfvlybiak`) aparece em `docs/ops/DRIFT_MIGRATIONS_MATRIZ_2026-11-05.md` e no PROXIMOS_PASSOS. Não é segredo, mas facilita ataque dirigido em repositório público. |

**Últimos runs de `main`:** `CI pdv-local` e backups verdes em 2026-11-09 e 2026-11-10. Um run de Dependabot agrupado falhou em 2026-11-09. Os runs de `ci-backend-supabase` e `deploy-governance` **não aparecem entre os oito mais recentes**, o que indica que os gates de banco não rodam em `main` com a frequência esperada. Vale confirmar antes de considerar o gate de drift confiável.

## 3. Inventário dos 53 PRs

Colunas: **Categoria** é a classificação primária. **Flags** são condições adicionais (CRÍTICO, CONFLITO, draft, checks). **Evidência** resume o que foi observado no código, nos commits, nos checks e nos comentários.

| # | Título | Autor | Head → Base | Abertura | Atualização | Commits | Arquivos | Checks falhando | Merge | Draft | Categoria | Flags | Dependências | Sobreposição | Evidência |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [#448](https://github.com/nocodenn-cell/jinlong/pull/448) | fiscal(focus): Sprint P0 — XML real, cancelamento com XML separado, classificação por stat | nocodenn-cell | `feat/fiscal-p0-focus-xml` → `main` | 2026-10-03 | 2026-10-08 | 1 | 17 | E2E crítico (sistema de risco), e2e-playwright, migration-remote-drift | DIRTY | sim | **BLOQUEADO** | CONFLITO | decisão fiscal (Focus NFe) | — | Sprint P0 Focus NFe (XML real, cancelamento); migração 20261003120000 + rollback; sem review; conflito desde 2026-10-08 |
| [#484](https://github.com/nocodenn-cell/jinlong/pull/484) | docs(ops): sprint confiabilidade operacional — NO-GO piloto | nocodenn-cell | `cursor/confiabilidade-operacional-a7cd` → `main` | 2026-10-08 | 2026-10-08 | 1 | 5 | e2e-playwright, migration-remote-drift | UNSTABLE | sim | **SUBSTITUÍDO** | — | — | 485, 500 | Só docs do NO-GO de 2026-10-08; o mesmo conteúdo está em #485/#500 |
| [#485](https://github.com/nocodenn-cell/jinlong/pull/485) | fix(p0): sonda JIT direta + reconciliação estabilização piloto (NO-GO backup) | nocodenn-cell | `cursor/p0-estabilizacao-jit-1966` → `main` | 2026-10-08 | 2026-10-08 | 4 | 13 | e2e-playwright, migration-remote-drift | DIRTY | não | **DUPLICADO** | CONFLITO | base de #486 | 486, 500, 506 | Sonda JIT + docs de backup; mesmos arquivos de backup que #500 e #506 |
| [#486](https://github.com/nocodenn-cell/jinlong/pull/486) | fix(ci): guard do backup JIT, redação literal e diagnóstico IPv6 | nocodenn-cell | `cursor/backup-jit-ci-ipv6-9f74` → `cursor/p0-estabilizacao-jit-1966` | 2026-10-08 | 2026-10-08 | 3 | 13 | — | CLEAN | sim | **BLOQUEADO** | empilhado sobre #485 | #485 (base) | 485 | CI guard JIT; só faz sentido após #485 |
| [#487](https://github.com/nocodenn-cell/jinlong/pull/487) | Pós-OPS-02: bloqueio da 20261006120000 e provas locais fiscais/caixa (fases B–D) | nocodenn-cell | `cursor/pos-ops02-bcd-integridade-93a3` → `main` | 2026-10-08 | 2026-10-08 | 3 | 17 | Supabase local gates (RLS smoke + scope + REST), e2e-playwright, migration-remote-drift | DIRTY | sim | **SUBSTITUÍDO** | CONFLITO | — | 488, 498, 499, 500 | Pós-OPS-02 fases B–D; 4 arquivos em comum com a cadeia 488→498→499→500 |
| [#488](https://github.com/nocodenn-cell/jinlong/pull/488) | fix(p0): deny-list financeira + provas fiscais/financeiras (sem apply remoto) | nocodenn-cell | `cursor/p0-seguranca-integridade-1966` → `main` | 2026-10-08 | 2026-10-08 | 8 | 23 | e2e-playwright, migration-remote-drift, Vercel – jinlong-site | DIRTY | sim | **SUBSTITUÍDO** | CONFLITO; CRÍTICO | — | 498, 499, 500 | Deny-list financeira: 8/8 commits contidos em #498 e em #500; fechar só após #500 mesclado |
| [#489](https://github.com/nocodenn-cell/jinlong/pull/489) | docs(p0): restore sintético local + checklist smoke presencial | nocodenn-cell | `cursor/p0-recuperacao-ops-1966` → `main` | 2026-10-08 | 2026-10-08 | 2 | 4 | e2e-playwright | UNSTABLE | sim | **DUPLICADO** | — | — | 500 | Docs de restore sintético; #500 traz p0-backup-restore-drill-synthetic |
| [#490](https://github.com/nocodenn-cell/jinlong/pull/490) | Install Vercel Speed Insights | app/vercel | `vercel/install-vercel-speed-insights-cr0g3c` → `feat/site-comercial-bilingue-v1` | 2026-10-08 | 2026-10-08 | 1 | 3 | — | CLEAN | sim | **BLOQUEADO** | empilhado sobre #491 | #491 (base feat/site-comercial) | 491 | Vercel Speed Insights; base é branch de outro PR |
| [#491](https://github.com/nocodenn-cell/jinlong/pull/491) | feat(site): site comercial bilíngue pt-BR/zh-CN como app independente (site/) | nocodenn-cell | `feat/site-comercial-bilingue-v1` → `main` | 2026-10-08 | 2026-10-23 | 6 | 76 | e2e-playwright, migration-remote-drift | DIRTY | não | **BLOQUEADO** | CONFLITO; P1 Codex aberto | decisão de publicação zh-CN | 490, 546, 676 | 76 arquivos; P1 aberto: link ERP oculto abaixo de 880px |
| [#492](https://github.com/nocodenn-cell/jinlong/pull/492) | docs(multiempresa): fechamento P0 + readiness multi-tenant (sem DDL) | nocodenn-cell | `cursor/p0-multitenant-readiness-1966` → `main` | 2026-10-08 | 2026-10-08 | 1 | 10 | e2e-playwright, Vercel – jinlong-site | UNSTABLE | sim | **DUPLICADO** | — | — | 493, 495, 496 | Docs-only de multiempresa; mesma pasta docs/architecture/multiempresa dos três |
| [#493](https://github.com/nocodenn-cell/jinlong/pull/493) | feat(m1): fundação multiempresa experimental local (sem DDL remoto) | nocodenn-cell | `cursor/m1-multiempresa-fundacao-1966` → `main` | 2026-10-08 | 2026-10-08 | 3 | 10 | e2e-playwright, migration-remote-drift, Vercel – jinlong-site | DIRTY | sim | **SUBSTITUÍDO** | CONFLITO | — | 496, 537 | M1 experimental em migrations-experimental-m1; #496 contém o mesmo arquivo |
| [#495](https://github.com/nocodenn-cell/jinlong/pull/495) | docs(m2a): contrato de empresa ativa e gate de arquitetura (sem implementação) | nocodenn-cell | `cursor/m2a-empresa-ativa-contrato-1966` → `main` | 2026-10-08 | 2026-10-08 | 1 | 8 | e2e-playwright, migration-remote-drift, Vercel – jinlong-site | DIRTY | sim | **SUBSTITUÍDO** | CONFLITO | — | 496 | Docs M2a; os mesmos arquivos reaparecem em #496 |
| [#496](https://github.com/nocodenn-cell/jinlong/pull/496) | feat(m2b): F1–F3 contexto seguro de empresa ativa (local experimental) | nocodenn-cell | `cursor/m2b-empresa-ativa-contexto-1966` → `main` | 2026-10-08 | 2026-10-08 | 1 | 22 | build-and-test, migration-remote-drift, Vercel – jinlong-site | DIRTY | sim | **EM DESENVOLVIMENTO** | CONFLITO | #493 (migração M1), #495 (docs) | 492, 495, 623, 542 | M2b; 22 arquivos; depende de migração de #493 ainda não aplicada |
| [#498](https://github.com/nocodenn-cell/jinlong/pull/498) | docs(p1-02): validação final da matriz de reconciliação (GO/NO-GO) | nocodenn-cell | `cursor/p0-rollout-prontidao-1966` → `main` | 2026-10-08 | 2026-10-08 | 9 | 26 | e2e-playwright, migration-remote-drift, Vercel – jinlong-site | DIRTY | sim | **SUBSTITUÍDO** | CONFLITO | — | 488, 499, 500 | 9 commits = 8 de #488 + 1; contido em #499 e #500 |
| [#499](https://github.com/nocodenn-cell/jinlong/pull/499) | docs(p1-02): fechamento da reconciliação Git × produção (sem rollout) | nocodenn-cell | `cursor/p1-02-fechamento-reconciliacao-1966` → `main` | 2026-10-08 | 2026-10-08 | 10 | 29 | e2e-playwright, migration-remote-drift, Vercel – jinlong-site | DIRTY | sim | **SUBSTITUÍDO** | CONFLITO | — | 488, 498, 500 | 10 commits; contido em #500 |
| [#500](https://github.com/nocodenn-cell/jinlong/pull/500) | docs(p0): desbloqueio operacional — backup drill, 163100, SSOT-004 | nocodenn-cell | `cursor/p0-desbloqueio-reconciliacao-1966` → `main` | 2026-10-08 | 2026-10-08 | 12 | 33 | build-and-test, migration-remote-drift, Vercel – jinlong-site | DIRTY | não | **BLOQUEADO** | CONFLITO; CRÍTICO; P1 Codex aberto | #488, #498, #499 (contidos) | 485, 487, 489, 506 | 12 commits; P1: agregados do painel financeiro somem sem 20261006120000 no db reset; build-and-test e migration-remote-drift vermelhos |
| [#506](https://github.com/nocodenn-cell/jinlong/pull/506) | docs(backup): diagnóstico do PAM authentication failed e probe seguro… | nocodenn-cell | `docs/ordem1-ci-backup` → `main` | 2026-10-08 | 2026-10-08 | 1 | 2 | e2e-playwright, Vercel – jinlong-site | UNSTABLE | não | **OBSOLETO** | — | — | 485, 500 | Diagnóstico PAM; hipótese superada pela sonda JIT; P2 Codex sem resolver (PAT em argumento de processo) |
| [#508](https://github.com/nocodenn-cell/jinlong/pull/508) | docs(audits): auditoria Jinlong 360° de maturidade (somente leitura) | nocodenn-cell | `cursor/jinlong-360-auditoria-maturidade-1966` → `main` | 2026-10-09 | 2026-10-09 | 2 | 2 | Vercel – jinlong-site | UNSTABLE | sim | **OBSOLETO** | — | — | — | Auditoria 360° somente leitura (2 docs); Vercel vermelho; substituída por esta auditoria (confirmar) |
| [#530](https://github.com/nocodenn-cell/jinlong/pull/530) | feat(capacity): STG-01 preparação da homologação isolada | nocodenn-cell | `cursor/stg-01-homologacao-isolada-010e` → `main` | 2026-10-09 | 2026-10-29 | 2 | 24 | — | BLOCKED | não | **SUBSTITUÍDO** | CONFLITO | — | 532, 533, 534 | 2 commits, ambos contidos em #533; P1 Codex no guard de ambiente (lib-env.mjs) |
| [#532](https://github.com/nocodenn-cell/jinlong/pull/532) | docs(capacity): STG-01 Option B prep + recomendação estratégia B (baseline local) | nocodenn-cell | `cursor/stg-01-reassessment-migrations-010e` → `cursor/stg-01-homologacao-isolada-010e` | 2026-10-10 | 2026-10-10 | 3 | 23 | — | CLEAN | sim | **SUBSTITUÍDO** | — | #530 (base) | 530, 533, 534 | Cumulativo: contido em #533 e #534 |
| [#533](https://github.com/nocodenn-cell/jinlong/pull/533) | feat(capacity): Gate A-L1 — baseline local fastproduct-capacity (G1–G5) | nocodenn-cell | `cursor/stg-01-al1-capacity-local-010e` → `main` | 2026-10-10 | 2026-10-23 | 7 | 52 | — | DIRTY | sim | **BLOQUEADO** | CRÍTICO | decisão STG-01 A vs B | 530, 532, 534 | 52 arquivos (+22.5k); guard de staging com P1 aberto; estratégia pendente |
| [#534](https://github.com/nocodenn-cell/jinlong/pull/534) | CAP-02: carga progressiva k6 local (T00–T05) + reconciliação e relatório | nocodenn-cell | `cursor/cap-02-k6-progressive-010e` → `cursor/stg-01-al1-capacity-local-010e` | 2026-10-10 | 2026-10-10 | 9 | 12 | — | CLEAN | sim | **BLOQUEADO** | empilhado sobre #533 | #533 (base) | 533 | Carga k6; 9 commits próprios |
| [#537](https://github.com/nocodenn-cell/jinlong/pull/537) | [NÃO FAZER MERGE] Import Intelligence: multiempresa (M1/F1), NF-e (F3), persistência (F4)  | nocodenn-cell | `claude/import-intelligence-s1a` → `main` | 2026-10-10 | 2026-10-23 | 25 | 161 | Supabase local gates (RLS smoke + scope + REST), e2e-playwright, migration-remote-drift | DIRTY | sim | **BLOQUEADO** | [NÃO FAZER MERGE] no título; CRÍTICO | decisão de negócio (NF-e / F5) | 493, 496 (M1 em 3 cópias) | 100 arquivos, 25 commits; versão 20261010120000 colide com caixa_sem_loja_padrao já em main (deferida) |
| [#541](https://github.com/nocodenn-cell/jinlong/pull/541) | feat(estoque): chrome fixo do hub e fluxo das abas | nocodenn-cell | `cursor/estoque-ux-abas-4c71` → `main` | 2026-10-12 | 2026-10-12 | 1 | 34 | e2e-playwright | DIRTY | sim | **EM DESENVOLVIMENTO** | CONFLITO; e2e vermelho | — | 542, 657, 661 (i18n) | Hub de estoque; 34 arquivos |
| [#542](https://github.com/nocodenn-cell/jinlong/pull/542) | UX: ficha de clientes e lista compacta de funcionários | nocodenn-cell | `cursor/ux-clientes-funcionarios-e64a` → `main` | 2026-10-12 | 2026-10-12 | 2 | 31 | e2e-playwright | DIRTY | sim | **EM DESENVOLVIMENTO** | CONFLITO; e2e vermelho | — | 541, 623, 657 | Ficha de clientes; 31 arquivos |
| [#546](https://github.com/nocodenn-cell/jinlong/pull/546) | chore(deps): bump the sentry group across 1 directory with 5 updates | app/dependabot | `dependabot/npm_and_yarn/sentry-afb6517812` → `main` | 2026-10-13 | 2026-11-09 | 4 | 6 | e2e-playwright, migration-remote-drift | UNSTABLE | não | **PRONTO PARA REVISÃO** | e2e e drift vermelhos (não obrigatórios) | — | 547, 548, 549, 679 (lockfile) | Bump Sentry (grupo); toca next.config.js da raiz; confirmar build-and-test verde |
| [#547](https://github.com/nocodenn-cell/jinlong/pull/547) | chore(deps): bump eslint-config-next from 15.5.15 to 16.4.2 | app/dependabot | `dependabot/npm_and_yarn/eslint-config-next-16.4.0` → `main` | 2026-10-13 | 2026-10-22 | 1 | 2 | Supabase local gates (RLS smoke + scope + REST), build-and-test, migration-remote-drift | BLOCKED | não | **BLOQUEADO** | checks obrigatórios vermelhos | #548 (Next 15 vs eslint-config-next 16) | 546, 548, 549, 679 | Major 15→16; build-and-test e Supabase gates vermelhos |
| [#548](https://github.com/nocodenn-cell/jinlong/pull/548) | chore(deps): bump next from 15.5.15 to 15.5.28 | app/dependabot | `dependabot/npm_and_yarn/next-15.5.27` → `main` | 2026-10-13 | 2026-10-22 | 1 | 3 | Supabase local gates (RLS smoke + scope + REST), build-and-test, migration-remote-drift | BLOCKED | não | **BLOQUEADO** | checks obrigatórios vermelhos | — | 546, 547, 549, 679 | Next 15.5.15→15.5.28; build-and-test e Supabase gates vermelhos |
| [#549](https://github.com/nocodenn-cell/jinlong/pull/549) | chore(deps): bump eslint from 8.57.1 to 10.13.0 | app/dependabot | `dependabot/npm_and_yarn/eslint-10.12.0` → `main` | 2026-10-13 | 2026-10-22 | 1 | 2 | Supabase local gates (RLS smoke + scope + REST), build-and-test, migration-remote-drift | BLOCKED | não | **BLOQUEADO** | checks obrigatórios vermelhos | — | 546, 547, 548, 679 | ESLint 8→10 (major); build-and-test e Supabase gates vermelhos |
| [#550](https://github.com/nocodenn-cell/jinlong/pull/550) | style(ux): recuperar tokens de ouro do QwenCode (Caixa, Auth e Legal) | nocodenn-cell | `recovery/qwencode-ux-tokens-20261014` → `main` | 2026-10-14 | 2026-11-07 | 4 | 3 | — | CLEAN | não | **PRONTO PARA REVISÃO** | — | — | — | Tokens visuais (+7/-8, 3 arquivos); sem checks vermelhos; mergeável |
| [#623](https://github.com/nocodenn-cell/jinlong/pull/623) | refactor(papeis): remover ADMIN do escopo das lojas | nocodenn-cell | `refactor/remover-admin-papeis` → `main` | 2026-10-22 | 2026-11-06 | 42 | 120 | — | DIRTY | sim | **CRÍTICO** | CONFLITO; P2 Codex aberto | #675 e #496 (adminPolicy) | 496, 542, 675; migração 20261028120000 colide com main | Remove ADMIN de papéis de loja (RBAC); 42 commits (15 únicos); reimplementa migrações deferidas de main |
| [#636](https://github.com/nocodenn-cell/jinlong/pull/636) | chore(ci): bump actions/setup-node from 4 to 7 | app/dependabot | `dependabot/github_actions/actions/setup-node-7` → `main` | 2026-10-26 | 2026-10-26 | 1 | 6 | Supabase local gates (RLS smoke + scope + REST), build-and-test, migration-remote-drift | BLOCKED | não | **BLOQUEADO** | checks obrigatórios vermelhos | — | 637, 678 | Dependabot actions/setup-node 4→7; mesmos workflows de #637 |
| [#637](https://github.com/nocodenn-cell/jinlong/pull/637) | chore(ci): bump actions/checkout from 4 to 7 | app/dependabot | `dependabot/github_actions/actions/checkout-7` → `main` | 2026-10-26 | 2026-10-26 | 1 | 10 | Supabase local gates (RLS smoke + scope + REST), build-and-test, migration-remote-drift | BLOCKED | não | **BLOQUEADO** | checks obrigatórios vermelhos | — | 636, 678 | Dependabot actions/checkout 4→7; 10 workflows |
| [#642](https://github.com/nocodenn-cell/jinlong/pull/642) | test(caixa): corrigir fixture S7 para caixa pagador explícito | nocodenn-cell | `fix/int01-s7-caixa-pagador` → `main` | 2026-10-28 | 2026-10-29 | 1 | 1 | — | DIRTY | não | **EM DESENVOLVIMENTO** | CONFLITO | confirmar se #675 cobre a correção | — | Fixture de 1 arquivo; candidato a obsoleto se #675 incluir a correção |
| [#656](https://github.com/nocodenn-cell/jinlong/pull/656) | feat(caixa): fechamento de caixa bloqueado com venda em espera (D-06) | nocodenn-cell | `claude/pdv-d06-fechar-caixa-migration` → `main` | 2026-11-04 | 2026-11-04 | 1 | 1 | Supabase local gates (RLS smoke + scope + REST), deploy-governance, migration-remote-drift | BLOCKED | não | **DUPLICADO** | BLOCKED; checks obrigatórios vermelhos | — | 675 (regra D1), 657 | Fechamento de caixa bloqueia venda em espera; mesma regra de #675 D1 (20261106100000) |
| [#657](https://github.com/nocodenn-cell/jinlong/pull/657) | Claude/pdv rn03 descarte auditavel | nocodenn-cell | `claude/pdv-rn03-descarte-auditavel` → `main` | 2026-11-04 | 2026-11-04 | 2 | 13 | Supabase local gates (RLS smoke + scope + REST), deploy-governance, e2e-playwright, migration-remote-drift | BLOCKED | não | **BLOQUEADO** | BLOCKED; checks obrigatórios vermelhos | #656 (commit contido) | 656, 541, 542 | RN03 descarte auditável; o diff inclui o commit de #656 |
| [#658](https://github.com/nocodenn-cell/jinlong/pull/658) | docs(ops): preparar liberação segura da Growth-001 para o Hub Comercial | nocodenn-cell | `claude/jinlong-leads-admin-panel-c8a116` → `main` | 2026-11-04 | 2026-11-05 | 3 | 5 | migration-remote-drift | DIRTY | sim | **BLOQUEADO** | CONFLITO | decisão do proprietário (Growth-001 = 20261023130000, deferida) | 676, 677 | Docs de liberação do Hub; rollbacks de migração deferida |
| [#659](https://github.com/nocodenn-cell/jinlong/pull/659) | chore(governance): adiar formalmente 6 migrations pendentes e corrigir CLI do drift | nocodenn-cell | `claude/governanca-migrations-adiadas` → `main` | 2026-11-05 | 2026-11-09 | 6 | 7 | deploy-governance, migration-remote-drift | UNSTABLE | sim | **NECESSÁRIO** | CRÍTICO (governança) | — | 672, 667, 673 (manifesto), 500 (p0-migration-status) | Adia 6 migrações e corrige CLI do drift; deploy-governance e drift vermelhos |
| [#661](https://github.com/nocodenn-cell/jinlong/pull/661) | fix(auth): recuperação de senha mostra erro claro e valida na tela | nocodenn-cell | `claude/jinlong-hub-password-recovery-5898d9` → `main` | 2026-11-05 | 2026-11-06 | 6 | 8 | — | CLEAN | não | **PRONTO PARA REVISÃO** | altera .gitleaks.toml | — | 541, 657 (i18n) | Recuperação de senha; sem checks vermelhos; Codex sem findings; verificar allowlist do gitleaks |
| [#663](https://github.com/nocodenn-cell/jinlong/pull/663) | fix(catalogo): Cadastro rápido desabilitado até a hidratação | nocodenn-cell | `fix/catalogo-cadastro-rapido-hidratacao` → `main` | 2026-11-05 | 2026-11-05 | 2 | 3 | — | CLEAN | sim | **PRONTO PARA REVISÃO** | — | — | — | Cadastro rápido com hidratação; 3 arquivos; sem checks vermelhos |
| [#667](https://github.com/nocodenn-cell/jinlong/pull/667) | teste: validação do migration drift gate no GitHub Actions (NÃO MESCLAR) | nocodenn-cell | `teste/drift-gate-validacao` → `main` | 2026-11-06 | 2026-11-06 | 1 | 12 | migration-remote-drift | UNSTABLE | sim | **OBSOLETO** | título: NÃO MESCLAR | — | 659, 672 | Teste de validação do drift gate; registrar evidência e fechar |
| [#668](https://github.com/nocodenn-cell/jinlong/pull/668) | ci(e2e): relatório Playwright por spec para a VAL-01 | nocodenn-cell | `fix/val01-relatorio-por-spec` → `main` | 2026-11-06 | 2026-11-06 | 1 | 4 | — | CLEAN | sim | **PRONTO PARA REVISÃO** | — | — | — | Relatório Playwright por spec; 4 arquivos de CI; sem checks vermelhos |
| [#669](https://github.com/nocodenn-cell/jinlong/pull/669) | fix(sec): 20261104120000 — perfis e privilégios padrão de anon (não aplicar sem decisão) | nocodenn-cell | `fix/anon-perfis-default-privileges` → `main` | 2026-11-06 | 2026-11-06 | 1 | 2 | deploy-governance, migration-remote-drift | UNSTABLE | sim | **CRÍTICO** | drift vermelho | decisão do proprietário (migração deferida) | 673 | Reescreve 20261104120000 presente em main como deferida (6140→7362 bytes); privilégios de anon |
| [#670](https://github.com/nocodenn-cell/jinlong/pull/670) | fix(sync-outbox): restaura checagem de token até registrar_venda_offline_com_token existir | nocodenn-cell | `fix/d-sync-outbox-sem-rpc-inexistente` → `main` | 2026-11-06 | 2026-11-06 | 1 | 1 | deploy-governance, migration-remote-drift | UNSTABLE | sim | **DUPLICADO** | CRÍTICO | — | 674 | Restaura checagem de token em sync-outbox; mesmo arquivo e mesmo problema de #674 |
| [#671](https://github.com/nocodenn-cell/jinlong/pull/671) | sec: bloqueia escrita direta de authenticated nas tabelas de venda (contenção A) | nocodenn-cell | `sec/contencao-dml-direto-a` → `main` | 2026-11-06 | 2026-11-06 | 1 | 2 | deploy-governance, migration-remote-drift | UNSTABLE | sim | **CRÍTICO** | drift vermelho | — | 623, 669 | Bloqueia escrita direta de authenticated em vendas; migração 20261106140207 fora do manifesto |
| [#672](https://github.com/nocodenn-cell/jinlong/pull/672) | ci(drift): guarda aceita apenas o projeto de homologação antes do supabase link | nocodenn-cell | `chore/guarda-drift-homolog` → `main` | 2026-11-06 | 2026-11-06 | 1 | 3 | migration-remote-drift | UNSTABLE | sim | **NECESSÁRIO** | altera CI | — | 659, 667 | Guarda de drift só aceita homolog antes do link; altera ci-backend-supabase.yml (CODEOWNERS /.github) |
| [#673](https://github.com/nocodenn-cell/jinlong/pull/673) | sec(anon): complemento de privilégios de anon em public (20261106150000) | nocodenn-cell | `sec/anon-complemento-privilegios` → `main` | 2026-11-07 | 2026-11-07 | 3 | 7 | deploy-governance, migration-remote-drift | UNSTABLE | não | **CRÍTICO** | 3 reviews; drift vermelho | #669 (anon); migração 20261104160000 deferida em main | 659 (manifesto) | Complemento de privilégios anon; Codex P2 respondido em b1721023; altera manifesto de deferidas |
| [#674](https://github.com/nocodenn-cell/jinlong/pull/674) | fix(sync): venda offline com desconto não chama RPC inexistente | app/cursor | `cursor/bugs-de-alta-gravidade-0cbf` → `main` | 2026-11-07 | 2026-11-07 | 1 | 3 | deploy-governance, outbox-contract, migration-remote-drift | BLOCKED | sim | **DUPLICADO** | BLOCKED; outbox-contract vermelho (obrigatório) | — | 670 | Venda offline com desconto; autor app/cursor; mesmo arquivo que #670 |
| [#675](https://github.com/nocodenn-cell/jinlong/pull/675) | feat(plano-liberacao): D1 a D6 — caixa, estorno, troco, conta PIX e atacado (DRAFT) | nocodenn-cell | `claude/plano-liberacao-d1-d3` → `main` | 2026-11-07 | 2026-11-07 | 13 | 42 | migration-remote-drift | UNSTABLE | sim | **CRÍTICO** | BLOCKED; label deploy-prod:aprovado (não é autorização) | #656 e #657 (regra D1) | 677 (versão 20261107120000 colide), 623 | 42 arquivos; 5 migrações fora do manifesto de deferidas |
| [#676](https://github.com/nocodenn-cell/jinlong/pull/676) | feat(leads): endpoint protegido do formulário comercial (service_role + p_client_ip) | nocodenn-cell | `claude/leads-endpoint-protegido-11f6f2` → `main` | 2026-11-07 | 2026-11-09 | 3 | 17 | migration-remote-drift | UNSTABLE | não | **BLOQUEADO** | drift vermelho; P2 Codex com correções declaradas | #677; migrações 20261104150000–170000 deferidas em main | 491 (site/), 677 | Endpoint protegido do formulário comercial; depende de RPC da #677 |
| [#677](https://github.com/nocodenn-cell/jinlong/pull/677) | feat(leads): migrations do registro de leads (remove anon insert policy; RPC com p_client_ | nocodenn-cell | `claude/leads-migrations-servico-ip` → `main` | 2026-11-09 | 2026-11-09 | 1 | 4 | Supabase local gates (RLS smoke + scope + REST), deploy-governance, migration-remote-drift | BLOCKED | não | **BLOQUEADO** | CRÍTICO; checks obrigatórios vermelhos | 20261104150000–170000 (deferidas em main) | 675 (versão 20261107120000 duplicada) | Remove policy anon insert de commercial_leads; Supabase gates vermelhos |
| [#678](https://github.com/nocodenn-cell/jinlong/pull/678) | chore(ci): Bump Swatinem/rust-cache from 42dc69e1aa15d09112580998cf2ef0119e2e91ae to c8037 | app/dependabot | `dependabot/github_actions/Swatinem/rust-cache-c8037a86dde8214a8310e9f54a8fc61ab362aa31` → `main` | 2026-11-09 | 2026-11-09 | 1 | 2 | — | CLEAN | não | **PRONTO PARA REVISÃO** | — | — | 636, 637 | Pin de SHA do rust-cache; checks verdes; revisar o pin |
| [#679](https://github.com/nocodenn-cell/jinlong/pull/679) | chore(deps): Bump the dev-minor-patch group across 1 directory with 9 updates | app/dependabot | `dependabot/npm_and_yarn/dev-minor-patch-23bbb9aeca` → `main` | 2026-11-09 | 2026-11-09 | 1 | 5 | Supabase local gates (RLS smoke + scope + REST), build-and-test, migration-remote-drift | BLOCKED | não | **BLOQUEADO** | checks obrigatórios vermelhos | — | 546, 547, 548, 549 | Grupo dev-minor-patch (9); lockfile +16.087/−13.752; build-and-test e Supabase gates vermelhos |

## 4. Migrations: colisões, drift e adiamentos

### 4.1 Colisões de versão (bloqueiam `supabase db push` / CLI)

Versões de migration são a chave primária de `supabase_migrations.schema_migrations`. Dois arquivos com a mesma versão quebram a aplicação e o `db reset`.

| Versão | Arquivo em `main` | Arquivo no PR | Situação |
|---|---|---|---|
| `20261010120000` | `caixa_sem_loja_padrao.sql` (deferida no manifesto) | `#537` → `m1_fundacao_multiempresa.sql` | **Colisão real.** `#537` tem [NÃO FAZER MERGE] no título. |
| `20261028120000` | `revoga_helpers_tenant_authenticated.sql` (ativa no arquivo, não listada como deferida) | `#623` → `sec_tokens_usuario_inativo_revogacao.sql` | **Colisão real.** O `#623` reorganiza migrations que já estão em `main`. |
| `20261107120000` | — | `#675` → `d2_estorno_dinheiro_caixa_aberto.sql` **e** `#677` → `commercial_leads_remove_anon_insert_policy.sql` | **Colisão entre PRs.** Quem for mesclado primeiro bloqueia o outro. |

Além disso, `20261103120000` aparece em `#656` e em `#657` com o mesmo conteúdo (o `#657` contém o commit de `#656`). Isso não é colisão, mas duplica a revisão.

### 4.2 Implementações duplicadas da mesma regra de banco

| Regra | Implementações | Observação |
|---|---|---|
| **M1 — fundação multiempresa** | `#493` (`migrations-experimental-m1/20261009000000`), `#496` (contém o mesmo arquivo), `#537` (`migrations/20261010120000_m1_…`) | Três cópias em três caminhos. Só uma deve sobreviver. |
| **Fechamento de caixa bloqueia venda em espera** | `#656` (`20261103120000`) e `#675` D1 (`20261106100000`) | Mesma regra, versões diferentes. Se os dois forem mesclados, a regra existe duas vezes. |
| **Fallback de RPC inexistente no sync-outbox** | `#670` e `#674` (ambos editam `backend/supabase/functions/sync-outbox/index.ts`) | Mesma falha, correções diferentes. |
| **Leads — registro com IP** | `#677` recria `public.registrar_lead_comercial` e `internal.commercial_lead_rate_check`. **`main` já tem essas funções** nas migrations deferidas `20261104150000`, `20261104160000` e `20261104170000`. | **Sobreposição direta.** Qual versão é a canônica? Hoje não há resposta no repositório. |
| **Privilégios de anon** | `main` tem `20261104120000_sec_anon_privilegios_minimos.sql` (6.140 bytes, deferida). `#669` reescreve o mesmo arquivo (7.362 bytes). `#673` cria `20261106150000` por cima. | `#669` altera uma migration que está em `main`, não em PR. Como ela ainda não foi aplicada em produção, a reescrita é tecnicamente possível, mas precisa ser decidida por escrito. |

### 4.3 Estado do manifesto de migrations adiadas (`.github/deploy-governance/deferred-migrations.json` em `main`)

Versões adiadas em `main` (18): `20261010120000`, `20261023130000`, `20261028100000`, `20261028101000`, `20261028110000`, `20261028120100`, `20261028121000`, `20261028122000`, `20261029155000`, `20261030100000`, `20261030120000`, `20261030130000`, `20261030140000`, `20261104120000`, `20261104150000`, `20261104160000`, `20261104170000`, `20261104180000`.

- **Os arquivos existem em `main`**, mas não foram aplicados em produção. O manifesto impede a aplicação automática, e cada entrada exige autorização explícita do dono, o label `deploy-prod:aprovado` e um PR que remova a entrada. **Ninguém deveria aplicar essas migrations pelo PR de leads, de segurança ou de PDV sem passar por esse caminho.**
- **`#659`** (adia 6 migrations e corrige a CLI do drift) e **`#673`** (complemento de anon) alteram o mesmo manifesto. Quem for mesclado primeiro cria conflito para o outro.
- **`#675`** traz cinco migrations novas (`20261106100000`–`20261107120000`) **que não estão no manifesto de adiadas**. Se forem mescladas, entram no próximo lote de deploy sem a revisão que as entradas do manifesto exigem. Esse é o risco mais alto de governança desta auditoria.
- O label `deploy-prod:aprovado` aparece em `#675`. Pela própria regra do manifesto, o label **não é autorização** de deploy nem de merge. Não foi tratado como tal nesta auditoria.

### 4.4 Gate de drift

O check `migration-remote-drift` está vermelho em 34 dos 53 PRs. Em `main`, a versão remota (`kbabmewnahysfvlybiak`) tem 11 migrations sem registro (`docs/ops/DRIFT_MIGRATIONS_MATRIZ_2026-11-05.md`). Esse gate **não** é obrigatório, e a decisão de torná-lo obrigatório está registrada como "quando o backlog zerar" em `docs/CI_POLICY.md`. Hoje o drift é uma dívida conhecida, não um erro novo.

## 5. Sobreposições e dependências

### 5.1 Cadeias de commits compartilhados (verificado com `git rev-list origin/main..origin/<head>`)

- **Cadeia P0 — `#488 ⊂ #498 ⊂ #499 ⊂ #500`.** Os 8 commits de `#488` estão contidos em `#498`; `#498` (9) contém `#488` + 1 commit; `#499` (10) contém `#498` + 1; `#500` (12) contém `#499` + 2. Os quatro PRs apontam para `main`. **Mesclar os quatro juntos ou mesclar só `#500` e fechar os outros, mas nunca mesclar dois deles.** Os arquivos de `#487` também se sobrepõem com essa cadeia (4 arquivos em comum).
- **Cadeia STG-01 — `#530 ⊂ #532 ⊂ #533 ⊂ #534`.** `#530` (2 commits) está em `#532` (5, 3 próprios), que está em `#533` (7). `#534` tem base `#533` e 9 commits próprios. `#532` aponta para `#530` como base, mas `#533` aponta para `main` e leva os commits de `#530` e `#532` junto. Mesclar `#533` leva o trabalho de `#530` e `#532` sem fechá-los.
- **`#656 ⊂ #657`.** `#657` aponta para `main` e inclui o commit de `#656`. Mesclar `#656` deixa `#657` com diff duplicado ou com conflito.
- **`#485 ∩ #486`.** `#486` é empilhado sobre `#485` (3 commits em comum).
- **`#490 ∩ #491`.** `#490` (Vercel Speed Insights) é empilhado sobre `#491` (site bilíngue).

### 5.2 Dependências semânticas (não por commit)

1. `#676` (endpoint de leads) → depende de `#677` (RPC com `p_client_ip`).
2. `#677` → depende das migrations deferidas `20261104150000`–`170000` de `main`, que ele também recria (ver 4.2).
3. `#673` (anon) → depende de `#669` (privilégios anon) e de `20261104160000` (deferida em `main`).
4. `#496` (M2b) → depende da migration M1 de `#493` e dos docs de `#495`.
5. `#657` → depende de `#656`.
6. `#675` (D1) → sobrepõe-se a `#656` na regra de fechamento de caixa.
7. `#670` ↔ `#674` → mesma correção no sync-outbox; escolher uma.
8. `#658` (Growth-001 / Hub Comercial) → depende de decisão do dono sobre `20261023130000` (deferida). Sem essa decisão, o PR não pode ir para `main`.
9. `#547` ↔ `#548` → `eslint-config-next 16` exige Next compatível; `#548` é Next 15.x. Mesclar um sem o outro quebra o build.
10. `#546`, `#547`, `#548`, `#549` e `#679` alteram `package-lock.json` e `package.json` de `pdv-importados`. Cada um precisa ser rebaseado após o anterior.
11. `#636` e `#637` alteram os mesmos workflows (`setup-node` e `checkout`).

### 5.3 Sobreposição por arquivo (com pelo menos 3 PRs)

- `.github/workflows/ci-backend-supabase.yml`: 13 PRs (#448, #487, #488, #498, #499, #500, #636, #637, #658, #659, #667, #672, #673). Maior ponto de conflito de CI.
- `backend/scripts/p0-migration-status.mjs`: #487, #488, #498, #499, #500, #659, #667.
- `package.json`: #485, #486, #487, #488, #491, #498, #499, #500, #530, #532, #533, #546.
- `backend/supabase/forbidden-migrations.json`: #488, #498, #499, #500.
- `backend/supabase/functions/sync-outbox/index.ts`: #493, #623, #670, #674.
- `pdv-importados/lib/admin/policy/adminPolicy.ts`: #496, #542, #623 (a política de ADMIN é a mesma que `#623` remove).

## 6. Situação real dos grupos pedidos na missão

### 6.1 Leads e Hub Comercial — #676, #677, #658

- **Ordem correta:** `#677` (migrations e RPC) → `#676` (endpoint que chama a RPC) → `#658` (liberação do Hub). Nada disso deve ir para `main` antes da decisão sobre as migrations `20261104150000`–`170000`.
- **Problema central:** `#677` recria duas funções que `main` já tem como migrations deferidas. Antes de mesclar, decidir se a versão deferida de `main` é substituída (e a entrada do manifesto removida) ou se `#677` é descartado em favor dela.
- **Integração com segurança:** `#677` remove a policy `anon INSERT` em `commercial_leads`. O PROXIMOS_PASSOS (P0) registra isso como regressão: o formulário comercial do site falha porque `anon` não pode mais inserir diretamente. A correção de `#676` (endpoint protegido com `service_role`) resolve a regressão **somente** se `#677` também for mesclado. Os dois precisam ir juntos.
- **Codex (P2) em `#676`:** CORS e Content-Type em `site/app/pedido-demo/route.ts`. A resposta do autor cita o commit `8d5f6d87`, que não foi revisado nesta auditoria. Confirmar antes de aprovar.
- **Estado:** `#677` `BLOCKED` com check obrigatório (`Supabase local gates`) vermelho; `#676` `UNSTABLE`; `#658` `DIRTY` e draft.

### 6.2 Segurança e integridade — #673, #671, #670, #623

- **`#671`** (bloqueia escrita direta de `authenticated` em tabelas de venda, "contenção A") e **`#673`** (complemento de privilégios de anon) são **complementares**, mas dependem da base de anon de `#669`/`main`. `#673` aponta para `main` e não para `#669`; quem for mesclado primeiro cria conflito de versão e de conteúdo no `schema`.
- **`#670`** e **`#674`** são a mesma correção (sync-outbox sem RPC inexistente). Escolher **um**. `#670` restaura a checagem de token; `#674` troca a RPC. A checagem de token é a que protege o caminho de venda offline. Preferir `#670` como base e revisar `#674`.
- **`#623`** (remover ADMIN do escopo de lojas) é **CRÍTICO**: altera RBAC global. Ele reimplementa migrations que `main` já tem como deferidas (`20261028100000`–`20261028150000`), colide com `20261028120000` e toca `adminPolicy.ts`, que `#496` e `#542` também tocam. O PROXIMOS_PASSOS (P1) já pede decisão sobre o comportamento sem ADMIN nos testes. **Não mesclar antes dessa decisão.**

### 6.3 Governança e migrations — #672, #661, #659, #668

- **`#659`** é o PR que faz o gate de drift e o manifesto caminharem juntos. É o único "NECESSÁRIO" de governança com risco baixo se revisado. Ainda está em draft e vermelho em `deploy-governance`.
- **`#672`** restringe a guarda de drift a homologação antes do `supabase link`. Altera `ci-backend-supabase.yml` (CODEOWNERS `/.github/` → tech-lead). Revisar com o tech-lead.
- **`#667`** é um teste do próprio drift gate, com título "NÃO MESCLAR". Registrar a evidência e fechar com autorização. É o exemplo de PR cuja função já foi cumprida.
- **`#661`** (recuperação de senha) está limpo e sem findings do Codex, mas altera `.gitleaks.toml`. Antes de aprovar, confirmar se a alteração adiciona allowlist. Uma allowlist ampla enfraquece o gate de segredos.
- **Estado do drift gate:** vermelho por dívida conhecida (11 migrations sem registro em produção). Não deve ser tratado como regressão nova, mas também não deve ser tornado obrigatório enquanto a dívida existir.

### 6.4 PDV e caixa — #675, #674, #657, #656

- **`#656` e `#675` (D1) implementam a mesma regra** (fechamento bloqueia venda em espera). Escolher um. `#656` é menor (1 migration) e tem Codex P2 sobre serialização com `colocar_venda_em_espera`. `#675` é um pacote maior (42 arquivos) que traz a mesma regra mais D2–D5.
- **`#657`** (RN03, descarte auditável) depende de `#656` (o diff inclui o commit dele).
- **`#675`** é o PR mais arriscado de PDV: 42 arquivos, 13 commits, cinco migrations fora do manifesto e a colisão de versão `20261107120000` com `#677`. Não deve ser mesclado antes de (a) resolver a colisão, (b) decidir se D1–D5 entram no manifesto de adiadas ou são aplicados, e (c) ter validação presencial do PDV, que o PROXIMOS_PASSOS (P0) cita como pré-requisito.
- **`#674`** (venda offline com desconto) tem o check obrigatório `outbox-contract` vermelho. É o único PDV com risco de caixa offline sem contrato validado.
- **Integridade de vendas:** a regra de fechamento (`#656`/`#675`) é a única tentativa no repositório de impedir que caixa feche com venda pendente. Não há um PR de auditoria para o caso de venda "órfã" após falha de conversão (Codex P2 em `#656`).

### 6.5 Qualidade e UX — #669, #663, #642

- **`#669`** é segurança (privilégios de anon) e **CRÍTICO**, não UX. Está listado como UX na missão, mas é o PR de segurança mais urgente do grupo. Ver 4.2 e 6.2.
- **`#663`** (cadastro rápido desabilitado até hidratação) está limpo e sem checks vermelhos. Pronto para revisão depois de sair de draft.
- **`#642`** é uma fixture de um arquivo (`caixa-reconciliacao-contrato.test.sql`). Candidato a obsoleto se `#675` já corrigir o caixa pagador. Confirmar antes de fechar.

### 6.6 Dependências — #679, #678, #637, #636, #550, #549

| PR | Tipo | Risco | Estado |
|---|---|---|---|
| #549 | ESLint 8.57 → 10.13 (major) | Alto: mudança de config e de regras | `BLOCKED`; checks obrigatórios vermelhos |
| #547 | eslint-config-next 15.5 → 16.4 (major) | Alto: exige Next 16 | `BLOCKED`; checks obrigatórios vermelhos |
| #548 | Next 15.5.15 → 15.5.28 (patch) | Médio: patch de framework | Checks obrigatórios vermelhos; investigar antes de decidir |
| #546 | Sentry (grupo, 5 pacotes) | Baixo a médio: toca `next.config.js` da raiz | Pronto para revisão (validar build-and-test) |
| #636 | `actions/setup-node` 4 → 7 (major) | Médio: múltiplas majors de action | Checks obrigatórios vermelhos |
| #637 | `actions/checkout` 4 → 7 (major) | Médio: afeta 10 workflows | Checks obrigatórios vermelhos |
| #678 | Pin de SHA do `rust-cache` | Baixo: segurança | Pronto para revisão |
| #679 | Grupo dev/minor/patch (9 pacotes) | Alto: lockfile +16.087/−13.752 | Checks obrigatórios vermelhos |
| #550 | Tokens visuais (3 arquivos) | Baixo | Pronto para revisão, sem checks vermelhos |

Todos os PRs de dependência tocam `package-lock.json` ou workflows. **Só mesclar em sequência**: primeiro as majors isoladas (#636, #637, #549, #547 com #548), depois o grupo (#679), por último o rebase do grupo Sentry (#546). Dependabot precisará recriar os PRs que ficarem para trás.

## 7. Riscos (ordenados por severidade)

| # | Risco | Evidência | Severidade |
|---|---|---|---|
| R1 | **Merge sem nenhuma aprovação humana.** Proteção de `main` não exige review. | `gh api …/protection` sem `required_pull_request_reviews` | Crítica |
| R2 | **Colisão de versão de migration** em três casos. Um merge pode quebrar o `db push` ou o reset. | Seção 4.1 | Crítica |
| R3 | **`#675` traz cinco migrations fora do manifesto de adiadas**, com label `deploy-prod:aprovado` que não é autorização. | Seção 4.3 | Crítica |
| R4 | **`#669` reescreve migration de `main`** (anon). Duas versões do mesmo arquivo circulam. | Seção 4.2 | Alta |
| R5 | **`#623` remove ADMIN do escopo de lojas.** Mudança global de RBAC, com 42 commits, 100+ arquivos e colisão de versão. | Seção 6.2 | Alta |
| R6 | **Leads sem ordem definida.** `#677` recria funções que `main` tem como deferidas. Sem `#677` + `#676`, o formulário comercial segue quebrado (regressão declarada). | Seção 6.1 | Alta |
| R7 | **Repositório público** com ref de projeto de produção e anon key versionadas. Secret scanning e push protection desativados. | Seção 2 | Média |
| R8 | **Actions sem pin por SHA** e permissão ampla de actions de terceiros. | `sha_pinning_required = false` | Média |
| R9 | **14 PRs com check obrigatório vermelho** (build-and-test, Supabase gates, outbox-contract, edge-functions-typecheck). Muitos desses PRs são de dependência e não podem ser mesclados. | Seção 1 | Média |
| R10 | **21 branches locais com upstream removido e sem merge.** Podem conter commits que só existem localmente. | `branch_appendix.md` (apêndice) | Média |
| R11 | **Gate de drift vermelho há semanas** sem plano de zerar a dívida. Torná-lo obrigatório hoje bloquearia todo merge. | `docs/CI_POLICY.md` | Média |
| R12 | **Princípios de Engenharia ausentes do repositório.** Decisões de arquitetura não têm documento de referência versionado. | Seção 0 | Baixa (mas bloqueia padronização) |

## 8. Recomendações (sem executar nada que exija autorização)

1. **Revisão obrigatória em `main`**: 1 aprovação e `CODEOWNERS` exigido. Requer autorização do dono (alteração de proteção de branch).
2. **Antes de qualquer merge de migration**: rodar uma checagem de versão única (sem duplicata entre `main` e os PRs abertos). Um script de três linhas em CI teria pego as três colisões desta auditoria. Proposta em `GITHUB_WORKFLOW.md`, seção 6.
3. **Congelar o manifesto de adiadas**: qualquer PR que adicione migration fora do manifesto deve ser rotulado e bloqueado pelo gate. Hoje isso não existe.
4. **Resolver a cadeia de leads** (`#677` → `#676` → `#658`) com uma única decisão escrita sobre `20261104150000`–`170000`.
5. **Escolher uma versão** em cada par duplicado: `#656` ou `#675` (regra D1); `#670` ou `#674` (sync-outbox); `#493`/`#496`/`#537` (M1).
6. **Substituir a cadeia P0** pelo último PR (`#500`), depois de corrigir o P1 de Codex. Fechar `#484`, `#487`, `#488`, `#498`, `#499` só com autorização.
7. **Tornar secret scanning e push protection ativos**, e pinar actions de terceiros por SHA. Requer autorização do dono.
8. **Limpar branches** conforme `GITHUB_CLEANUP_PLAN.md`, seção 5. Nenhuma exclusão nesta etapa.
9. **Registrar a decisão sobre o repositório público** (manter ou tornar privado) e rotacionar a chave anon se o projeto de produção estiver exposto de forma que não possa ser ignorada.

## 9. Apêndice — branches

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
