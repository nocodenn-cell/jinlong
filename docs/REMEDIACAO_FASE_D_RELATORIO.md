# Fase D — Relatório final da remediação CI/CD

**Data:** 2026-07-25 · **Branch:** `claude/bl1-homolog-bl2-analysis-f22akt` · **PR:** #233
**Commits da remediação:** `e7388bc` (A) · `93f4224` + `92519b1` (B) · `c66fe89` + `cd42f3f` + `55de581` (C)

---

## 1. Arquitetura anterior × nova

### Antes — 6 workflows

```
ci-pdv-importados.yml    push[main,develop] + PR[main,develop]
  ├── build-and-test
  ├── E2E crítico (sistema de risco)
  ├── deploy ──────────────► amondnet/vercel-action --prod   ⚠️ nunca executou
  │                          + getsentry/action-sourcemaps
  │                          + getsentry/action-release
  ├── validate-production (SSRA)   needs: deploy → sempre skipped
  └── e2e-playwright               atrás de vars, sempre skipped

ci-backend-supabase.yml  push + PR          7 jobs (1 em windows)
ci-pdv-local.yml         push + PR          build-and-test + rust-tauri-checks (windows, ~17 min)
secret-scan.yml          push + PR          gitleaks
e2e-playwright-only.yml  push[staging]      ⚠️ 0 runs — branch staging não existe
fiscal-cron.yml          */5 * * * *        ⚠️ header errado, ~8.640 min/mês

+ pg_cron (Supabase)     * * * * *          ⚠️ agendador paralelo, Vault vazio
```

**Dois mecanismos de deploy, dois agendadores fiscais, nenhum dos dois funcionando.**

### Depois — 5 workflows

```
ci-pdv-importados.yml    PR[main] + dispatch
  ├── build-and-test
  ├── E2E crítico (sistema de risco)
  └── e2e-playwright

ci-backend-supabase.yml  PR[main] + dispatch      7 jobs
ci-pdv-local.yml         PR[main] + push[main] + schedule semanal + dispatch
  ├── build-and-test            (não roda no cron)
  └── rust-tauri-checks         só cron semanal / dispatch / label `run-tauri`
secret-scan.yml          PR[main] + push[main]    gitleaks  ← piso de segurança
release-validate.yml     deployment_status        ssra ← NOVO

Deploy de produção ──► integração nativa da Vercel (GitHub App)
Worker fiscal ────────► pg_cron + internal.fiscal_worker_invoke()
```

**Um mecanismo de deploy, um agendador fiscal, responsabilidades separadas.**

### Mudanças principais

| # | Mudança | Efeito |
|---|---|---|
| A | Job `deploy` removido | Fim do deploy duplicado. Sourcemaps/release do Sentry preservados via `withSentryConfig` no `next build` |
| A | SSRA → `release-validate.yml` em `deployment_status` | Gate desacoplado do mecanismo de deploy; roda depois de a plataforma declarar `success` |
| B | `fiscal-cron.yml` removido | Elimina o maior consumidor de minutos e o agendador que nunca poderia autenticar |
| C.1 | `e2e-playwright-only.yml` removido | Workflow inalcançável (0 runs, branch inexistente) |
| C.2 | `rust-tauri-checks` semanal | Sai do caminho de todo PR |
| C.3 | CI pesado só em `pull_request` | Fim da validação em duplicidade |

---

## 2. Estimativa de redução

**Método:** duração real medida por job (wall-clock `started_at`→`completed_at`), multiplicador de SO do GitHub (Linux 1×, Windows 2×), cobrança arredondada por job. A API de billing é inacessível nesta sessão e `billable.total_ms` retorna 0 mesmo para runs reais — números absolutos precisam ser confirmados em Settings → Billing.

| Item | Antes (mês) | Depois (mês) | Economia |
|---|---:|---:|---:|
| `fiscal-cron` (288 runs/dia × 1 min) | **~8.640** | **0** | **~8.640** |
| `rust-tauri-checks` (17 min/run) | 17 × nº PRs de `pdv-local` | 17 × ~4,3 semanas ≈ **~75** | variável, alta |
| CI pesado duplicado (push + PR) | 2× por commit | 1× por commit | **~50%** do CI |
| `e2e-playwright-only` | 0 | 0 | 0 (ganho de clareza) |
| Job `deploy` (build duplicado) | ~4 min/push em `main` | 0 | ~4 min/push |
| `secret-scan` | mantido | mantido | 0 (deliberado) |

**Ordem de grandeza:** de **≫ 8.640 min/mês** para **algumas centenas de min/mês** — de acima de qualquer plano (Free 2.000 · Pro/Team 3.000) para dentro do menor deles.

O termo dominante é o `fiscal-cron` sozinho. Os demais itens somam melhora relevante, mas nenhum chega perto dessa ordem.

---

## 3. Riscos residuais

