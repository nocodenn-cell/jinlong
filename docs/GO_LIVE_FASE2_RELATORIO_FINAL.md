# Go-Live Fase 2 — Relatório Final

**Data:** 2026-07-29
**Fases cobertas:** 2 (auditoria) + 2B (remediação)
**Branch:** `chore/fase2-infra-hardening`

---

## 0. Estado da validação obrigatória

| Comando | Status | Resultado |
|---|---|---|
| `npx tsc --noEmit -p pdv-importados/tsconfig.typecheck.json` | ✅ executado | **0 erros** |
| `actionlint` (5 workflows) | ✅ executado | **0 achados** |
| `npm run guard:all` | ⏸️ **não executado** | classificador de shell indisponível |
| `npm run lint` | ⏸️ **não executado** | idem |
| `npm run build` | ⏸️ **não executado** | idem |

> **Observação sobre `npm run typecheck`:** este script **não existe** no
> `package.json` da raiz. Os scripts disponíveis são `lint`, `build`, `test`,
> `check`, `check:all` e `ci`. O typecheck só existe no workspace
> (`pdv-importados`), via `turbo run typecheck` ou `npm run typecheck -w pdv-importados`.
> Foi essa a forma executada. Vale adicionar `"typecheck": "turbo run typecheck"`
> na raiz para o comando existir como documentado.

**Comando único que fecha a validação pendente:**

```bash
npm run guard:all && npm run lint && npm run typecheck -w pdv-importados && npm run build
```

Nenhuma alteração de código deve ser mesclada antes disso. O commit das
correções de código está **staged, não commitado**, exatamente para não
registrar mudança sem validação completa.

---

## 1. Tabela consolidada

Legenda de **Responsável**: `CÓDIGO` = resolvido por alteração de código ·
`CONFIG` = resolvido por configuração já aplicada · `PROPRIETÁRIO` = requer ação
administrativa sua.

### 1.1 Concluído

| Item | Status | Responsável | Evidência | Rollback | Pronto p/ produção? |
|---|---|---|---|---|---|
| **P0-5** Worker fiscal desligado | ✅ Concluído | CÓDIGO + CONFIG | Migration 285 aplicada. `cron.job` = 0 jobs; última execução 19:54, verificado 20:05 sem novas; 2 documentos preservados | `select cron.schedule('fiscal-worker-every-minute','* * * * *','select internal.fiscal_worker_invoke()')` | **Sim** |
| **P0-1** `concurrency` em 4 workflows | ✅ Concluído | CÓDIGO | commit `66944025`; actionlint 0 achados | `git revert 66944025` | **Sim** — inerte até o CI voltar |
| **P0-1** `timeout-minutes` em 12 jobs | ✅ Concluído | CÓDIGO | 13/13 jobs com timeout; antes eram 2/13 | idem | **Sim** — inerte até o CI voltar |
| **P0-1** Consumo otimizado | ✅ Concluído | CÓDIGO | `Fiscal Worker Cron` (25% dos runs) removido em fase anterior + os dois itens acima | idem | **Sim** |
| **P1-9** Migrations 277–284 versionadas | ✅ Concluído | CÓDIGO | commit `c0ae3321`; confirmadas em `supabase_migrations.schema_migrations` | `git revert` — não altera o banco | **Sim** |
| **P2-3** Actions de terceiros pinadas por SHA | ✅ Concluído | CÓDIGO | `dtolnay/rust-toolchain@4cda84d5`, `Swatinem/rust-cache@42dc69e1` | restaurar `@stable` / `@v2` | **Sim** |
| **P2-1** Dependabot *version updates* | ✅ Concluído | CÓDIGO | `.github/dependabot.yml` | remover o arquivo | **Sim** |
| `permissions:` mínimo em 5 workflows | ✅ Concluído | CÓDIGO | `contents: read` em todos; `deployments: read` no SSRA | remover bloco | **Sim** |

### 1.2 Concluído em código — validação pendente

