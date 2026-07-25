# Auditoria de Custo — GitHub Actions

**Data:** 2026-07-25 · **Natureza:** investigação. Nenhuma alteração executada.
**Objetivo:** decidir entre *aumentar o limite de minutos* ou *reduzir drasticamente o uso*.

---

## 1. Resposta direta: precisamos do Actions fazendo deploy?

**Não.** A proposta do usuário está correta e a evidência a sustenta:

1. ✅ Manter a Vercel responsável pelos deploys — é o que já acontece de fato há semanas.
2. ✅ Remover o job `deploy` (`amondnet/vercel-action`) — nunca executou; 100% `skipped`.
3. ✅ Actions só para CI (lint, testes, auditorias, SSRA).

**Uma condição obrigatória:** o job `deploy` é hoje o único lugar que faz *upload de sourcemaps* e *criação de release no Sentry* (`ci-pdv-importados.yml:194-221`). Removê-lo sem substituto perde observabilidade de produção **silenciosamente**. Substituir pela integração nativa Sentry↔Vercel antes de remover. Esse é o único item que não é ganho puro.

---

## 2. Metodologia e limitação

**Limitação declarada, importante para interpretar os números:**

- A API de billing é inacessível nesta sessão (`/settings/billing/actions` → *"sessions are bound to their configured repositories"*; `/actions/cache/usage` → bloqueado pelo proxy). **Não tenho a fatura real.**
- O campo `billable.total_ms` de `get_workflow_run_usage` retorna **0 para todos os runs deste repositório** — inclusive para runs comprovadamente reais (ex.: run `24628565321`, job com `runner_id: 1000000122`, 87s de execução). O campo é inutilizável aqui e **não deve ser lido como "custo zero"**.

**Método usado:** medição de *wall-clock* real por job (`started_at` → `completed_at`), que é a base de cobrança do GitHub (arredondada para cima por job, multiplicada pelo fator do SO: Linux 1×, **Windows 2×**, macOS 10×).

**Janela saudável identificada:** os jobs pararam de receber runner por volta de **11/05/2026**. Runs anteriores a essa data executaram de verdade e são a fonte das medições abaixo. Isso também revela que **o apagão dura ~2,5 meses**, bem mais que os dias documentados anteriormente.

---

## 3. Volume por workflow (contagem real de runs)

| Workflow | Runs (histórico total) |
|---|---:|
| `secret-scan.yml` | **1.044** |
| `ci-pdv-importados.yml` | **950** |
| `fiscal-cron.yml` | **736** |
| `ci-backend-supabase.yml` | **563** |
| `ci-pdv-local.yml` | **199** |
| `e2e-playwright-only.yml` | **0** ← nunca executou |

## 4. Custo medido por execução

| Job | SO | Duração medida | Multiplicador | **Min. faturados/run** | Evidência |
|---|---|---:|---:|---:|---|
| `rust-tauri-checks` | windows | **8min06s** | **2×** | **≈ 17 min** | job `74424320942` (05/05): 13:36:23→13:44:29 |
| `build-and-test` (pdv-importados) | ubuntu | 1min27s | 1× | ≈ 2 min | job `72011752627` (19/04) — **piso**, ver nota |
| `build-and-test` (pdv-local) | ubuntu | 43s | 1× | ≈ 1 min | job `74424321056` (05/05) |
| `call-worker` (fiscal-cron) | ubuntu | ~3s (um `curl`) | 1× | **1 min** (mínimo cobrável) | `fiscal-cron.yml:12-20` |
| `gitleaks` | ubuntu | curto | 1× | ≈ 1 min | `secret-scan.yml` |
| `anti-replay-diagnostic-gate` | **windows** | não medido | **2×** | ≥ 2 min | `ci-backend-supabase.yml` |

