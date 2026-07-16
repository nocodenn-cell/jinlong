# Auditoria de Ambientes de Produção — Autoridade Única de Configuração

**Sprint de fechamento de produção.** Objetivo: eliminar o risco de "duas autoridades de configuração" (LOCAL env vs CLOUD env) e definir **uma única estratégia oficial**.

> **Regra de segurança deste documento:** só contém **nomes de variáveis e status** — **nunca valores de secrets**. Valores vivem exclusivamente nos cofres (Vercel Env, Supabase Edge Secrets, GitHub Actions Secrets). Este arquivo é versionado.

Reconcilia (não substitui) os documentos existentes: `docs/AMBIENTES_E_RELEASE.md`, `pdv-importados/docs/SUPABASE_ENV.md`, `docs/DEPLOY_VERCEL.md`, `docs/DEPLOY_UNIFICADO.md`.

---

## 0. O que é auditável programaticamente vs. só no dashboard

| Fonte | Lido nesta auditoria | Como |
|---|---|---|
| **Repositório** | ✅ Completo | leitura direta dos arquivos versionados |
| **GitHub Actions** | ⚠️ Só **nomes** | extraídos dos workflows (`secrets.*` / `vars.*`); valores são write-only |
| **Supabase** | ⚠️ URL + Edge Functions + advisors | via MCP; **valores de secrets não são legíveis** |
| **Vercel Env Vars** | ❌ Não legível | não há API/MCP de leitura de env vars → **verificar no dashboard** |

Onde não há leitura programática, este doc fornece um **checklist de verificação** com os nomes exatos esperados.

---

## 1. Autoridade de produção (DECISÃO)

**Produção = Vercel (web) + Supabase Cloud `jinlong`.**

| Camada | Autoridade única de config | Observação |
|---|---|---|
| **Web (build + runtime)** | **Vercel Environment Variables** (Production / Preview) | `NEXT_PUBLIC_*` + server-only |
| **Edge Functions** | **Supabase Edge Secrets** (projeto alvo) | `SUPABASE_SERVICE_ROLE_KEY` vive **só aqui** |
| **CI** | **GitHub Actions Secrets/Variables** | prefixos `CI_*`, `PLAYWRIGHT_*` |
| **Desktop (pdv-local)** | **`.env` local da loja** | só `SYNC_ENDPOINT` + `SYNC_KEY`; **nunca** service_role |
| **Dev (esta sprint)** | **`.env.local` → Supabase Cloud `jinlong`** | **não** usar Supabase Docker local como fonte principal agora |

**Projeto Supabase de produção:** `jinlong` — ref **`kbabmewnahysfvlybiak`** — `https://kbabmewnahysfvlybiak.supabase.co` (sa-east-1).
**Projeto Vercel de produção:** `pdv-importados` (team `jinlong`) — domínio `pdv-importados.vercel.app`.

> ⚠️ **Risco "duas autoridades" detectado:** existe um **segundo** projeto Supabase — `ageguard` (ref `dusngyacduoihxhkqmhv`, us-west-2). Produção do **pdv-importados NÃO deve apontar para `ageguard`**. Confirmar que todo `*_SUPABASE_URL` de produção resolve para `kbabmewnahysfvlybiak`.

---

## 2. Matriz de variáveis (nomes + status; sem valores)

Legenda: ✅ correto · ⚠️ duplicado/atenção · ❌ incorreto · 🗑️ remover (órfão)