| Item | Status | Responsável | Evidência | Rollback | Pronto p/ produção? |
|---|---|---|---|---|---|
| **P1-3** `/admin/financeiro` corrigida | 🟡 Código pronto, validação pendente | CÓDIGO | `parseFinanceiroTab` extraída para `financeiroTabs.ts` (sem `'use client'`); typecheck 0 erros | `git checkout` dos 3 arquivos | **Após `npm run build`** |
| **P1-4** Sentry edge + `onRequestError` | 🟡 Código pronto, validação pendente | CÓDIGO | `sentry.edge.config.js` criado; `onRequestError` exportado; `instrumentation-client.ts` criado | reverter 4 arquivos | **Após `npm run build`** |
| **P1-5** `environment` via `VERCEL_ENV` | 🟡 Código pronto, validação pendente | CÓDIGO | helper `lib/observability/sentryEnvironment.js` usado pelos 3 runtimes | idem | **Após `npm run build`** |
| **P1-7** `release` = SHA do commit | 🟡 Código pronto, validação pendente | CÓDIGO | `withSentryConfig({ release: { name: VERCEL_GIT_COMMIT_SHA } })` + init | idem | **Após `npm run build`** |

### 1.3 Aguardando ação do proprietário

| Item | Status | Responsável | Evidência | Rollback | Pronto p/ produção? |
|---|---|---|---|---|---|
| **P0-1** Billing do GitHub | ⏳ **Aguardando ação do proprietário** | PROPRIETÁRIO | Anotação oficial do job `build-and-test` (run `30462114603`): *"The job was not started because recent account payments have failed or your spending limit needs to be increased"*. 300 runs, 0 sucessos desde 2026-07-07 | n/a — restauração de serviço | **Não** |
| **P0-2** Alias de produção (B-4/N1) | ⏳ **Aguardando decisão + ação do proprietário** | PROPRIETÁRIO | `pdv-importados.vercel.app` serve `dpl_7DPHmhdz` (`a4edafbf`, 23/07), 38 commits atrás; `-jinlong` serve `dpl_APh135U7` atrás de SSO | `vercel alias set dpl_7DPHmhdz… pdv-importados.vercel.app` | **Não** |
| **P0-3** Projeto Supabase staging | ⏳ **Aguardando ação do proprietário** | PROPRIETÁRIO | 1 único projeto (`kbabmewnahysfvlybiak`) serve prod + Preview + E2E. Plano completo em §3 | excluir projeto criado | **Não** |
| **P0-4** Contas de teste em produção | ⏳ **Aguardando ação do proprietário** | PROPRIETÁRIO | 15 contas em `auth.users`, 1 real. Plano em §4 | `banned_until = null` (banimento é reversível) | **Não** |
| **P0-6** GitHub Pro + Branch Protection | ⏳ **Aguardando ação do proprietário** | PROPRIETÁRIO | `/branches/main/protection` → 403 *"Upgrade to GitHub Pro"*. Configuração pronta em §5 | `gh api -X DELETE .../branches/main/protection` | **Não** |
| **P1-1** `SUPABASE_SERVICE_ROLE_KEY` e `DATABASE_URL` no escopo Preview | ⏳ **Aguardando ação do proprietário** | PROPRIETÁRIO | `vercel env ls` mostra ambas em `Production, Preview` | `vercel env add` restaura | **Não** |
| **P1-2** Domínio próprio | ⏳ **Aguardando ação do proprietário** | PROPRIETÁRIO | Domínios atuais: só `*.vercel.app` | remover domínio | **Não** |
| **P1-6** `NODE_ENV` manual na Vercel | ⏳ **Aguardando ação do proprietário** | PROPRIETÁRIO | `vercel env ls`: `NODE_ENV` gerenciado em Preview+Production | `vercel env add NODE_ENV` | **Não** |
| **P1-8** Credenciais de teste no escopo Production | ⏳ **Aguardando ação do proprietário** | PROPRIETÁRIO | `RLS_SMOKE_JWT_CAIXA`, `RLS_SMOKE_JWT_PAINEL`, `SEED_DEV_PASSWORD` em Production | `vercel env add` | **Não** |
| **PITR** + teste de restore | ⏳ **Aguardando ação do proprietário** | PROPRIETÁRIO | Sem PITR no plano atual; restore nunca testado | n/a | **Não** |
| **Alerta de erro** configurado | ⏳ **Aguardando ação do proprietário** | PROPRIETÁRIO | Zero alertas no Sentry. Erro em produção não notifica ninguém | remover alerta | **Não** |

---

## 2. P0-2 — Configuração atual, alteração necessária, impacto, rollback

**Não foi feita nenhuma alteração na Vercel.**

### Configuração atual (medida)

