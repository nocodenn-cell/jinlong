# Reconciliação de Pull Requests abertos — 2026-11-05

**Escopo:** os 42 PRs abertos no GitHub (`gh pr list --state open`) consultados em 2026-11-05, somente leitura.
**Método:** estado de rascunho, `mergeStateStatus`, data da última atualização e, para 6 PRs, os checks que falharam (`gh pr checks`, logs de `gh run view --log-failed`).

**Limite desta reconciliação:** a leitura do diff completo e a comparação com a `main` foram feitas **somente** para os PRs citados na seção 2. Para os demais, a coluna "Próxima ação" é uma proposta de triagem, não um veredito técnico. Itens sem leitura de diff estão classificados como NÃO COMPROVADO.

## 1. Tabela geral

| PR | Rascunho | mergeStateStatus | Última atualização | Título | Classificação (fato) | Próxima ação (proposta) |
|---|---|---|---|---|---|---|
| #663 | sim | CLEAN | 2026-11-05 | fix(catalogo): Cadastro rápido desabilitado até a hidratação | Mergeável pelo GitHub | Revisar e validar |
| #661 | não | UNSTABLE | 2026-11-06 | fix(auth): recuperação de senha mostra erro claro e valida na tela | Checks com falha não obrigatória ou pendente | Revisar e validar |
| #659 | sim | DIRTY | 2026-11-05 | chore(governance): adiar formalmente 6 migrations pendentes e corrigir CLI do drift | Conflito com a main | Rebase/merge na main e revalidação local |
| #658 | sim | DIRTY | 2026-11-05 | docs(ops): preparar liberação segura da Growth-001 para o Hub Comercial | Conflito com a main | Rebase/merge na main e revalidação local |
| #657 | não | BLOCKED | 2026-11-04 | Claude/pdv rn03 descarte auditavel | Bloqueado (checks ou revisão) | Ver checks de governança e revisão |
| #656 | não | BLOCKED | 2026-11-04 | feat(caixa): fechamento de caixa bloqueado com venda em espera (D-06) | Bloqueado (checks ou revisão) | Ver checks de governança e revisão |
| #642 | não | DIRTY | 2026-10-29 | test(caixa): corrigir fixture S7 para caixa pagador explícito | Conflito com a main | Rebase/merge na main e revalidação local |
| #637 | não | BLOCKED | 2026-10-26 | chore(ci): bump actions/checkout from 4 to 7 | Bloqueado (checks ou revisão) | Ver checks de governança e revisão |
| #636 | não | BLOCKED | 2026-10-26 | chore(ci): bump actions/setup-node from 4 to 7 | Bloqueado (checks ou revisão) | Ver checks de governança e revisão |
| #623 | não | DIRTY | 2026-10-29 | refactor(papeis): remover ADMIN do escopo das lojas | Conflito com a main | Rebase/merge na main e revalidação local |
| #620 | não | DIRTY | 2026-10-29 | fix(segurança): escopo de gerente por empresa + correções da cobrança Asaas | Conflito com a main | Rebase/merge na main e revalidação local |
| #583 | não | DIRTY | 2026-11-02 | chore(deps): bump the dev-minor-patch group across 1 directory with 10 updates | Conflito com a main | Rebase/merge na main e revalidação local |
| #550 | sim | UNSTABLE | 2026-10-14 | style(ux): recuperar tokens de ouro do QwenCode (Caixa, Auth e Legal) | Checks com falha não obrigatória ou pendente | Candidato a encerramento após leitura do diff |
| #549 | não | BLOCKED | 2026-10-22 | chore(deps): bump eslint from 8.57.1 to 10.13.0 | Bloqueado (checks ou revisão) | Ver checks de governança e revisão |
| #548 | não | BLOCKED | 2026-10-22 | chore(deps): bump next from 15.5.15 to 15.5.28 | Bloqueado (checks ou revisão) | Ver checks de governança e revisão |
| #547 | não | BLOCKED | 2026-10-22 | chore(deps): bump eslint-config-next from 15.5.15 to 16.4.2 | Bloqueado (checks ou revisão) | Ver checks de governança e revisão |
| #546 | não | UNSTABLE | 2026-11-02 | chore(deps): bump the sentry group across 1 directory with 5 updates | Checks com falha não obrigatória ou pendente | Revisar e validar |
| #542 | sim | DIRTY | 2026-10-12 | UX: ficha de clientes e lista compacta de funcionários | Conflito com a main | Candidato a encerramento após leitura do diff |
| #541 | sim | DIRTY | 2026-10-12 | feat(estoque): chrome fixo do hub e fluxo das abas | Conflito com a main | Candidato a encerramento após leitura do diff |
| #537 | sim | DIRTY | 2026-10-23 | [NÃO FAZER MERGE] Import Intelligence: multiempresa (M1/F1), NF-e (F3), persistência (F4) e hub de Importações (F5) | Conflito com a main | Rebase/merge na main e revalidação local |
| #534 | sim | CLEAN | 2026-10-10 | CAP-02: carga progressiva k6 local (T00–T05) + reconciliação e relatório | Mergeável pelo GitHub | Candidato a encerramento após leitura do diff |
| #533 | sim | DIRTY | 2026-10-23 | feat(capacity): Gate A-L1 — baseline local fastproduct-capacity (G1–G5) | Conflito com a main | Rebase/merge na main e revalidação local |
| #532 | sim | CLEAN | 2026-10-10 | docs(capacity): STG-01 Option B prep + recomendação estratégia B (baseline local) | Mergeável pelo GitHub | Candidato a encerramento após leitura do diff |
| #530 | não | BLOCKED | 2026-10-29 | feat(capacity): STG-01 preparação da homologação isolada | Bloqueado (checks ou revisão) | Ver checks de governança e revisão |
| #508 | sim | UNSTABLE | 2026-10-09 | docs(audits): auditoria Jinlong 360° de maturidade (somente leitura) | Checks com falha não obrigatória ou pendente | Candidato a encerramento após leitura do diff |
| #506 | não | UNSTABLE | 2026-10-08 | docs(backup): diagnóstico do PAM authentication failed e probe seguro… | Checks com falha não obrigatória ou pendente | Revisar e validar |
| #500 | não | DIRTY | 2026-10-08 | docs(p0): desbloqueio operacional — backup drill, 163100, SSOT-004 | Conflito com a main | Rebase/merge na main e revalidação local |
| #499 | sim | DIRTY | 2026-10-08 | docs(p1-02): fechamento da reconciliação Git × produção (sem rollout) | Conflito com a main | Candidato a encerramento após leitura do diff |
| #498 | sim | DIRTY | 2026-10-08 | docs(p1-02): validação final da matriz de reconciliação (GO/NO-GO) | Conflito com a main | Candidato a encerramento após leitura do diff |
| #496 | sim | DIRTY | 2026-10-08 | feat(m2b): F1–F3 contexto seguro de empresa ativa (local experimental) | Conflito com a main | Candidato a encerramento após leitura do diff |
| #495 | sim | DIRTY | 2026-10-08 | docs(m2a): contrato de empresa ativa e gate de arquitetura (sem implementação) | Conflito com a main | Candidato a encerramento após leitura do diff |
| #493 | sim | DIRTY | 2026-10-08 | feat(m1): fundação multiempresa experimental local (sem DDL remoto) | Conflito com a main | Candidato a encerramento após leitura do diff |
| #492 | sim | UNSTABLE | 2026-10-08 | docs(multiempresa): fechamento P0 + readiness multi-tenant (sem DDL) | Checks com falha não obrigatória ou pendente | Candidato a encerramento após leitura do diff |
| #491 | não | DIRTY | 2026-10-23 | feat(site): site comercial bilíngue pt-BR/zh-CN como app independente (site/) | Conflito com a main | Rebase/merge na main e revalidação local |
| #490 | sim | CLEAN | 2026-10-08 | Install Vercel Speed Insights | Mergeável pelo GitHub | Candidato a encerramento após leitura do diff |
| #489 | sim | UNSTABLE | 2026-10-08 | docs(p0): restore sintético local + checklist smoke presencial | Checks com falha não obrigatória ou pendente | Candidato a encerramento após leitura do diff |
| #488 | sim | DIRTY | 2026-10-08 | fix(p0): deny-list financeira + provas fiscais/financeiras (sem apply remoto) | Conflito com a main | Candidato a encerramento após leitura do diff |
| #487 | sim | DIRTY | 2026-10-08 | Pós-OPS-02: bloqueio da 20261006120000 e provas locais fiscais/caixa (fases B–D) | Conflito com a main | Candidato a encerramento após leitura do diff |
| #486 | sim | CLEAN | 2026-10-08 | fix(ci): guard do backup JIT, redação literal e diagnóstico IPv6 | Mergeável pelo GitHub | Candidato a encerramento após leitura do diff |
| #485 | não | DIRTY | 2026-10-08 | fix(p0): sonda JIT direta + reconciliação estabilização piloto (NO-GO backup) | Conflito com a main | Rebase/merge na main e revalidação local |
| #484 | sim | UNSTABLE | 2026-10-08 | docs(ops): sprint confiabilidade operacional — NO-GO piloto | Checks com falha não obrigatória ou pendente | Candidato a encerramento após leitura do diff |
| #448 | sim | DIRTY | 2026-10-08 | fiscal(focus): Sprint P0 — XML real, cancelamento com XML separado, classificação por status, natureza_operacao e PIX | Conflito com a main | Candidato a encerramento após leitura do diff |

