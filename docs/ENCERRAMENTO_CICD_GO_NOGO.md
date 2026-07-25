# Encerramento CI/CD — Validação final e Go/No-Go

**Data:** 2026-07-25 · **Branch:** `claude/bl1-homolog-bl2-analysis-f22akt` · **PR:** #233
**Natureza:** auditoria de estado final. Nenhuma alteração de código nesta etapa.

---

## Etapa 1 — Arquitetura final validada

### 1.1 Workflows que permanecem (5)

| Arquivo | Gatilhos | Jobs (contexts publicados) |
|---|---|---|
| `ci-pdv-importados.yml` | `pull_request[main]` + `workflow_dispatch` | `build-and-test`, `E2E crítico (sistema de risco)`, `e2e-playwright` |
| `ci-backend-supabase.yml` | `pull_request[main]` + `workflow_dispatch` | `Supabase local RLS smoke`, `Test RLS scope by profile`, `edge-functions-typecheck`, `outbox-contract`, `rls-rest-gate`, `migration-remote-drift`, `anti-replay-diagnostic-gate` |
| `ci-pdv-local.yml` | `pull_request[main]` + `push[main]` + `schedule` semanal + `workflow_dispatch` | `build-and-test`, `rust-tauri-checks` |
| `secret-scan.yml` | `pull_request[main]` + `push[main]` | `gitleaks` |
| `release-validate.yml` | `deployment_status` | `validate-production (SSRA)` |

### 1.2 Workflows removidos (2)

| Arquivo | Commit | Motivo comprovado |
|---|---|---|
| `fiscal-cron.yml` | `93f4224` | Header `apikey` ≠ `X-FISCAL-WORKER-KEY`; 736 runs sem runner; ~8.640 min/mês |
| `e2e-playwright-only.yml` | `c66fe89` | 0 runs; branch `staging` inexistente; duplicava `e2e-critical` |

### 1.3 Dependências entre workflows

```
grep -rn "workflow_call|workflow_run|uses: ./" .github/workflows/
→ NENHUMA
```

**Não há acoplamento entre workflows.** As únicas dependências são internas, dentro de `ci-pdv-importados.yml`:

```
build-and-test ──┬──► E2E crítico (sistema de risco)   [needs, linha 61]
                 └──► e2e-playwright                    [needs, linha 155]
```

Ambas são sistemas de risco, não de decisão — nenhuma bloqueia release. ✅ Coerente com `docs/SSRA_RELEASE.md`.

### 1.4 Referências pendentes a arquivos removidos

Varredura no repositório inteiro (exceto `node_modules`, `.git`, `docs/`):

| Alvo | Resultado |
|---|---|
| `fiscal-cron` | ✅ sem referências |
| `e2e-playwright-only` | ✅ sem referências |
| `getsentry/action` | ✅ sem referências |
| `amondnet/vercel-action` | ✅ apenas em comentário explicando a remoção (`ci-pdv-importados.yml:144`) |
| `package.json` / `scripts/` | ✅ nenhuma |

⚠️ **Uma inconsistência documental encontrada:** `docs/SSRA_RELEASE.md` ainda descreve o pipeline antigo:

- linha 11: `build-and-test ──┬──► deploy (--prod) ──► validate-production (SSRA)`
- linha 61: *"Job `validate-production` em `.github/workflows/ci-pdv-importados.yml`"* — já não existe lá
- linha 71: cita `deploy` + `validate-production` como sistema de decisão
- linha 104: *"`e2e-critical` em `needs:` do job `deploy`"*
- linha 112: `EXPECTED_VERCEL_PROJECT_ID` — variable de um step que foi removido

Não corrigido nesta etapa (sem alterações). Fica como pendência ⚠️ P2-DOC.

### 1.5 O SSRA continua sendo a autoridade de release?

**Sim, com ressalva já conhecida.**

- ✅ O gate existe e roda: `release-validate.yml` → `node scripts/validate-production.mjs`.
- ✅ O script está intacto e continua referenciado também por `npm run validate:production` (`package.json:26`).
- ✅ Passou a disparar em `deployment_status` (state=`success`, environment=`production`), o que o torna **independente do mecanismo de deploy** — antes dependia de `needs: deploy`, e por isso ficava `skipped`.
- ⚠️ **Nunca executou nesta configuração.** Só validará no próximo deploy de produção, e não há runner.
- ❌ **Continua sendo teste de coerência, não de atualidade.** Compara `platformId == runtimeId` para o mesmo host. Não detecta alias pinado em deployment antigo — que é exatamente o estado atual (§4, R7).

### 1.6 Existe caminho para deploy duplicado?

**Não.**

```
grep -rniE "vercel|deploy" .github/workflows/  (excluindo comentários e deployment_status)
→ nenhum resultado
```