```
Projeto:          pdv-importados (prj_UPGWQN4TmzDQRYm5IB80a8ZxOslO)
Team:             NatureCode (team_C1mGhbvpvDlAAEm05epmTKR0)
Root Directory:   pdv-importados
Install Command:  npm ci        · Node 24.x · Region gru1
latestDeployment: dpl_APh135U7Vy5yDn2eKz3i1HMF1oou (fc6c494d, 29/07)
project.live:     false
```

| Alias | Acesso | Deployment servido | Commit |
|---|---|---|---|
| `pdv-importados.vercel.app` | 🔓 aberto | `dpl_7DPHmhdz…` | `a4edafbf` (23/07) |
| `v0-pdv-importados.vercel.app` | 🔓 aberto | `dpl_7DPHmhdz…` | `a4edafbf` (23/07) |
| `pdv-importados-jinlong.vercel.app` | 🔒 SSO | `dpl_APh135U7…` | `fc6c494d` (29/07) |
| `pdv-importados-38nzt338i-jinlong.vercel.app` | 🔒 SSO | `dpl_7DPHmhdz…` | `a4edafbf` (23/07) |

**Causa:** a Vercel reatribui automaticamente apenas os aliases auto-gerados.
Aliases custom permanecem fixados no deployment onde foram postos.

**Severidade correta:** não é vazamento de dados — a raiz responde 307 para login
e o hardening do banco (migrations 277–284) vale para qualquer build. É problema
de **correção e operação**: o cliente receberia código de 23/07, anterior às
revogações de `EXECUTE` das migrations 277/278/282.

### Alteração necessária (recomendada)

```bash
# 1. Consolidar o alias público no deployment atual
vercel alias set dpl_APh135U7Vy5yDn2eKz3i1HMF1oou pdv-importados.vercel.app

# 2. Remover o alias residual da integração v0.dev
vercel alias rm v0-pdv-importados.vercel.app

# 3. Validar
curl -s https://pdv-importados.vercel.app/api/health
# deploymentId deve ser dpl_APh135U7Vy5yDn2eKz3i1HMF1oou
```

**Passo 4 — impede a recorrência (dashboard):** Vercel → Project → Settings →
Domains → promover `pdv-importados.vercel.app` a *production domain* do projeto.
Sem isso, o alias volta a ficar para trás no próximo deploy e B-4 reabre.

**Passo 5 — Deployment Protection (dashboard, não há comando CLI):**
Settings → Deployment Protection → **Vercel Authentication**:
- Production: **desabilitar** (é o que trava o acesso do cliente)
- Preview: **manter habilitada**

**Passo 6 — se optar por manter a proteção no host que o SSRA mede:** gerar
*Protection Bypass for Automation* e adicionar o header
`x-vercel-protection-bypass` em `scripts/validate-production.mjs`. Sem isso o
SSRA fica permanentemente vermelho por não conseguir ler `/api/health`.

### Impacto

- `pdv-importados.vercel.app` passa a servir o código atual — objetivo desejado, mas é mudança visível para quem já usa a URL.
- O SSRA passa a comparar plataforma ↔ runtime na mesma superfície e fica verde.
- Desabilitar Vercel Authentication em Production abre a aplicação ao público; a proteção real passa a ser a autenticação Supabase + RLS. **Fazer somente após P0-3 e P0-4**, para não abrir a porta com contas de teste ativas no banco.

### Rollback

```bash
vercel alias set dpl_7DPHmhdzLHNSsd1mXV59tPzfA9aU pdv-importados.vercel.app
vercel alias set dpl_7DPHmhdzLHNSsd1mXV59tPzfA9aU v0-pdv-importados.vercel.app
```
O deployment antigo continua `READY`. Reversível em segundos. Deployment
Protection é reversível no mesmo painel, efeito imediato, sem redeploy.

---

## 3. P0-3 — Arquitetura de staging (plano final)

### Decisão: **staging em plano Free** — custo zero

O Supabase permite 2 projetos ativos no Free por organização. Ressalvas
irrelevantes para staging: pausa após 7 dias de inatividade, e ausência de PITR.

### Topologia final

```
                    ┌──────────────────────────────┐
  Vercel Production →  Supabase  jinlong  (Pro/Free)  ← dados do cliente
                    └──────────────────────────────┘
                    ┌──────────────────────────────┐
  Vercel Preview    →  Supabase  jinlong-staging      ← descartável
  E2E / smoke / CI  →  (Free, sa-east-1)
                    └──────────────────────────────┘
```

