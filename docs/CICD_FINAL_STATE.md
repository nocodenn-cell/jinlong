# CI/CD — Estado Final (documento canônico)

**Status da frente:** ✅ **CONCLUÍDA** em 2026-07-25
**Substitui/consolida:** os 7 documentos de trabalho listados em §8. Em caso de divergência, **este documento prevalece.**
**PR:** #233 · **Commits:** `e7388bc` (A) · `93f4224`+`92519b1` (B) · `c66fe89`+`cd42f3f`+`55de581` (C) · `14a9735` (D)

---

## 1. Arquitetura final

### 1.1 Workflows existentes (5)

| Workflow | Gatilhos | Contexts publicados | Papel |
|---|---|---|---|
| `ci-pdv-importados.yml` | `pull_request[main]`, `workflow_dispatch` | `build-and-test`, `E2E crítico (sistema de risco)`, `e2e-playwright` | Gate de merge do app web |
| `ci-backend-supabase.yml` | `pull_request[main]`, `workflow_dispatch` | `Supabase local RLS smoke`, `Test RLS scope by profile`, `edge-functions-typecheck`, `outbox-contract`, `rls-rest-gate`, `migration-remote-drift`, `anti-replay-diagnostic-gate` | Gate de merge do backend |
| `ci-pdv-local.yml` | `pull_request[main]`, `push[main]`, `schedule` semanal (seg 06:00 UTC), `workflow_dispatch` | `build-and-test`, `rust-tauri-checks` | Desktop; Rust só semanal/label |
| `secret-scan.yml` | `pull_request[main]`, `push[main]` | `gitleaks` | Piso de segurança |
| `release-validate.yml` | `deployment_status` | `validate-production (SSRA)` | Autoridade de release |

**Acoplamento entre workflows: nenhum.** Sem `workflow_call`, `workflow_run` ou `uses: ./`. As únicas dependências são internas a `ci-pdv-importados.yml` (`e2e-critical` e `e2e-playwright` dependem de `build-and-test`), ambas sistemas de risco.

### 1.2 Workflows removidos (2)

| Workflow | Commit | Motivo comprovado |
|---|---|---|
| `fiscal-cron.yml` | `93f4224` | Enviava header `apikey`; a Edge Function lê `X-FISCAL-WORKER-KEY`. 736 runs, nenhum com runner. ~8.640 min/mês. Duplicava o `pg_cron` que já existia |
| `e2e-playwright-only.yml` | `c66fe89` | 0 runs no histórico; disparava só em push na branch `staging`, que nunca existiu; duplicava `e2e-critical` |

### 1.3 Fluxo de deploy

```
PR ──► CI (gate de merge) ──► merge em main
                                   │
                                   ▼
                    Vercel — integração nativa (GitHub App)
                    projeto pdv-importados · Root Directory: pdv-importados
                                   │
                                   ▼
                      deployment_status: success
                                   │
                                   ▼
                       validate-production (SSRA)
```

**Mecanismo único automatizado.** Nenhum workflow deploya. `VERCEL_PROJECT_ID` não é mais consumido por nenhum workflow; `VERCEL_TOKEN` e `VERCEL_ORG_ID` sobrevivem apenas para **leitura** na API da Vercel pelo SSRA.

> **Ressalva (auditoria de encerramento, 2026-07-25):** existe um caminho de **deploy manual local** — `scripts/deploy-gates-v2.ps1` executa `npx vercel deploy --prod` quando `-Environment prod`. Não é chamado por nenhum workflow nem por script de `package.json`; é ferramenta de operador. Portanto **não** gera deploy duplicado automático, mas é um segundo caminho capaz de promover produção fora do fluxo canônico. A documentação inline do script foi sincronizada com esta arquitetura no fechamento da frente; sua guarda de projeto Vercel permanece ativa e é a única proteção desse caminho. Registro permanente em `docs/GO_LIVE_BLOCKERS.md` §3.

Sourcemaps e release do Sentry são enviados pelo próprio `next build` via `withSentryConfig` (`pdv-importados/next.config.js`), inclusive no build da Vercel — **não** dependem do CI.

### 1.4 Papel do SSRA

Autoridade única de release. Compara o **Deployment ID da plataforma** (Vercel API, host de produção) com o **Deployment ID do runtime** (`/api/health`). Não compara Git com runtime.

