# Go-Live — Bloqueadores e pendências reais

**Data:** 2026-07-25 · **Escopo:** exclusivamente pendências **abertas**. Itens resolvidos não aparecem aqui.
**Canônico da frente CI/CD:** [`docs/CICD_FINAL_STATE.md`](./CICD_FINAL_STATE.md)

Legenda de classe: **INFRA** (infraestrutura/conta) · **OPS** (operação/console) · **GOV** (governança) · **DEV** (código)

---

## 1. Bloqueadores de Go-Live

| # | Classe | Pendência | Bloqueia Go-Live | Bloqueia dev | Responsável | Onde se resolve |
|---|---|---|:---:|:---:|---|---|
| ~~**B-1**~~ | INFRA | ~~Runners do GitHub Actions indisponíveis~~ — **RESOLVIDO em 2026-07-31.** GitHub Pro ativado (pagamento aprovado) + budget de Actions confirmado em US$ 10,00/mês com "Stop usage: No". Validado por reexecução de workflow: runner alocado normalmente (`runner_id` preenchido, steps executando) no PR #255, run [30649321448](https://github.com/nocodenn-cell/fastproduct/actions/runs/30649321448) | ~~**Sim**~~ | **Não**¹ | Admin da conta GitHub | — |
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
| ~~**D-1**~~ | DEV | ~~Overload `fiscal_reprocessar_documento(uuid, text)` sem verificação de perfil~~ — **RESOLVIDO em 2026-08-06.** A migration `282` já havia revogado o `GRANT` de `authenticated`; a migration **`305`** removeu a função. Confirmado antes do DROP que nenhum chamador usa a versão de 2 argumentos (todos passam só `p_documento_id`). Verificação dentro da própria migration: sobrou exatamente 1 assinatura e ela contém `FISCAL_REPROCESSO_PERFIL` | ~~**Sim**²~~ | Não | Dev | `backend/supabase/migrations/305_*.sql` |
| ~~**D-2**~~ | DEV | ~~Migration `092` (máquina de estados fiscal) não aplicada~~ — **RESOLVIDO em 2026-08-06** pela migration **`306`** (conteúdo idêntico ao da `092`, número novo para não mentir sobre a ordem real de aplicação). Colunas `ultima_transicao_em`/`transicao_origem` e triggers `tr_documentos_fiscais_estado_bi/bu` ativos. Prova viva dentro da migration: documento levado a `EMITIDO` pelo caminho legal, transição `EMITIDO → PENDENTE` rejeitada, prova removida | ~~**Sim**²~~ | Não | Dev | `backend/supabase/migrations/306_*.sql` |
| ~~**D-3**~~ | DEV | ~~Sem *reaper* de `EM_PROCESSAMENTO`, sem limite de tentativas, sem DLQ automática~~ — **RESOLVIDO em 2026-08-06** pela migration **`307`**: `fiscal_reaper_documentos` (service_role), `fiscal_claim_documentos` ignora quem está na DLQ e `fiscal_reprocessar_documento` limpa a DLQ e zera tentativas. O reaper roda dentro do `fiscal-worker`, antes do claim — ponto único de agendamento para quando B-5 ligar o módulo. Prova viva na migration: órfão → DLQ → claim ignora → resgate manual | ~~**Sim**²~~ | Não | Dev | `backend/supabase/migrations/307_*.sql` |
| **D-6** | GOV | **Produção à frente do repositório: 14 migrations (`289`–`304`, ~178 KB de DDL) aplicadas em 05–06/08 que não existem em nenhum dos 272 refs do Git.** Um rebuild a partir do repositório **passa** e entrega o schema errado, sem falhar. Nenhuma passou por PR, CI ou guard. Diagnóstico completo em [`AUDITORIA_DRIFT_MIGRATIONS_20260806.md`](./AUDITORIA_DRIFT_MIGRATIONS_20260806.md) §2.1 | **Sim** | Não | Owner do repositório | Localizar o autor (janela 05/08 15:18 → 06/08 09:05 UTC em `schema_migrations`) e publicar o branch |
| **D-7** | GOV | **Reconstrução do banco quebrada por 3 dependências fora de ordem, todas com a mesma raiz** (`248_devolver_ou_trocar_venda.sql`). Derruba os gates `Supabase local RLS smoke` e `Test RLS scope by profile`. **Resolução já existe pronta:** o commit `ec6f966c` (branch `origin/chore/node22-alignment`) traz os 4 renames, byte-idênticos. Simulação comprova que eles zeram as quebras (5 ocorrências → 0). ⚠️ **Cherry-pick, não merge** — o branch inteiro são 103 arquivos, dos quais 81 de código (refactor das Ondas 0/A/B). Detalhe em [`AUDITORIA_DRIFT_MIGRATIONS_20260806.md`](./AUDITORIA_DRIFT_MIGRATIONS_20260806.md) §3.1, §4.2 e §4.4 | Não⁴ | Não | Owner do repositório | Cherry-pick de `ec6f966c` |
| ~~**D-4**~~ | DEV | ~~`build-and-test` vermelho~~ — **RESOLVIDO em 2026-07-31.** Causa raiz real (após restauração de B-1): não era o teste antigo de 11/05, e sim `ci-pdv-importados.yml` usando `node-version: '20'` enquanto `@supabase/auth-js@2.110.5` exige `engines.node: ">=22.0.0"` — `npm ci` falhava com `EBADENGINE` antes de qualquer step de teste rodar. Corrigido via bump `'20'` → `'22'` nas 3 ocorrências do workflow (build-and-test, e2e-critical, e2e-playwright). Validado no PR #255, run [30650220924](https://github.com/nocodenn-cell/fastproduct/actions/runs/30650220924): install ✓, guard:all ✓, lint+typecheck+test ✓, build ✓ (9m15s) | ~~Não³~~ | Não | Dev | `.github/workflows/ci-pdv-importados.yml` |
| **D-5** | DEV | SSRA valida **coerência**, não **atualidade** — não detecta B-4. Evolução proposta: comparar também `deployment.meta.githubCommitSha` com o SHA liberado | Não | Não | Dev | Código (`scripts/validate-production.mjs`) |