| Variável | Escopo/uso no código | Local (`.env.local`) | Vercel | Supabase Edge | GitHub Actions | Status |
|----------|----------------------|:---:|:---:|:---:|:---:|:---:|
| `NEXT_PUBLIC_SUPABASE_URL` | client (browser) | ✅ (→ jinlong) | ✅ Prod+Preview | — | `CI_NEXT_PUBLIC_SUPABASE_URL` | ✅ verificar valor = kbabmewnahysfvlybiak |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client (browser) | ✅ | ✅ Prod+Preview | — | `CI_NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ |
| `SUPABASE_URL` | server / Edge / scripts | opcional | (server) | ✅ Edge secret | — | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | server / Edge **only** | não (nunca no client) | server-only | ✅ Edge secret | `PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY` (CI) | ✅ nunca `NEXT_PUBLIC_`, nunca em pdv-local |
| `DATABASE_URL` | migrations / scripts | ✅ (CLI) | — | — | (CLI via `SUPABASE_ACCESS_TOKEN`) | ✅ |
| `SYNC_ENDPOINT` | web + desktop → Edge | ✅ | ✅ | — (é a URL da Edge) | `SYNC_ENDPOINT` | ✅ |
| `SYNC_KEY` | web + desktop ↔ Edge | ✅ (desktop) | ✅ | ✅ Edge secret (deve casar) | `SYNC_KEY` | ✅ mesmo valor nos dois lados |
| `FISCAL_WORKER_KEY` | web → fiscal-worker | opcional | ✅ | ✅ Edge secret (fiscal-worker) | `FISCAL_WORKER_KEY` | ✅ |
| `FISCAL_WORKER_URL` | endpoint fiscal | opcional | ✅ | — | `FISCAL_WORKER_URL` | ✅ |
| `SENTRY_DSN` / `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | observabilidade / build | opcional | ✅ (build) | — | `SENTRY_*` | ✅ opcional |
| `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | deploy CI→Vercel | — | — | — | ✅ (secrets) | ✅ + var `EXPECTED_VERCEL_PROJECT_ID` (fail-fast) |
| `SUPABASE_ACCESS_TOKEN` / `SUPABASE_MIGRATION_CHECK_PROJECT_REF` | CLI/migrations CI | — | — | — | ✅ (secrets) | ✅ |
| `PLAYWRIGHT_*` / `RLS_SMOKE_JWT_*` | e2e / RLS smoke (CI) | — | — | — | ✅ (secrets) | ✅ CI-only |
| **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** | **0 usos no código** | — | ? | — | — | 🗑️ nomenclatura nova não adotada; se existir em algum cofre, **remover** |
| **`SB_SERVICE_ROLE`** | **0 usos** | — | ? | ? | — | 🗑️ nome alternativo órfão — usar `SUPABASE_SERVICE_ROLE_KEY` |
| **`SYNC_OUTBOX_SECRET`** | **0 usos** | — | ? | ? | — | 🗑️ órfão — o mecanismo real é `SYNC_KEY` |
| **`SYNC_GATE_SECRET`** | **0 usos** | — | ? | ? | — | 🗑️ órfão — não existe no código |

> Os quatro nomes marcados 🗑️ **não existem no repositório** (0 referências). Se aparecerem em Vercel/Supabase/GitHub, são **órfãos a remover** (ação de dashboard — requer confirmação).

---

## 3. Higiene do repositório (auditado e OK)

- **Arquivos de env versionados:** apenas `*.example` + `pdv-importados/.env.test`.
  - `.env.example`, `pdv-importados/.env.example`, `pdv-importados/.env.production.example`, `pdv-local/.env.example` → **placeholders** ✅
  - `pdv-importados/.env.test` → valores **fictícios** (`example.supabase.co` + JWT anon de exemplo público), documentado como mock-only de teste ✅
- **`.gitignore`:** ignora `**/.env`, `**/.env.local`, `**/.env.*.local`, `.env.sentry-build-plugin`; exceção só para `**/.env.example` ✅
- **Nenhuma secret real versionada:** `git grep eyJhbGci` fora de `*.example`/`*.test` → **vazio**; as menções a `service_role`/`eyJ...` em `pdv-importados/docs/SUPABASE_ENV.md` são **instruções**, não valores ✅
- **`.env.local` em disco:** ausente (não vaza) ✅
- Guard de CI: `gitleaks` (workflow `secret-scan.yml`) roda no range da PR.

**Nenhuma correção de repositório necessária** — a higiene já está correta. As correções restantes (§4) são **de dashboard** (Vercel/Supabase/GitHub) e requerem confirmação humana.

---

## 4. Correções pendentes (dashboard — requerem confirmação humana)

Não aplicadas automaticamente: deletar env var de produção é irreversível e pode derrubar o deploy. Fazer manualmente após confirmar:

1. **Remover órfãos** (se existirem): `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SB_SERVICE_ROLE`, `SYNC_OUTBOX_SECRET`, `SYNC_GATE_SECRET` em qualquer cofre.
2. **Confirmar apontamento único:** todo `*_SUPABASE_URL` de produção = `kbabmewnahysfvlybiak` (nunca `ageguard`/`dusngyacduoihxhkqmhv`).
3. **`SUPABASE_SERVICE_ROLE_KEY`** presente **só** em: Vercel (server-only, sem `NEXT_PUBLIC_`) e Supabase Edge Secrets. **Ausente** em pdv-local e em qualquer `NEXT_PUBLIC_*`.
4. **`SYNC_KEY`** idêntico entre Vercel/desktop e o Edge Secret de `sync-outbox` do projeto alvo.
5. **Preview vs Production (Vercel):** confirmar que Preview não aponta para um Supabase diferente do de Production (a menos que seja um projeto de staging **intencional**).

---

## 5. Estado de produção (confirmado nesta auditoria)

**Produção está usando:**

- **Vercel:** projeto `pdv-importados` (team `jinlong`) · domínio `pdv-importados.vercel.app` · branch `main` · Node 24.x. Env vars: **verificar no dashboard** (não legível por API).
- **Supabase:** projeto `jinlong` — ref `kbabmewnahysfvlybiak` (`https://kbabmewnahysfvlybiak.supabase.co`, sa-east-1). Edge Functions ativas: **`sync-outbox`** (v68), **`validar-gerente`** (v43, verify_jwt), **`fiscal-worker`** (v35).
- **GitHub:** Actions Secrets/Variables conforme §2 (nomes extraídos dos workflows; valores verificar no dashboard).

---

## 6. Checklist final

- [ ] **Vercel Production validado** — env vars conferidas no dashboard; `NEXT_PUBLIC_SUPABASE_URL` = `kbabmewnahysfvlybiak`; sem órfãos
- [ ] **Supabase secrets validados** — Edge Secrets de `sync-outbox`/`fiscal-worker` no projeto `jinlong`; `service_role` só no Edge
- [ ] **GitHub Actions validado** — `CI_*`, `VERCEL_*`, `SENTRY_*`, `SYNC_*`, `PLAYWRIGHT_*`, `SUPABASE_ACCESS_TOKEN` presentes; `EXPECTED_VERCEL_PROJECT_ID` = `VERCEL_PROJECT_ID`
- [ ] **`.env.local` alinhado** — aponta para `jinlong` Cloud (não Docker local)
- [x] **`.env.example` limpo** — só placeholders (auditado)
- [ ] **Nenhuma secret duplicada** — órfãos §4.1 removidos dos cofres
- [x] **Nenhuma secret exposta no Git** — auditado (só `.example` + `.env.test` fictício)

**Critério de sucesso:** após os itens de dashboard, existe **uma única autoridade de configuração por camada** (Vercel / Supabase Edge / GitHub Actions / `.env` desktop), com produção ancorada em `jinlong` (`kbabmewnahysfvlybiak`).