> **Nota sobre o piso de 2 min:** a medição de 19/04 é do workflow **da época**, que rodava só `Lint`/`Unit tests`/`Build`. O `build-and-test` atual acrescentou `npm run guard:all` e `npx turbo run lint typecheck test`. O custo real hoje é maior — provavelmente 3–5 min. Tratar 2 min como **limite inferior**, não como estimativa.

### 4.1 O termo dominante

```
fiscal-cron:  */5 * * * *  =  288 runs/dia  =  ~8.640 runs/mês
              × 1 min (mínimo cobrável por job)
              =  ~8.640 minutos/mês
```

**Sozinho, o `fiscal-cron` consome mais minutos que qualquer plano oferece** (Free 2.000 · Pro 3.000 · Team 3.000 · Enterprise 50.000). E é o workflow que — conforme `docs/PLANO_REMEDIACAO_CICD.md` §4 — **nunca funcionou**: manda o header `apikey` onde a Edge Function exige `X-FISCAL-WORKER-KEY`, recebe 401, e sem `curl -f` reporta sucesso.

> **Esta é a resposta central da auditoria.** O estouro de limite quase certamente não vem do CI. Vem de um cron quebrado disparando 288 vezes por dia para receber 401.

---

## 5. Classificação por destino

### 5.1 Podem ser **eliminados**

| Workflow/Job | Justificativa | Economia |
|---|---|---:|
| **`e2e-playwright-only.yml`** | **0 runs em todo o histórico.** Só dispara em `staging`, branch fora do fluxo. Duplica `e2e-critical` | 0 min (mas remove ruído e um `concurrency` enganoso) |
| **`fiscal-cron.yml`** (do Actions) | Não é CI. Quebrado desde sempre. Deve virar `pg_cron` no Supabase | **~8.640 min/mês** |
| **job `deploy`** | Nunca executa; duplica a Vercel | ~4 min/push em `main` (e evita build duplicado) |
| **job `e2e-playwright`** | Atrás de `vars.ENABLE_PLAYWRIGHT_E2E`; hoje sempre `skipped`. Redundante com `e2e-critical` | ~0 hoje; evita custo futuro |

### 5.2 Devem rodar **apenas em PR** (não em push para `main`)

Hoje `ci-pdv-importados`, `ci-backend-supabase`, `ci-pdv-local` e `secret-scan` disparam em **push E pull_request** para `main`/`develop` — ou seja, **o mesmo commit é validado duas vezes**: uma no PR, outra no merge.

| Workflow | Ação | Economia |
|---|---|---:|
| `secret-scan` | Manter em PR; **manter também em push** — é o único gate de segredo e custa ~1 min | — |
| `web-build-and-test` | Só em `pull_request` | ~50% dos runs |
| `backend-checks` | Só em `pull_request` | ~50% dos runs |
| `desktop-build-and-test` | Só em `pull_request` | ~50% dos runs |

Com Branch Protection exigindo *"branches up to date"*, validar no PR é suficiente — o merge não introduz código não testado.

### 5.3 Podem rodar **semanalmente** (ou sob demanda)

| Job | Hoje | Proposto | Economia |
|---|---|---|---:|
| **`rust-tauri-checks`** | Todo PR que toca `pdv-local/**` | `schedule` semanal + `workflow_dispatch` + label `run-tauri` | **17 min × frequência** — o maior ganho unitário |
| `e2e-critical` | Todo push/PR | Noturno + `workflow_dispatch` + label `run-e2e` | Alto (Playwright + browsers) |
| `anti-replay-diagnostic-gate` | Todo PR (windows, 2×) | Semanal, ou migrar para `ubuntu` se não for específico de Windows | ≥ 2 min/run |

**Justificativa para o Tauri:** o desktop está fora do escopo D0 (`Jinlong/02_ESTADO_ATUAL.md`: *"Desktop (Tauri) — completo mas fora do D0"*). Pagar 17 minutos por PR para validar um módulo congelado é o pior custo/benefício do pipeline.

### 5.4 Podem ser substituídos por **recursos nativos da Vercel**