> **Resolvido em 2026-07-25 (commit de fechamento):** o antigo **D-1** — comentário obsoleto em `scripts/deploy-gates-v2.ps1` citando o step de CI `EXPECTED_VERCEL_PROJECT_ID`, removido na Fase A — foi corrigido. Só comentários mudaram; o comportamento do script é idêntico. Com isso, **a dívida técnica originada pela remediação CI/CD é zero**: os itens DEV restantes (D-1 a D-5) são anteriores a esta frente, que apenas os descobriu.
>
> Registro permanente: `scripts/deploy-gates-v2.ps1` continua sendo um caminho de deploy **manual** (`npx vercel deploy --prod` com `-Environment prod`). Não é chamado por workflow nem por `package.json`, logo não gera deploy duplicado automático — mas é o único caminho fora do fluxo canônico da Vercel, e sua guarda de projeto é a única proteção que resta ali.

³ Não bloqueia o Go-Live por si, mas bloqueia a **aprovação de B-2**: não faz sentido tornar `build-and-test` um required check enquanto ele estiver vermelho.

⁴ Não bloqueia a abertura da primeira loja — a produção atual está íntegra. Bloqueia **disaster recovery**, a criação do ambiente de staging (P0-3) e dois gates de CI que seguem vermelhos por causa dele.

---

## 4. Resumo por classe

Situação em **2026-08-06**, após o fechamento de D-1/D-2/D-3:

| Classe | Bloqueadores | Não bloqueadores | Total |
|---|---:|---:|---:|
| **INFRA** | 0 (B-1 resolvido) | 1 (P-6) | 1 |
| **GOV** | 3 (B-2, B-3, **D-6**) | 2 (P-1, **D-7**) | 5 |
| **OPS** | 3 (B-4, B-5, B-6) | 4 (P-2…P-5) | 7 |
| **DEV** | 0 (D-1, D-2, D-3 resolvidos) | 1 (D-5) | 1 |
| **Total** | **6** | **8** | **14** |

**Não resta pendência de código no caminho crítico.** Os 6 bloqueadores restantes são
console (Vercel/Supabase), governança de repositório ou publicação de trabalho que já está
em produção mas fora do Git (D-6). B-1 impedia *validar*, não *escrever* — e já foi resolvido.

---

## 5. Caminho mínimo para Go-Live

**Núcleo PDV (sem emissão fiscal):**

```
B-4  restaurar produção        ← único que afeta o cliente agora
B-1  restaurar runners         ← RESOLVIDO 2026-07-31 (spending limit/budget Actions liberado)
D-4  corrigir build-and-test   ← RESOLVIDO 2026-07-31 (Node 20→22, PR #255)
B-2  corrigir required checks
B-3  esvaziar bypass
```

**Módulo fiscal (adicional):**

```
D-1 → D-2 → D-3 → B-6 → B-5     ← ordem obrigatória, não inverter
 ✅     ✅     ✅     ▢     ▢      D-1/D-2/D-3 fechados em 2026-08-06 (migrations 305/306/307)
```

Os três pré-requisitos de código do módulo fiscal estão cumpridos, **na ordem exigida**. O
que resta é console do Supabase: trocar `FISCAL_PROVIDER_TYPE` de `mock` para o provider real
(**B-6**) e só depois popular o Vault com `fiscal_worker_url`/`fiscal_worker_key` (**B-5**).
Inverter continua causando dano irreversível — documento emitido com chave `NFE-MOCK-…`.

> Ao ligar B-5, reagendar o `pg_cron` do worker (desagendado pela migration `285`). O reaper
> de D-3 **não precisa de agendamento próprio**: roda dentro do `fiscal-worker`, antes do
> claim. Janela e teto por env: `FISCAL_REAPER_TIMEOUT_MINUTOS` (default 15) e
> `FISCAL_REAPER_MAX_TENTATIVAS` (default 5).