Mudança desta frente: deixou de depender de `needs: deploy` e passou a disparar em `deployment_status` (`state == success`, `environment == production`). Consequência: **valida o deploy real, seja qual for o mecanismo que o produziu**, e roda depois de a plataforma declarar pronto — sem corrida com a promoção do alias.

⚠️ **Limite conhecido e aceito:** o SSRA é teste de **coerência**, não de **atualidade**. Não detecta alias de produção pinado num deployment antigo. Ver §6/R4.

### 1.5 Estado atual do GitHub Actions

**Sem runners desde ~2026-05-11.** 100% dos jobs terminam em 2–4s com `runner_id: 0` e `runner_name` vazio, sem log baixável. Causa: esgotamento de billing/spending limit. Nenhum workflow desta arquitetura foi executado em runtime — **toda a validação desta frente é estática**.

---

## 2. Decisões tomadas

| # | Decisão | Fundamento |
|---|---|---|
| D1 | Deploy exclusivamente pela integração nativa da Vercel | Entregou 16 deployments `READY` durante o apagão; o job `deploy` entregou zero. Rollback (`Instant Rollback`) funciona com o CI fora — que é justamente quando se precisa dele |
| D2 | Remover o job `deploy` (`amondnet/vercel-action`) | 100% `skipped`. Já era pulado antes do apagão, por falha real de lint/typecheck em 11/05 |
| D3 | SSRA em `deployment_status` | Desacopla release authority do pipeline de build |
| D4 | Manter o SSRA obrigatório | O invariante plataforma↔runtime é barato e necessário |
| D5 | Remover `fiscal-cron.yml`; agendamento fiscal é do `pg_cron` | Emissão fiscal é função de produção, não de CI. O acoplamento fez billing de CI derrubar operação fiscal |
| D6 | `rust-tauri-checks` semanal/label | ~17 min faturados por run (Windows 2×) para validar módulo fora do D0 |
| D7 | CI pesado apenas em `pull_request` | `pull_request` já testa o resultado do merge; push pós-merge revalidava o mesmo código |
| D8 | `secret-scan` mantido em push **e** PR | Vazamento é irreversível; ~1 min; cobre push direto em `main` |
| D9 | E2E permanece sistema de risco, nunca de decisão | Regra canônica pré-existente, preservada |

## 3. Decisões descartadas

| # | Alternativa avaliada | Por que foi descartada |
|---|---|---|
| X1 | Manter o job `deploy` e desligar o auto-deploy nativo | Reintroduz dependência de runner no caminho crítico de produção. Se os runners caírem, para o deploy **e** o rollback |
| X2 | Manter os dois mecanismos de deploy | Deploy duplo concorrente, race no alias, SSRA envenenado, auditoria ambígua |
| X3 | Migrar o fiscal para `pg_cron` (proposta original) | **Já estava feito.** Job `fiscal-worker-every-minute` ativo desde 20/05 |
| X4 | Corrigir só o header do `fiscal-cron.yml` (2 linhas) | Manteria o acoplamento CI↔fiscal e o custo de ~8.640 min/mês, para duplicar um agendador que já existe |
| X5 | Remover path filters para viabilizar required checks | Aumentaria o consumo por PR; conflita com o objetivo de redução. Preferiu-se corrigir a lista de contexts |
| X6 | Renomear jobs para `build`/`lint`/`test`/`typecheck` agora | Depende de decisão de governança (§4/G2) que não é de desenvolvimento |
| X7 | Self-hosted runners | Superfície de segurança e manutenção desproporcionais ao tamanho atual |
| X8 | Aumentar o limite de minutos antes de cortar consumo | Pagaria por ~8.640 min/mês de um cron que nunca autenticou |

---

## 4. Pendências operacionais

Classificação: **[OPS]** Operacional · **[INFRA]** Infraestrutura · **[GOV]** Governança · **[DEV]** Desenvolvimento

### 4.1 Vercel

| # | Pendência | Classe | Impacto |
|---|---|---|---|
| V1 | `pdv-importados.vercel.app` está pinado em `dpl_7DPHmhdzLHNSsd1mXV59tPzfA9aU` (`a4edafbf`, 23/07). `main` está à frente; BL-1 não está no ar | **[OPS]** | 🔴 Cliente usa versão defasada; schema à frente do código |
| V2 | Confirmar `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` nas env vars | **[OPS]** | 🟠 Sem elas não há upload de sourcemaps (condição pré-existente) |
| V3 | Declarar um Production Domain canônico (hoje há 4 aliases) | **[OPS]** | 🟡 Ambiguidade sobre "o que é produção" |