## 2. PRs analisados em profundidade (checks)

| PR | Checks que falham | Causa observada | Classificação |
|---|---|---|---|
| #620 (`fix/seguranca-gerente-escopo-e-cobranca`) | `deploy-governance` | Gate de governança de deploy (label `deploy-prod:aprovado` ausente). Não é teste de código | BLOQUEADO POR DEPENDÊNCIA (decisão e label do dono) |
| #623 (`refactor/remover-admin-papeis`) | nenhum check falhando; `DIRTY` | Conflito com a `main`. Registro anterior: resolução local na branch, commit `193293d7`, não publicado | IMPLEMENTADO, MAS NÃO INTEGRADO |
| #656 (`claude/pdv-d06-fechar-caixa-migration`) | `Supabase local gates`, `deploy-governance`, `migration-remote-drift` | Gate de RLS/REST e de drift de migrations (remoto registra 20261028100000 a 20261104180000 como ausentes). Drift depende de decisão de produção | BLOQUEADO POR DEPENDÊNCIA |
| #657 (`claude/pdv-rn03-descarte-auditavel`) | `Supabase local gates`, `deploy-governance`, `e2e-playwright`, `migration-remote-drift` | Ver seção 3 (ambiente de CI) para o gate Supabase; drift e governança como #656; E2E sem resultado comprovado | BLOQUEADO POR TESTES (ambiente) e por dependência |
| #659 (`claude/governanca-migrations-adiadas`) | `deploy-governance`, `migration-remote-drift` | Adia formalmente migrations no manifesto. Depende da decisão do dono | BLOQUEADO POR DEPENDÊNCIA |
| #642 (`fix/int01-s7-caixa-pagador`) | nenhum check falhando | Fixture do S7 corrigida na branch; `mergeStateStatus` UNKNOWN | NÃO COMPROVADO (sem leitura de diff nesta rodada) |