### Por que não pode esperar

1. **O gate de drift do CI é decorativo.** `SUPABASE_MIGRATION_CHECK_PROJECT_REF` aponta para produção; o gate compara produção consigo mesma e sempre passa.
2. **Toda migration estreia em produção.** As 277–285 foram aplicadas direto no banco do cliente.
3. **P0-4 não tem solução estável sem staging** — sem lugar para recriar as contas de teste, elas voltam.
4. **250+ branches podem escrever em produção** via `service_role` no escopo Preview.

### Execução

| # | Passo | Comando | Rollback |
|---|---|---|---|
| **0** | **Backup dos env atuais** | `vercel env pull .env.prod.bak --environment=production` e `--environment=preview`, guardados **fora** do repo | — |
| 1 | Criar `jinlong-staging`, `sa-east-1` | Dashboard Supabase | excluir projeto |
| 2 | Aplicar migrations 001→285 | `supabase db push --project-ref <novo>` | recriar |
| 3 | Semear contas de teste | `npm run seed:dev-users -w pdv-importados` | — |
| 4 | Repontar escopo **Preview** | `vercel env rm <VAR> preview` + `vercel env add <VAR> preview` para `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` | passo 0 restaura |
| 5 | Repontar `SUPABASE_MIGRATION_CHECK_PROJECT_REF` | GitHub Secrets | valor anotado |
| 6 | Repontar `PLAYWRIGHT_*` e `CI_*` | GitHub Secrets | idem |
| 7 | Validar isolamento | contar `vendas` nos dois projetos antes/depois de um deploy de Preview | — |

O passo 0 é obrigatório: sem ele o rollback do passo 4 é reconstrução manual.

---

## 4. P0-4 — Saneamento das contas (plano final)

### Regra inviolável

> **Conta com qualquer vínculo em `vendas`, `itens_venda` ou `movimentos_caixa`
> NÃO é excluída — é banida permanentemente.** Apagar o operador de uma venda
> destrói rastreabilidade fiscal e contábil. Banir remove o acesso; excluir
> removeria a auditoria.

Verificação obrigatória antes de qualquer exclusão:

```sql
select id from auth.users where email = '<conta>';
select count(*) from public.vendas            where operador_id = '<id>';
select count(*) from public.movimentos_caixa   where operador_id = '<id>';
select count(*) from public.usuarios           where id = '<id>';
-- Qualquer resultado > 0 → BANIR, não excluir.
```

### Classificação final

#### MANTER (1)

| Conta | Justificativa |
|---|---|
| `aoliveiradamata@gmail.com` | dono/operador real, último login 27/07 |

#### EXCLUIR — após verificação de vínculo zero (4)

| Conta | Motivo | Prioridade |
|---|---|---|
| `cloudagenttest@mailinator.com` | e-mail **não confirmado**; `mailinator.com` é caixa postal **pública** — qualquer pessoa dispara reset de senha | **Janela 1 — imediata** |
| `probe.dono.1784431715968@fp-homolog.com` | resíduo de probe, nunca logou | Janela 2 |
| `probe.dono.1784431787527@fp-homolog.com` | idem | Janela 2 |
| `smoke.dono.1784432057537@fp-homolog.com` | resíduo de smoke, nunca logou | Janela 2 |

#### BANIR PERMANENTEMENTE — logaram, podem ter operado caixa (9)

| Conta | Último login |
|---|---|
| `demo@jinlong.com` | **2026-07-29** — confirmar se há demo comercial agendada antes |
| `e2e-admin@fastproduct.dev` | 2026-07-19 |
| `e2e-gerente@localhost.test` | 2026-07-18 |
| `e2e-operador@localhost.test` | 2026-07-18 |
| `operador.test@example.com` | 2026-07-10 |
| `demo-gerente@localhost.test` | 2026-07-10 |
| `demo-operador@localhost.test` | 2026-06-23 |
| `gerente.test@example.com` | 2026-06-15 |
| `e2e-dono@localhost.test` | nunca — pode virar EXCLUIR se vínculo = 0 |

#### AVALIAR (1)

| Conta | Nota |
|---|---|
| `email-do-test@exemplo.com` | nunca logou, origem desconhecida. Verificar vínculo → excluir ou banir |

### Janelas

**Janela 1 — imediata, independe de staging.** Só `cloudagenttest@mailinator.com`.