### 4.2 Billing / Infraestrutura

| # | Pendência | Classe | Impacto |
|---|---|---|---|
| B1 | Restaurar limite de gasto de Actions (Settings → Billing) | **[INFRA]** | 🔴 Nada executa; nenhuma validação em runtime é possível |
| B2 | Medir consumo real no primeiro mês após B1 | **[INFRA]** | 🟡 Valida a economia projetada |

### 4.3 Branch Protection / Governança

| # | Pendência | Classe | Impacto |
|---|---|---|---|
| G1 | Os contexts exigidos (`build`, `lint`, `test`, `typecheck`) **não existem** — nunca foram publicados por nada. Substituir pelos reais ou renomear jobs | **[GOV]** | 🔴 Não há gate entre commit e produção |
| G2 | Esvaziar a bypass list após G1 | **[GOV]** | 🔴 Enquanto houver bypass, o gate é decorativo |
| G3 | Resolver a colisão de nome `build-and-test` (dois workflows publicam o mesmo context) | **[GOV]** | 🟠 Required check ambíguo |
| G4 | Criar a label `run-tauri` | **[OPS]** | 🟡 Escape hatch do `rust-tauri-checks` |
| G5 | Remover a variable `EXPECTED_VERCEL_PROJECT_ID` | **[OPS]** | 🟢 Obsoleta |

### 4.4 Supabase / Fiscal

| # | Pendência | Classe | Impacto |
|---|---|---|---|
| S1 | Criar `fiscal_worker_url` e `fiscal_worker_key` no Vault | **[OPS]** | 🔴 Única razão de o worker não rodar. **Não fazer antes de S2–S4** |
| S2 | `FISCAL_PROVIDER_TYPE` ≠ `mock` | **[OPS]** | 🔴 Senão emite chaves falsas `NFE-MOCK-…` como `EMITIDO` |
| S3 | Aplicar migration `092` (máquina de estados fiscal) | **[DEV]** | 🔴 Sem ela `EMITIDO → PENDENTE` é aceita |
| S4 | Remover overload `fiscal_reprocessar_documento(uuid,text)` | **[DEV]** | 🔴 Sem authz, `GRANT` a `authenticated`, colunas inexistentes |
| S5 | Reaper de `EM_PROCESSAMENTO` + limite de tentativas + DLQ automática | **[DEV]** | 🟠 Documento órfão permanente se o worker morrer após o claim |

> **Ordem obrigatória do fiscal:** S4 → S3 → S5 → S2 → S1. Inverter cria risco fiscal irreversível.

---

## 5. Itens que saem do escopo de desenvolvimento

**Não devem retornar ao backlog técnico.** São ações de console/configuração, sem código:

| Item | Classe | Responsável |
|---|---|---|
| B1, B2 — billing de Actions | **[INFRA]** | Administração da conta GitHub |
| G1, G2, G3 — required checks e bypass | **[GOV]** | Owner do repositório |
| G4, G5 — label e variable | **[OPS]** | Owner do repositório |
| V1, V2, V3 — alias, env vars e domínio | **[OPS]** | Administração da Vercel |
| S1, S2 — Vault e provider fiscal | **[OPS]** | Administração do Supabase |

**Permanecem no backlog de desenvolvimento** apenas: **S3**, **S4**, **S5** (migrations/RPC) e o item de documentação P2-DOC (§6/R6), todos já registrados em `docs/PLANO_REMEDIACAO_CICD.md`.

---

## 6. Riscos residuais

| # | Risco | Severidade | Observação |
|---|---|---|---|
| R1 | **`build-and-test` provavelmente vermelho ao voltar.** Em 11/05 falhou por erro real de lint/typecheck/teste | 🔴 Alta | O apagão mascara uma quebra real. **Não é regressão desta frente** — não reverter a remediação por isso |
| R2 | **Nenhuma mudança foi validada em runtime.** Toda a validação é estática (YAML, referências, git) | 🟠 Média | Depende de B1. Checklist em §7 |
| R3 | `main` sem CI pós-merge (CI pesado só em PR) | 🟠 Média | Mitigado por `secret-scan` em push; mitigação real é G1/G2 |
| R4 | SSRA não detecta defasagem de produção | 🟠 Média | É o estado atual (V1). Evolução para SSRA v2 (checar `githubCommitSha`) fica como P1 |
| R5 | Deploy Hooks da Vercel não enumeráveis | 🟡 Baixa | Se existir um hook externo, não apareceu na varredura |
| R6 | Documentação de trabalho desta frente (7 arquivos) pode divergir com o tempo | 🟡 Baixa | Este documento prevalece; ver §8 |
| R7 | `rust-tauri-checks` semanal atrasa detecção de regressão em Rust em até 7 dias | 🟡 Baixa | Label `run-tauri` cobre PRs que mexam em `src-tauri` |