## 3. Causa do gate `Supabase local gates` (PR #657, run 41883259348)

Lendo o log de falha (`gh run view --log-failed`), a causa está no ambiente de CI, não em uma asserção de regra de negócio:

1. **Rate limit do Docker Hub** (`toomanyrequests: Rate exceeded`) ao subir os contêineres.
2. **Falha de instalação do `postgresql-client`** (apt) após 3 tentativas.
3. **Variável de URL do Postgres ausente** (`Sem URL do Postgres (POSTGRES_URL ou DB_URL)`) em vários passos de smoke. Sem a URL, os scripts `psql` não rodam.

As mensagens `ERROR: TIER_PRECO...`, `IMPORT_NFE_STATUS_INVALIDO` e `COMISSOES_LIQUIDAR_NADA_A_PAGAR` que aparecem no log são **asserções negativas esperadas** dos testes (exceções provocadas de propósito), não a causa da falha.

Não alterei a configuração de CI para mascarar isso. Corrigir exige ação do dono no repositório (secret `DB_URL` / `POSTGRES_URL` e política de cache ou autenticação do Docker Hub). **BLOQUEADO POR AMBIENTE DE CI.**

## 4. Resumo

- PRs abertos: **42**. Rascunho: **24**. Com conflito (`DIRTY`): **21**. Bloqueados (`BLOCKED`): **8**. `CLEAN`: **5**. `UNSTABLE`: **8**.
- Atualizados antes de 2026-10-20: **22** (candidatos a revisão de obsolescência; nenhum encerrado nesta rodada).
- PRs com diff lido e comparado à `main`: **0 de 42** (os 6 da seção 2 foram vistos só pelos checks).
- Nenhum PR foi mesclado, fechado, rebaseado ou publicado nesta rodada.

## 5. Análise de diff dos PRs de segurança (#620 e #623) — 2026-11-05