```sql
update auth.users set banned_until = 'infinity'
 where email = 'cloudagenttest@mailinator.com';
```
Rollback: `set banned_until = null`. Excluir só após 48 h e vínculo = 0.

**Janela 2 — depois do staging.** As 3 contas de probe/smoke: banir → 48 h → excluir.

**Janela 3 — depois do seed em staging.** As 9 de banimento permanente.
Pré-condição: seed executado **e** um ciclo de E2E verde apontando para staging.
Sem isso, remover de produção quebra os testes e alguém as recria.

**Janela 4 — rotação.** Rotacionar `PLAYWRIGHT_TEST_PASSWORD`,
`PLAYWRIGHT_CAIXA_TEST_PASSWORD`, `SEED_DEV_PASSWORD`; remover
`SEED_DEV_PASSWORD` do escopo Production.

---

## 5. P0-6 — O que habilitar imediatamente após ativar o GitHub Pro

**Nada foi implementado**, conforme instruído.

### Ordem obrigatória

> **Pro → P0-1 resolvido → CI verde → só então `required_status_checks`.**
> Exigir checks que não executam trava todo merge.

### 5.1 Limpeza prévia

Remover os 4 workflows-fantasma (registrados na API, sem arquivo no repo) para
que não poluam a lista de contextos: `architecture-validation`, `ci-agents`,
`ci-core`, `ci-visual-baseline`.

### 5.2 Branch Protection + Required Checks

```bash
gh api -X PUT repos/nocodenn-cell/fastproduct/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["gitleaks", "build-and-test"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "require_code_owner_reviews": true,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true,
  "required_conversation_resolution": true
}
JSON
```

`enforce_admins: false` de propósito — com um único colaborador admin, ativar
isso cria risco de auto-bloqueio sem ninguém para destravar.

### 5.3 Dependabot Alerts + Code Security

```bash
gh api -X PUT repos/nocodenn-cell/fastproduct/vulnerability-alerts
gh api -X PATCH repos/nocodenn-cell/fastproduct \
  -f 'security_and_analysis[dependabot_security_updates][status]=enabled'
```
Validação: `gh api repos/nocodenn-cell/fastproduct/dependabot/alerts --jq length`
deve retornar número em vez de 403.

### 5.4 Secret Scanning + Push Protection

```bash
gh api -X PATCH repos/nocodenn-cell/fastproduct \
  -f 'security_and_analysis[secret_scanning][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
```

**Ressalva importante:** em repositório **privado**, Secret Scanning e Push
Protection exigem **GitHub Advanced Security**, que **não vem no Pro** — é
licenciamento Enterprise. O Pro **não** destrava estes dois.

**Mitigação já em vigor a custo zero:** `secret-scan.yml` (gitleaks) roda em push
e PR para `main`, com `concurrency` e `timeout` configurados. Cobre o essencial;
o que falta é o bloqueio *no momento do push*, que só o GHAS oferece.

### 5.5 Resumo do que o Pro destrava

| Recurso | Pro destrava? |
|---|---|
| Branch Protection / rulesets | ✅ |
| Required status checks | ✅ |
| CODEOWNERS com efeito | ✅ |
| PR obrigatório antes do merge | ✅ |
| Dependabot **alerts** (CVE) | ✅ |
| Secret Scanning | ❌ requer GHAS |
| Push Protection | ❌ requer GHAS |
| Code Scanning (CodeQL) | ❌ requer GHAS |

### 5.6 Também corrigir (custo zero, depois do Pro)

`.github/CODEOWNERS` referencia 5 caminhos inexistentes — regras órfãs dão falsa
sensação de cobertura e, com `require_code_owner_reviews` ativo, viram ruído:
`/pdv-importados/src/lib/auth/`, `/pdv-local/Cargo.toml`,
`/docs/DECISION-LOG.md`, `/tsconfig.json`, `/npm-audit.log`.

---

## 6. Futuro (P2/P3) — não bloqueia o primeiro cliente