---

## 7. Checklist para reativação completa do CI

Executar **após B1** (billing restaurado), na ordem.

### 7.1 Validação

| # | Item | Critério de aprovação |
|---|---|---|
| C1 | Runner é alocado | `runner_id` ≠ 0 e log baixável em 100% dos jobs |
| C2 | `secret-scan` | `gitleaks` verde em PR **e** em push para `main` |
| C3 | `ci-pdv-local` / `build-and-test` | Verde (~1 min) |
| C4 | `ci-pdv-importados` / `build-and-test` | ⚠️ **Falha esperada (R1).** Aprovar = falhas identificadas, listadas e com correção planejada |
| C5 | `ci-backend-supabase` (7 jobs) | Verde, ou falha explicada por secret ausente/expirado |
| C6 | `rust-tauri-checks` | `workflow_dispatch` manual conclui em ~8 min |
| C7 | Sem duplicação de gatilho | Exatamente 1 run por workflow por evento; nenhum run em push exceto `secret-scan` e `ci-pdv-local` |
| C8 | `release-validate` (SSRA) | Dispara no primeiro deploy de produção e conclui (verde, ou vermelho com causa clara) |
| C9 | Consumo | < 500 min no primeiro mês (Settings → Billing) |

**Aprovação plena:** C1–C3, C5–C8. C4 com ressalva documentada. C9 valida a economia.

### 7.2 Rollback

Cada fase é revertível de forma independente e limpa:

| Sintoma | Ação |
|---|---|
| Deploy de produção deixa de acontecer | `git revert e7388bc` (Fase A) |
| Necessário disparo fiscal via Actions | `git revert 93f4224` — **não recomendado**; prefira popular o Vault (S1) |
| Regressão em Rust não detectada a tempo | `git revert cd42f3f` (Fase C.2) |
| Push direto em `main` precisa de CI completo | `git revert 55de581` (Fase C.3) |
| Pipeline inutilizável pelas mudanças (e não por R1) | `git revert e7388bc..14a9735` |

**Não é gatilho de rollback:** `build-and-test` vermelho por lint/typecheck/teste (R1) — corrigir no código.

---

## 8. Documentos desta frente

Este documento é o **canônico**. Os demais viram registro histórico do processo:

| Documento | Papel |
|---|---|
| `AUDITORIA_CICD_DEPLOY_TRAVADO.md` | Diagnóstico inicial (causa raiz: runners) |
| `AUDITORIA_CUSTO_GITHUB_ACTIONS.md` | Medição de custo por workflow |
| `PLANO_REMEDIACAO_CICD.md` | Plano priorizado P0–P3; **mantém o backlog vivo de S3/S4/S5** |
| `REMEDIACAO_ETAPA1_VALIDACAO.md` | Validação das hipóteses + divergências |
| `REMEDIACAO_FASE_B_FISCAL.md` | **Runbook de ativação do worker fiscal** (S1–S2) |
| `REMEDIACAO_FASE_D_RELATORIO.md` | Relatório de execução das fases |
| `ENCERRAMENTO_CICD_GO_NOGO.md` | Decisão Go/No-Go com evidências |

Documentos canônicos atualizados nesta frente: `SSRA_RELEASE.md`, `E2E.md`, `PRODUCAO_GO_NO_GO.md`, `GOVERNANCA_PMO_JINLONG.md`, `PROJECT_ROADMAP.md`, `Jinlong/Backlog.md`.

---

## 9. Encerramento

**A frente de CI/CD e Deploy está concluída.** O escopo de desenvolvimento foi entregue: um mecanismo de deploy, um agendador fiscal, SSRA desacoplado, workflows órfãos removidos, duplicação eliminada e consumo projetado dentro do menor plano.

**O Go-Live permanece bloqueado** por B1, G1/G2 e V1 — três itens de configuração, nenhum de desenvolvimento. Enquanto não forem resolvidos, não há como verificar (B1), não há gate entre commit e cliente (G1/G2), e a produção não reflete o código aprovado (V1).
