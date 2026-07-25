# Go-Live — Bloqueadores e pendências reais

**Data:** 2026-07-25 · **Escopo:** exclusivamente pendências **abertas**. Itens resolvidos não aparecem aqui.
**Canônico da frente CI/CD:** [`docs/CICD_FINAL_STATE.md`](./CICD_FINAL_STATE.md)

Legenda de classe: **INFRA** (infraestrutura/conta) · **OPS** (operação/console) · **GOV** (governança) · **DEV** (código)

---

## 1. Bloqueadores de Go-Live

| # | Classe | Pendência | Bloqueia Go-Live | Bloqueia dev | Responsável | Onde se resolve |
|---|---|---|:---:|:---:|---|---|
| **B-1** | INFRA | **Runners do GitHub Actions indisponíveis.** `runner_id: 0` e `runner_name` vazio em 100% dos jobs, sem log baixável, desde ~2026-05-11. Esgotamento de billing/spending limit | **Sim** | **Não**¹ | Admin da conta GitHub | GitHub → Settings → Billing → Actions |
| **B-2** | GOV | **Required Status Checks inexistentes.** `main` exige `build`, `lint`, `test`, `typecheck` — nenhum é publicado por nada, e nunca foi (0 commits em toda a história dos workflows). Merge só ocorre por bypass de owner | **Sim** | **Não** | Owner do repositório | GitHub → Settings → Branches (ou Rules → Rulesets) |
| **B-3** | GOV | **Bypass list ativa.** Enquanto existir, qualquer regra de proteção é decorativa. Comprovado no PR #232, mergeado com todos os checks vermelhos | **Sim** | **Não** | Owner do repositório | GitHub → Settings → Branches |
| **B-4** | OPS | **Produção defasada.** `pdv-importados.vercel.app` serve `dpl_7DPHmhdzLHNSsd1mXV59tPzfA9aU` (`a4edafbf`, 23/07). `main` está à frente; BL-1 (#231, #232) não está no ar e o schema (migrations 272–276) está à frente do código | **Sim** | **Não** | Admin da Vercel | Vercel → Project → Deployments / Domains |
| **B-5** | OPS | **Worker fiscal inativo.** Vault sem `fiscal_worker_url` e `fiscal_worker_key`: `vault.secrets = 0`, `net._http_response = 0`, 120 execuções do `pg_cron` em 2h sem uma única requisição HTTP | **Sim**² | **Não** | Admin do Supabase | Supabase → SQL (`vault.create_secret`) |
| **B-6** | OPS | **`FISCAL_PROVIDER_TYPE` em `mock`.** Ativar B-5 antes disto faz o worker marcar documentos como `EMITIDO` com chaves falsas `NFE-MOCK-…` | **Sim**² | **Não** | Admin do Supabase | Supabase → Edge Functions → Secrets |

¹ Não bloqueia escrever código, mas bloqueia **validar** qualquer coisa em runtime.
² Bloqueia o Go-Live **do módulo fiscal**. O núcleo PDV pode operar sem emissão fiscal, se essa for a decisão de produto.

> **Ordem obrigatória do fiscal:** D-1 → D-2 → D-3 → B-6 → B-5. Inverter causa dano irreversível (documento fiscal emitido com chave inválida).

> **Nota de fechamento (2026-07-25) — merge dos PRs #233 (BL-2) e #234 (CI/CD):** ambos mergeados em `main` via `rebase merge` (25 commits preservados individualmente, auditoria de checksum confirmando zero divergência de migrations/workflows/docs canônicos em relação ao histórico pré-split). **B-1 permanece ativo, sem qualquer evidência de regressão causada por este merge** — os checks falharam no mesmo padrão (`runner_id: 0`, 2-4s, sem log) antes e depois, em ambos os PRs. Confirmação de aplicação da migration 276 em staging (ressalva pendente da auditoria de separação) registrada em `docs/BL2_RELATORIO_STAGING.md` (Adendo).

---

## 2. Pendências que **não** bloqueiam Go-Live

| # | Classe | Pendência | Bloqueia Go-Live | Bloqueia dev | Responsável | Onde se resolve |
|---|---|---|:---:|:---:|---|---|
| **P-1** | GOV | **Colisão de nome `build-and-test`** — publicado por `ci-pdv-importados.yml` e `ci-pdv-local.yml`. Confirmado no PR #233 (check-runs `89688963701` e `89688963768`). Torna o context ambíguo se virar required check | Não | Não | Owner + dev | Código (`.github/workflows/`) após decisão de B-2 |
| **P-2** | OPS | Env vars do Sentry (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`) não confirmadas na Vercel. Sem elas não há upload de sourcemaps — condição **pré-existente**, não causada pela remoção do job `deploy` | Não | Não | Admin da Vercel | Vercel → Project → Environment Variables |
| **P-3** | OPS | Quatro aliases de produção sem Production Domain canônico declarado | Não | Não | Admin da Vercel | Vercel → Project → Domains |
| **P-4** | OPS | Label `run-tauri` não existe (escape hatch do `rust-tauri-checks`) | Não | Não | Owner do repositório | GitHub → Issues → Labels |
| **P-5** | OPS | Variable `EXPECTED_VERCEL_PROJECT_ID` obsoleta — protegia um step que não existe mais | Não | Não | Owner do repositório | GitHub → Settings → Variables |
| **P-6** | INFRA | Medir consumo real de Actions no primeiro mês após B-1 (critério: < 500 min) | Não | Não | Admin da conta GitHub | GitHub → Settings → Billing |

---

## 3. Pendências de desenvolvimento

Únicos itens desta lista que pertencem ao backlog técnico.

| # | Classe | Pendência | Bloqueia Go-Live | Bloqueia dev | Responsável | Onde se resolve |
|---|---|---|:---:|:---:|---|---|
| **D-1** | DEV | Overload `fiscal_reprocessar_documento(uuid, text)` **sem verificação de perfil**, com `GRANT EXECUTE` a `authenticated`, referenciando 5 colunas inexistentes. Hoje falha fechada (erro de parse), mas é escalada latente | **Sim**² | Não | Dev | Supabase (migration) |
| **D-2** | DEV | Migration `092` (máquina de estados fiscal) **não aplicada**: colunas `ultima_transicao_em`/`transicao_origem` e triggers `tr_documentos_fiscais_estado_bi/bu` ausentes. Sem ela, `EMITIDO → PENDENTE` é aceita — reemissão de documento autorizado | **Sim**² | Não | Dev | Supabase (migration) |
| **D-3** | DEV | Sem *reaper* de `EM_PROCESSAMENTO`, sem limite de tentativas, sem movimentação automática para DLQ. Worker que morra após o claim deixa documento órfão que nem o retry nem o reprocesso manual resgatam | **Sim**² | Não | Dev | Supabase (migration) |
| **D-4** | DEV | **`build-and-test` provavelmente vermelho** ao voltar: em 11/05, último run com runner real, falhou em *"Lint, typecheck e unit tests"*. Falha real, anterior ao apagão, nunca corrigida | Não³ | Não | Dev | Código (`pdv-importados/`) |
| **D-5** | DEV | SSRA valida **coerência**, não **atualidade** — não detecta B-4. Evolução proposta: comparar também `deployment.meta.githubCommitSha` com o SHA liberado | Não | Não | Dev | Código (`scripts/validate-production.mjs`) |

> **Resolvido em 2026-07-25 (commit de fechamento):** o antigo **D-1** — comentário obsoleto em `scripts/deploy-gates-v2.ps1` citando o step de CI `EXPECTED_VERCEL_PROJECT_ID`, removido na Fase A — foi corrigido. Só comentários mudaram; o comportamento do script é idêntico. Com isso, **a dívida técnica originada pela remediação CI/CD é zero**: os itens DEV restantes (D-1 a D-5) são anteriores a esta frente, que apenas os descobriu.
>
> Registro permanente: `scripts/deploy-gates-v2.ps1` continua sendo um caminho de deploy **manual** (`npx vercel deploy --prod` com `-Environment prod`). Não é chamado por workflow nem por `package.json`, logo não gera deploy duplicado automático — mas é o único caminho fora do fluxo canônico da Vercel, e sua guarda de projeto é a única proteção que resta ali.

³ Não bloqueia o Go-Live por si, mas bloqueia a **aprovação de B-2**: não faz sentido tornar `build-and-test` um required check enquanto ele estiver vermelho.

---

## 4. Resumo por classe

| Classe | Bloqueadores | Não bloqueadores | Total |
|---|---:|---:|---:|
| **INFRA** | 1 (B-1) | 1 (P-6) | 2 |
| **GOV** | 2 (B-2, B-3) | 1 (P-1) | 3 |
| **OPS** | 3 (B-4, B-5, B-6) | 4 (P-2…P-5) | 7 |
| **DEV** | 3 (D-1, D-2, D-3 — fiscal) | 2 (D-4, D-5) | 5 |
| **Total** | **9** | **8** | **17** |

**Nenhuma pendência bloqueia o desenvolvimento.** B-1 impede *validar*, não *escrever*.

---

## 5. Caminho mínimo para Go-Live

**Núcleo PDV (sem emissão fiscal):**

```
B-4  restaurar produção        ← único que afeta o cliente agora
B-1  restaurar runners         ← desbloqueia validação
D-4  corrigir build-and-test   ← pré-requisito de B-2
B-2  corrigir required checks
B-3  esvaziar bypass
```

**Módulo fiscal (adicional):**

```
D-1 → D-2 → D-3 → B-6 → B-5     ← ordem obrigatória, não inverter
```