Comparação com `origin/main` (21d3e79c… → `main` atual 1ade0bbe e posteriores). Somente leitura; nenhum push.

### 5.1 PR #620 (`fix/seguranca-gerente-escopo-e-cobranca`, head `4009eb2a`)

- Está **1 commit à frente** da base antiga e **233 atrás** da `main`.
- O conteúdo principal (migrations `20261028100000` e `20261028101000`) **já está na `main`**. O commit restante (`4009eb2a`) só:
  - adiciona `backend/scripts/revisao-585-pg-local/stubs.sql` com `fp_empresa_da_loja` (stub para o teste isolado; a função real está em `20261019120000`, já na `main`);
  - reescreve os arquivos `backend/supabase/rollback/20261028100000_*.rollback.sql` e `20261028101000_*.rollback.sql`, que a `main` já tem (commit `1ade0bbe`). É esse conflito que deixa o PR `DIRTY`.
- Rollback de `20261028100000`: o corpo da função de restauração coincide com o corpo de produção (`internal.token_gerente_fora_da_loja`, lido por SELECT). O **md5 declarado no PR (`caac7528…`) não foi reproduzido** com a normalização usada aqui (`ee5dcec4…` em produção). Por isso a equivalência do md5 fica **NÃO COMPROVADA**. A equivalência textual do corpo está comprovada.
- Executado localmente em transação com `ROLLBACK`: o rollback roda sem erro. Não é prova de restauração, porque o banco local já estava no mesmo corpo antes e depois.
- **Classificação:** OBSOLETO OU SUBSTITUÍDO em grande parte. O que sobra (stub e versão do rollback) vale só como ajuste pequeno.
- **Próxima ação (proposta):** encerrar #620 e abrir um PR pequeno só com o stub e a versão revisada do rollback, depois de rebase na `main`.

### 5.2 PR #623 (`refactor/remover-admin-papeis`, head `ec50f9d9`)

- Está **15 commits à frente** e **215 atrás** da `main`. A branch já absorveu os PRs #639 e #640 (fila de revisão offline, tela `/admin/revisao-offline`). O título do PR (“remover ADMIN do escopo das lojas”) **não descreve mais o diff**: são 34 arquivos e 3668 inserções.
- **Divergência de migrations com a `main` (grave):**
  - A branch tem `20261028120000_sec_tokens_usuario_inativo_revogacao.sql`.
  - A `main` tem `20261028120000_revoga_helpers_tenant_authenticated.sql` e `20261028120100_sec_tokens_usuario_inativo_revogacao.sql`.
  - Em produção, o ledger registra a versão `20261028120000` como `revoga_helpers_tenant_authenticated` (SELECT em `supabase_migrations.schema_migrations`). Aplicar o arquivo de #623 com esse nome **colidiria com a versão já registrada** e deixaria a `120100` sem arquivo na branch.
- **Sync-outbox:** o `index.ts` da branch usa `sync_avaliar_evento` antes da gravação (“Implementação A” do conflito original). Não há marcador de conflito na branch. A função depende de `20261028130000`, que só existe nesta branch.
- **Testes executados localmente** (migrations `20261028130000`, `20261028140000`, `20261028150000` aplicadas em transação com `ROLLBACK`, sobre o banco local):
  - `sync-outbox-revisao-offline.test.sql`: **50 passou / 0 falhou** — PASSOU.
  - `caixas-loja-mesma-empresa.test.sql`: 13 verificações `ok`, sem falha — PASSOU.
  - `revisao-offline-tela.test.sql`: 25 `ok`, 0 falhas — PASSOU.
  - Deno `sync-outbox` (arquivo extraído com `git archive`): **60 passou / 0 falhou** — PASSOU.
  - Limite: os testes rodaram sobre o banco local, não sobre homologação. Os PRs `#620`/`#623` não foram revalidados em CI.
- **Classificação:** IMPLEMENTADO, MAS NÃO INTEGRADO. Funcionalidade verificada localmente; integração bloqueada pelo conflito de versão de migration e pelo escopo misturado.
- **Próxima ação (proposta):**
  1. Dividir #623 em: (a) corte de ADMIN (migrations `20261028110000`/`120000`/`120100` com nomes da `main`); (b) fila de revisão offline (`20261028130000`, `140000`, `150000`) em PR próprio; (c) UI de revisão.
  2. Renomear a migration de (a) para não colidir com a versão `20261028120000` já registrada em produção.
  3. Publicar só com decisão do dono e label `deploy-prod:aprovado`.