| # | Item | Ação |
|---|---|---|
| P2-2 | 4 workflows-fantasma na API | remover pela UI (feito junto de §5.1) |
| P2-4 | 3 tabelas sem RLS: `documentos_fiscais_dlq`, `sync_request_nonces`, `venda_engine_shadow_runs` | **não exploráveis hoje** — verificado: sem grant a `anon`/`authenticated`. Habilitar RLS como defesa em profundidade |
| P2-5 | Triggers expostas como RPC (`tg_documentos_fiscais_eventos_*`, `trg_fn_*`) | `REVOKE EXECUTE ... FROM authenticated, anon` — migration 286 |
| P2-6 | `gtin_lookup_cache` com policies `always true` | restringir por `loja_id`/perfil |
| P2-7 | `search_path` mutável em 4 funções, incl. `finalizar_venda_transacional` v2/v3 | `SET search_path = ''`; avaliar drop das versões legadas |
| P2-8 | Proteção contra senha vazada desligada | Supabase → Auth → habilitar HaveIBeenPwned |
| P3-1 | Headers: faltam CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` | `next.config.js`; CSP exige teste |
| P3-2 | 250+ branches; `delete_branch_on_merge: false` | habilitar flag e podar |
| P3-3 | 6 GitHub Environments órfãos | remover |
| P3-4 | `.nvmrc`=20 vs Vercel Node 24 | alinhar para 24 |
| P3-5 | CODEOWNERS com 5 caminhos órfãos | limpar (§5.6) |
| P3-6 | Org Sentry `damatta-jm` / `sentry-lime-envelope` sem uso | confirmar e remover |
| P3-7 | Logs versionados na raiz (`.audit-*.log`, `.aider.chat.history.md` 430 KB) | `.gitignore` |
| — | Adicionar `"typecheck": "turbo run typecheck"` na raiz | §0 |
| — | Remover `pdv-importados/sentry.client.config.js` | já neutralizado (sem `Sentry.init`); remoção é limpeza |

---

## 7. Correções de registro desta fase

Dois erros meus, corrigidos com base em evidência:

1. **Classifiquei o alias órfão como "pior que P0" e como descoberta nova.**
   Errado nos dois pontos: já constava como **B-4** (`GO_LIVE_BLOCKERS.md`) e
   **N1** (`PLANO_REMEDIACAO_CICD.md`), inclusive o alias `v0-`. E não é
   vazamento de dados. Documento reescrito com a severidade correta.

2. **Afirmei que o Sentry estava cego no browser.** O regex do SDK v10 reconhece
   `sentry.client.config.js` sob webpack, e o build usa `next build` — a
   instrumentação funcionava. Inferi cegueira de "zero erros em 30 dias", mas
   com 15 usuários e 56 vendas, tráfego baixo explica igualmente. Os gaps de
   **edge** e **`onRequestError`** eram reais e foram corrigidos.

---

## 8. Caminho crítico para o primeiro cliente

Ordem em que as dependências se resolvem:

1. **Billing do GitHub** (P0-1) — nada mais é validável sem CI.
2. **`npm run guard:all && npm run lint && npm run typecheck -w pdv-importados && npm run build`** — fechar a validação e commitar as correções de código.
3. **GitHub Pro** (P0-6) → aplicar Branch Protection **depois** do CI verde.
4. **Staging** (P0-3) — pré-requisito de P0-4, P1-1 e P1-8.
5. **Saneamento das contas** (P0-4) + **secrets fora do Preview/Production** (P1-1, P1-6, P1-8).
6. **Consolidar o alias** (P0-2, passos 1–4) + corrigir `PRODUCTION_HOST` do SSRA.
7. **PITR + teste de restore cronometrado.**
8. **Pelo menos 1 alerta de erro** no Sentry, testado ponta a ponta.
9. **Abrir produção** (P0-2, passo 5) — deliberadamente por último.
10. Rotação de credenciais, depois P2/P3.

### O que depende exclusivamente de você

| # | Ação | Custo |
|---|---|---|
| 1 | Regularizar billing do GitHub | valor em aberto + limite de gastos |
| 2 | Assinar GitHub Pro | US$ 4/mês |
| 3 | Criar projeto Supabase staging | **US$ 0** (2º projeto Free) |
| 4 | Contratar PITR | add-on Supabase |
| 5 | Registrar domínio próprio | anuidade do domínio |
| 6 | Decidir e executar consolidação do alias | US$ 0 |
| 7 | Executar as 4 janelas de saneamento de contas | US$ 0 |
| 8 | Ajustar escopos de env na Vercel (P1-1, P1-6, P1-8) | US$ 0 |
| 9 | Configurar 1 alerta no Sentry | US$ 0 |

Seis das nove são gratuitas. **Nenhuma pendência técnica está oculta:** todo item
aberto neste relatório é ação administrativa ou depende de uma delas.