Secrets Vercel ainda consumidos: apenas `VERCEL_TOKEN` e `VERCEL_ORG_ID` em `release-validate.yml`, **para leitura na API** (validação), não para deploy. `VERCEL_PROJECT_ID` não é mais usado por nenhum workflow.

**Caminho único de deploy:** integração nativa da Vercel (GitHub App), comprovada por `meta.githubDeployment: "1"` + `source: "git"` em todos os deployments.

> **Limitação:** não consigo enumerar *Deploy Hooks* configurados no projeto Vercel (não expostos pela API/MCP disponível). Se existir algum deploy hook externo, ele não apareceria nesta varredura.

---

## Etapa 2 — Required Status Checks

### 2.1 Quem publica `build`, `lint`, `test`, `typecheck`?

## **Ninguém.**

Quatro linhas de evidência independentes:

**(1) Nenhum workflow atual declara esses jobs**

```
grep -rnE "^\s+(name:\s*)?(build|lint|test|typecheck):\s*$" .github/workflows/
→ NENHUM job com esses nomes
```

**(2) Nunca existiram em toda a história do repositório**

```
git log --all -S"  build:"     -- .github/workflows/  →  0 commits
git log --all -S"  lint:"      -- .github/workflows/  →  0 commits
git log --all -S"  test:"      -- .github/workflows/  →  0 commits
git log --all -S"  typecheck:" -- .github/workflows/  →  0 commits
```

Conjunto completo de job ids já usados na história dos workflows: `anti-replay-diagnostic-gate`, `build-and-test`, `call-worker`, `deploy`, `e2e-critical`, `e2e-playwright`, `edge-functions-typecheck`, `gitleaks`, `migration-remote-drift`, `outbox-contract`, `rls-rest-gate`, `rust-tauri-checks`, `ssra`, `supabase-local-rls-smoke`, `test-rls-scope`, `validate-production`.

**Nenhum dos quatro aparece.** Não são resquícios de configuração antiga — nunca corresponderam a nada neste repositório.