| Função hoje no Actions | Recurso nativo | Ganho |
|---|---|---|
| Job `deploy` (`amondnet/vercel-action --prod`) | **Git Integration** (já ativa) | Elimina o job, o build duplicado e 3 secrets |
| Build de produção | **Build da Vercel** (com cache entre deploys) | Não paga minutos de Actions |
| Preview por PR | **Preview Deployments** (já ativos) | Já é nativo |
| Sourcemaps + release Sentry | **Integração Sentry↔Vercel** | Remove a última dependência do job `deploy` |
| Rollback | **Instant Rollback** | Funciona mesmo com CI fora |

**Não substituível pela Vercel** (permanece no Actions): `gitleaks`, lint/typecheck/testes unitários, checks de RLS/Supabase, e o **SSRA** — que valida a Vercel e por definição não pode viver dentro dela.

---

## 6. Cenário consolidado

| | Hoje (se os runners voltassem) | Proposto |
|---|---:|---:|
| `fiscal-cron` | ~8.640 min | **0** (vai para `pg_cron`) |
| CI por PR (web + backend + secret) | ~2× por commit | ~1× por commit |
| `rust-tauri-checks` | 17 min × PRs de `pdv-local` | 17 min × ~4/mês = ~68 min |
| `e2e-critical` | por push/PR | noturno/sob demanda |
| Job `deploy` | ~4 min/push em `main` | 0 |
| **Ordem de grandeza total** | **≫ 8.640 min/mês** | **algumas centenas de min/mês** |

---

## 7. Recomendação: reduzir, não aumentar

**Não aumente o limite de minutos ainda.**

1. **O maior consumidor não é CI — é um cron quebrado.** Aumentar o limite pagaria por ~8.640 min/mês de chamadas que recebem 401. Corrigir isso é uma migração para `pg_cron`, não uma decisão de orçamento.
2. **O segundo maior é um módulo congelado.** `rust-tauri-checks` custa 17 min/run para validar o desktop, que está fora do D0.
3. **Metade dos runs é duplicada** (push + PR do mesmo commit).
4. **Só depois de 1–3 faz sentido medir de novo** e decidir sobre o plano. A conta atual não representa a necessidade real do projeto — representa desperdício estrutural.

**Ordem sugerida:**

```
1. fiscal-cron → pg_cron            (elimina o termo dominante)
2. Remover e2e-playwright-only      (0 runs, custo zero, ganho de clareza)
3. rust-tauri-checks → semanal      (maior ganho unitário)
4. CI só em pull_request            (corta ~50% dos runs)
5. Remover job deploy               ← só após substituir o Sentry
6. Medir novamente e decidir o plano
```

**Ressalva honesta:** os passos 1–4 dependem de os runners voltarem para serem *verificáveis* — enquanto o billing estiver esgotado, nenhum job executa e não há como medir o efeito. A sequência acima é para ser aplicada **junto** com a restauração do billing, não depois: restaure o limite mínimo necessário, aplique os cortes, meça, e só então decida o plano definitivo.

---

## 8. Limitações

| Item | Estado |
|---|---|
| Fatura / minutos consumidos reais | ❌ API de billing bloqueada nesta sessão |
| `billable.total_ms` da API de usage | ❌ Retorna 0 para todos os runs — inutilizável |
| Custo atual de `build-and-test` (pdv-importados) | ⚠️ Medido em versão antiga do workflow; valor real é maior (piso de 2 min) |
| Duração de `e2e-critical` e dos 7 jobs de `ci-backend-supabase` | ⚠️ Não medidos individualmente — sem execução saudável recente |
| Runs/mês por workflow | ⚠️ Contagens são históricas totais, não taxa mensal; só `fiscal-cron` tem taxa determinística (cron) |

Para fechar os números absolutos: **Settings → Billing → Actions → "Usage this month"**, que mostra minutos por workflow e por SO.