| # | Risco | Severidade | Mitigação |
|---|---|---|---|
| R1 | **`main` sem CI pós-merge.** Com CI pesado só em PR, push direto para `main` (bypass de owner) não é validado | 🟠 Média | `secret-scan` mantido em push como piso. Mitigação real = Branch Protection efetivo (§4) |
| R2 | **`build-and-test` provavelmente ainda está vermelho.** Em 11/05, último run com runner real, falhou por erro real de lint/typecheck/teste. O apagão mascara isso desde então | 🔴 Alta | Ao restaurar runners, esperar falha e corrigir. Não é regressão desta remediação |
| R3 | **Colisão de nome `build-and-test`** entre `ci-pdv-importados.yml` e `ci-pdv-local.yml` | 🟠 Média | Renomear antes de configurar required checks. Não feito — fora do escopo autorizado |
| R4 | **Required checks órfãos** (`build`, `lint`, `test`, `typecheck` não são publicados por nada) | 🔴 Alta | §4 — decisão pendente |
| R5 | **Worker fiscal continua inativo** (Vault vazio) | 🟠 Média | Runbook em `REMEDIACAO_FASE_B_FISCAL.md`, com 4 pré-condições |
| R6 | **SSRA nunca foi executado** nesta configuração nova | 🟡 Baixa-média | Só valida no próximo deploy de produção. E o SSRA continua sem detectar defasagem (P1-2) |
| R7 | **Produção defasada** — `pdv-importados.vercel.app` serve `dpl_7DPH…` (`a4edafbf`, 23/07) | 🔴 Alta | P0-1, intocado — não é escopo de CI/CD |
| R8 | `rust-tauri-checks` só semanal: regressão em Rust demora até 7 dias para aparecer | 🟡 Baixa | Label `run-tauri` para PRs que mexam em `src-tauri` |

---

## 4. Pendências de configuração manual

Nada aqui é resolvível por commit — depende de acesso a console.

### GitHub

| # | Ação | Por quê |
|---|---|---|
| G1 | **Billing → Actions:** restaurar limite | Sem runner desde ~11/05. Nada executa |
| G2 | **Required checks:** decidir entre (a) trocar os 4 contexts órfãos pelos reais (`build-and-test`, `gitleaks`, …) ou (b) renomear jobs para `build`/`lint`/`test`/`typecheck` | Hoje a proteção de `main` é decorativa: exige 4 contexts que nada publica, e é contornada por bypass |
| G3 | **Bypass list:** esvaziar após G2 | Enquanto houver bypass, o gate é teatro |
| G4 | Label `run-tauri` criada no repositório | Escape hatch do `rust-tauri-checks` |

> **Sobre a condição "mantenha os 4 status sendo publicados":** não foi possível cumprir literalmente — eles **nunca** foram publicados por workflow algum. A remediação não os alterou (nem poderia). G2 é a decisão que resolve.

### Vercel

| # | Ação | Por quê |
|---|---|---|
| V1 | Confirmar `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` nas env vars | `withSentryConfig` só sobe sourcemaps se existirem. Sem elas, não há upload — problema pré-existente, não causado pela remoção do job |
| V2 | Investigar por que `pdv-importados.vercel.app` está pinado em `dpl_7DPH…` | R7/P0-1 |
| V3 | Declarar um Production Domain canônico (hoje há 4 aliases) | Ambiguidade de "o que é produção" |

### Supabase

| # | Ação | Por quê |
|---|---|---|
| S1 | Criar os secrets `fiscal_worker_url` e `fiscal_worker_key` no Vault | Única razão de o worker não rodar. **Não fazer antes de S2–S4** |
| S2 | `FISCAL_PROVIDER_TYPE` ≠ `mock` | Senão emite chaves falsas `NFE-MOCK-…` marcadas como `EMITIDO` |
| S3 | Aplicar migration `092` (máquina de estados) | Sem ela `EMITIDO → PENDENTE` é aceita |
| S4 | Remover overload `fiscal_reprocessar_documento(uuid,text)` | Sem authz, com `GRANT` a `authenticated` |

---

## 5. Verificações executadas

| Verificação | Resultado |
|---|---|
| Parse YAML dos 5 workflows | ✅ todos válidos |
| Referências órfãs (`fiscal-cron`, `e2e-playwright-only`, `getsentry`) | ✅ nenhuma |
| `amondnet` | ✅ só em comentário explicando a remoção |
| `scripts/validate-production.mjs` | ✅ existe; referenciado por `release-validate.yml` e por `npm run validate:production` |
| Guards de fork após mudança de gatilhos | ✅ `event_name != 'pull_request'` continua correto nos 5 jobs que usam |
| Branches `develop` / `staging` | ✅ confirmadas inexistentes — gatilhos removidos eram config morta |
| Não-referência antes de remover workflows | ✅ só citações documentais, corrigidas |

**Não executado:** `npm run guard:all`, lint, typecheck e testes — exigem `npm ci` completo e, mais importante, o R2 indica que já falhavam antes desta remediação. Rodá-los aqui não distinguiria falha pré-existente de regressão introduzida. Nenhum arquivo de código de aplicação foi tocado: as mudanças são exclusivamente de `.github/workflows/**` e documentação.

---

## 6. Conclusão

O que foi eliminado eram, em todos os casos, **mecanismos que não funcionavam**: um job de deploy que nunca executou, um workflow que nunca disparou, um cron que nunca autenticou, e validações rodando em dobro. Nenhuma capacidade real foi perdida.

O que **não** foi resolvido, e continua sendo o caminho crítico: os runners seguem indisponíveis (G1), a proteção de `main` continua decorativa (G2/G3), o worker fiscal continua inativo (S1–S4) e a produção continua defasada (V2). A remediação deixou o pipeline mais barato, mais simples e honesto sobre o próprio estado — mas o sistema só volta a ter gate real depois de G1 e G2.