**(3) Enumeração completa dos check-runs reais (PR #233, commit `14a9735`) — 15 no total**

| Publicador | Contexts |
|---|---|
| **GitHub Actions** (13) | `build-and-test` ×2, `E2E crítico (sistema de risco)`, `e2e-playwright`, `rust-tauri-checks`, `gitleaks`, `Supabase local RLS smoke`, `Test RLS scope by profile`, `edge-functions-typecheck`, `outbox-contract`, `rls-rest-gate`, `migration-remote-drift`, `anti-replay-diagnostic-gate` |
| **Vercel GitHub App** (1) | `Vercel Preview Comments` |
| **Supabase GitHub App** (1) | `Supabase Preview` |

**Zero** com os nomes exigidos.

**(4) Não existe outro sistema de CI**

`.circleci`, `.gitlab-ci.yml`, `.travis.yml`, `azure-pipelines.yml`, `Jenkinsfile`, `.buildkite`, `appveyor.yml` — **nenhum existe**.

### 2.2 Esses contexts existem?

**Não.** Não são publicados por GitHub Actions, nem por GitHub App, nem pela Vercel, nem pelo Supabase, nem por qualquer outro mecanismo detectável.

> **Limitação declarada:** consigo enumerar *check-runs*, mas não *classic commit statuses* (`GET /commits/{sha}/status` → 403; `pull_request_read(get_status)` → 403). Em tese um status clássico poderia carregar esses nomes. Porém: os únicos apps instalados são Vercel e Supabase, cujos contexts observados são outros; e nenhum sistema de CI capaz de publicá-los existe. **A probabilidade de existirem por essa via é remota, mas não posso reduzi-la a zero sem acesso ao endpoint.**

### 2.3 Inconsistência entre Branch Protection e workflows

| Aspecto | Estado |
|---|---|
| Contexts exigidos | `build`, `lint`, `test`, `typecheck` (4) |
| Contexts publicados que casam | **0** |
| Consequência formal | Todo PR para `main` fica em *"Expected — Waiting for status to be reported"*, indefinidamente |
| Consequência observada | PR #232 mergeado em 2026-07-24T20:48:34Z por `nocodenn-cell` com **todos** os checks em `failure` → **bypass de owner** |
| Veredito | **A proteção de `main` é decorativa.** Existe uma regra que nada satisfaz, contornada manualmente |

**Inconsistência adicional confirmada empiricamente:** dois check-runs distintos com o nome **idêntico** `build-and-test` — `89688963701` (CI pdv-importados) e `89688963768` (CI pdv-local). Se `build-and-test` for adotado como Required Check, o contexto é ambíguo e pode ser satisfeito pelo workflow do desktop, que está fora do D0.

---

## Etapa 3 — Plano de reativação do CI (não implementado)

### 3.1 Checklist de validação dos workflows

| # | Item | Como verificar | Esperado |
|---|---|---|---|
| V1 | Runner é alocado | `runner_id` ≠ 0 em qualquer job | `runner_id` populado, log baixável |
| V2 | `secret-scan` executa | Run de `gitleaks` em PR | `success`, sem findings |
| V3 | `ci-pdv-local/build-and-test` | typecheck+test+build de `pdv-local` | `success` |
| V4 | `ci-pdv-importados/build-and-test` | `guard:all`, lint, typecheck, test, build | ⚠️ **falha esperada** — ver R2 |
| V5 | `ci-backend-supabase` (7 jobs) | Secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_MIGRATION_CHECK_PROJECT_REF`, `SYNC_*` presentes | `success` ou falha explicada por secret ausente |
| V6 | `rust-tauri-checks` | `workflow_dispatch` manual | `success` em ~8 min |
| V7 | Gatilhos não duplicam | 1 run por workflow por PR; nenhum run em push (exceto `secret-scan`, `ci-pdv-local`) | Confirmado |
| V8 | `release-validate` (SSRA) | Próximo deploy de produção | Job dispara e compara IDs |

### 3.2 Ordem correta de teste

```
1. V1  Confirmar runner            ← sem isso nada mais é testável
2. V2  secret-scan                 ← mais barato, sem dependência de secret
3. V3  ci-pdv-local build-and-test ← ubuntu, ~1 min, sem secrets
4. V4  ci-pdv-importados           ← esperar VERMELHO; diagnosticar e corrigir
5. V5  ci-backend-supabase         ← depende de secrets; validar um job por vez
6. V6  rust-tauri-checks           ← dispatch manual, 17 min faturados
7. V7  Auditar contagem de runs    ← confirma a economia da Fase C.3
8. V8  SSRA                        ← só no próximo deploy de produção
```

Racional: ordem crescente de custo e de dependência externa. V4 antes de V5 porque é o gate do produto principal e a falha esperada precisa ser resolvida antes de qualquer decisão sobre required checks.

### 3.3 Critérios objetivos de aprovação

| Critério | Medida |
|---|---|
| A1 | `runner_id` ≠ 0 e log baixável em 100% dos jobs disparados |
| A2 | `gitleaks` verde em PR e em push para `main` |
| A3 | `ci-pdv-importados/build-and-test` verde **ou** com falhas identificadas, listadas e com correção planejada |
| A4 | Nenhum job em `queued`/`in_progress` por > 15 min |
| A5 | Exatamente 1 run por workflow por evento — zero duplicação push+PR |
| A6 | Consumo medido em Settings → Billing < 500 min no primeiro mês |
| A7 | `release-validate` dispara no primeiro deploy de produção e conclui (verde ou vermelho com causa clara) |

Aprovação plena exige A1–A5 e A7. A6 é validação da economia.

### 3.4 Critérios de rollback

Cada fase é revertível de forma independente e limpa (`git revert`), sem conflito:

| Sintoma | Ação | Commit |
|---|---|---|
| Deploy de produção deixa de acontecer | Reverter Fase A e reinvestigar a integração nativa | `git revert e7388bc` |
| Fila fiscal precisa do disparo via Actions | Reverter Fase B (**não recomendado** — o header continuaria errado; prefira popular o Vault) | `git revert 93f4224` |
| Regressão em Rust não detectada a tempo | Reverter Fase C.2 (volta a rodar por PR) | `git revert cd42f3f` |
| Push direto em `main` precisa de CI completo | Reverter Fase C.3 (volta push+PR) | `git revert 55de581` |

**Gatilho de rollback total:** se após A1 o pipeline se mostrar inutilizável por causa das mudanças (e não por R2), reverter `e7388bc..14a9735` restaura o estado anterior integralmente.

**Não é gatilho de rollback:** `build-and-test` vermelho por lint/typecheck/teste (R2) — é falha pré-existente, corrigir no código, não reverter a remediação.

### 3.5 Riscos conhecidos da reativação

| # | Risco | Probabilidade | Mitigação |
|---|---|---|---|
| K1 | `build-and-test` vermelho ao voltar (R2) | **Alta** — falhou de verdade em 11/05 | Reservar tempo para corrigir; não confundir com regressão da remediação |
| K2 | Secrets do `ci-backend-supabase` expirados após ~2,5 meses | Média | Validar antes de rodar V5 |
| K3 | Consumo volta a estourar por causa não mapeada | Baixa | A6 mede no primeiro mês |
| K4 | SSRA falha por `PRODUCTION_HOST` divergente dos domínios do projeto | **Alta** — o host não está na lista de domínios | Resolver R7/V2-Vercel antes de confiar no SSRA |
| K5 | Colisão `build-and-test` confunde required checks | Alta se configurarem | Renomear antes de G2 |

---

## Etapa 4 — Go/No-Go

### 4.1 Classificação item a item

| # | Item | Status |
|---|---|---|
| 1 | Deploy duplicado eliminado | ✅ **Resolvido** — zero caminhos de deploy nos workflows |
| 2 | Job `deploy` removido sem perda de Sentry | ✅ **Resolvido** — `withSentryConfig` sobe no `next build` |
| 3 | SSRA preservado e desacoplado | ✅ **Resolvido** — `release-validate.yml` em `deployment_status` |
| 4 | `fiscal-cron` (agendador quebrado) removido | ✅ **Resolvido** |
| 5 | `e2e-playwright-only` removido | ✅ **Resolvido** |
| 6 | `rust-tauri-checks` fora do caminho de PR | ✅ **Resolvido** — observado `skipped` no PR #233 |
| 7 | Duplicação push+PR eliminada | ✅ **Resolvido** |
| 8 | Referências a arquivos removidos | ✅ **Resolvido** no código |
| 9 | Redução de consumo projetada | ✅ **Resolvido** (projeção) / ⚠️ pendente de medição real |
| 10 | `docs/SSRA_RELEASE.md` desatualizado | ⚠️ **Pendente** — descreve pipeline que não existe mais |
| 11 | Colisão de nome `build-and-test` | ⚠️ **Pendente** — confirmada empiricamente |
| 12 | Worker fiscal inativo (Vault vazio) | ⚠️ **Pendente** — 0 secrets, 0 HTTP, 30 execuções/30 min sem efeito |
| 13 | Migration `092` não aplicada | ⚠️ **Pendente** — 0 triggers de estado |
| 14 | Overload `fiscal_reprocessar_documento(uuid,text)` sem authz | ⚠️ **Pendente** |
| 15 | SSRA valida coerência, não atualidade | ⚠️ **Pendente** — não detecta o estado atual da produção |
| 16 | **Runners indisponíveis (billing)** | ❌ **BLOQUEADOR** |
| 17 | **Required Checks órfãos + bypass** | ❌ **BLOQUEADOR** |
| 18 | **Produção defasada** (`a4edafbf`, 23/07) | ❌ **BLOQUEADOR** |

### 4.2 Por que cada bloqueador impede o Go-Live

**❌ #16 — Runners indisponíveis**

Evidência: `runner_id: 0` e `runner_name: ""` em 100% dos jobs, incluindo os do PR #233 hoje às 14:40. Sem runner, **nenhuma** das mudanças desta remediação pode ser validada em execução: V1–V7 do plano são todos inexecutáveis. Não se pode declarar Go-Live de um sistema cujo pipeline de verificação nunca executou. É pré-requisito de todos os outros itens.

**❌ #17 — Required Checks órfãos**

Evidência: 4 contexts exigidos, 0 publicados, comprovado por três varreduras independentes + enumeração de 15 check-runs. Consequência: a única forma de mergear em `main` é bypass de owner — como no PR #232, mergeado com todos os checks vermelhos. **Não existe gate de merge.** Qualquer código entra em `main`, e `main` deploya automaticamente para produção pela integração nativa. Um SaaS entrando em produção não pode ter zero gate entre commit e cliente.

**❌ #18 — Produção defasada**

Evidência medida hoje às 14:46: `pdv-importados.vercel.app/api/health` → `dpl_7DPHmhdzLHNSsd1mXV59tPzfA9aU`, `gitSha: a4edafbf` (23/07). `main` está em `14a9735`. Dois PRs mergeados (#231 e #232 — BL-1 inteiro) não estão no ar. **Pior:** as migrations 272–276 foram aplicadas ao banco, então produção roda com **schema à frente do código**. Hoje é compatível por DEFAULTs, mas é uma janela aberta que ninguém está monitorando — e o SSRA, por design, não a detecta (#15).

### 4.3 Decisão

# ❌ NO-GO

**A remediação de CI/CD está concluída e é sólida** — todos os 8 itens de escopo foram resolvidos com evidência, e nenhuma capacidade real foi perdida (o que saiu já não funcionava).

**Mas o Go-Live permanece bloqueado por três razões independentes**, nenhuma delas causada por esta remediação:

1. Não há como **verificar** nada (#16).
2. Não há **gate** entre commit e produção (#17).
3. A produção **não reflete** o código aprovado (#18).

Os três são resolvíveis por configuração — nenhum exige desenvolvimento. Ordem recomendada: **#18 → #16 → #17** (restaurar produção primeiro, porque é o único que afeta o cliente agora; depois runners, para conseguir validar; depois o gate, que só faz sentido com CI executável).

Feito isso, os ⚠️ #10–#15 tornam-se a fila seguinte, com prioridade para #12–#14, que são os de risco fiscal irreversível.
