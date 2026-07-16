# Auditoria de Ambientes de Produção — Autoridade Única de Configuração

**Sprint de fechamento de produção.** Objetivo: eliminar o risco de "duas autoridades de configuração" (LOCAL env vs CLOUD env) e definir **uma única estratégia oficial**.

> **Regra de segurança deste documento:** só contém **nomes de variáveis e status** — **nunca valores de secrets**. Valores vivem exclusivamente nos cofres (Vercel Env, Supabase Edge/Custom Secrets, GitHub Actions Secrets). Este arquivo é versionado.

> **Modo desta auditoria:** **somente documentação e leitura.** Nenhuma mutação foi (ou deve ser) aplicada em Vercel, Supabase Dashboard ou GitHub Secrets. Toda alteração de cofre está listada como **proposta** na §7 e requer confirmação humana.

Reconcilia (não substitui) os documentos existentes: `docs/AMBIENTES_E_RELEASE.md`, `pdv-importados/docs/SUPABASE_ENV.md`, `docs/DEPLOY_VERCEL.md`, `docs/DEPLOY_UNIFICADO.md`.

---

## 0. O que é auditável programaticamente vs. só no dashboard

| Fonte | Lido nesta auditoria | Como |
|---|---|---|
| **Repositório** (código, `.env.example`, workflows) | ✅ Completo | leitura direta dos arquivos versionados |
| **GitHub Actions** | ⚠️ Só **nomes** | extraídos dos workflows (`secrets.*` / `vars.*`); valores são write-only |
| **Supabase** | ⚠️ URL + Edge Functions + advisors | via MCP; **valores de secrets não são legíveis** |
| **Vercel Env Vars** | ❌ Não legível | não há API/MCP de leitura de env vars → **verificar no dashboard** |

Legenda de células das matrizes: `✅` presente/esperado · `—` não se aplica · `?` existe só no cofre (dashboard) e **não é legível programaticamente** → verificar manualmente.

---

## 1. Autoridade de produção (DECISÃO)

**Produção = Vercel (web) + Supabase Cloud `jinlong`.**

| Camada | Autoridade única de config | Observação |
|---|---|---|
| **Web (build + runtime)** | **Vercel Environment Variables** (Production / Preview) | `NEXT_PUBLIC_*` + server-only |
| **Edge Functions** | **Supabase Edge Secrets + Custom Secrets** (projeto alvo) | `SUPABASE_SERVICE_ROLE_KEY` vive **só aqui** (auto-injetado) |
| **CI** | **GitHub Actions Secrets/Variables** | prefixos `CI_*`, `PLAYWRIGHT_*`, `VERCEL_*` |
| **Desktop (pdv-local)** | **`.env` local da loja** | só `SYNC_ENDPOINT` + `SYNC_KEY`; **nunca** service_role |
| **Dev (esta sprint)** | **`.env.local` → Supabase Cloud `jinlong`** | **não** usar Supabase Docker local como fonte principal agora |

**Projeto Supabase de produção:** `jinlong` — ref **`kbabmewnahysfvlybiak`** — `https://kbabmewnahysfvlybiak.supabase.co` (sa-east-1). Detalhes na §2.
**Projeto Vercel de produção:** `pdv-importados` (team `jinlong`) — domínio `pdv-importados.vercel.app`.

---

## 2. Supabase Project Authority

Seção dedicada ao risco central de "duas autoridades": existem **dois** projetos Supabase na conta.

| Papel | Projeto | Ref | URL | Região | Status (confirmado via MCP) |
|---|---|---|---|---|---|
| **PRODUÇÃO (oficial)** | `jinlong` | `kbabmewnahysfvlybiak` | `https://kbabmewnahysfvlybiak.supabase.co` | sa-east-1 | **ACTIVE_HEALTHY** · Postgres 17.6 |
| **SECUNDÁRIO** | `ageguard` | `dusngyacduoihxhkqmhv` | `https://dusngyacduoihxhkqmhv.supabase.co` | us-west-2 | **INACTIVE** (mesma org) |

> ✅ **Atualização (reconciliação com nuvem):** `ageguard` está **INACTIVE** — não serve tráfego. O risco de "segunda autoridade" é **latente, não ativo**. Ambos os projetos estão na mesma organização (`cmgixawhsltzcudyeukz`).

**Edge Functions ativas no projeto de produção (`jinlong`):** `sync-outbox` (v68), `validar-gerente` (v43, `verify_jwt`), `fiscal-worker` (v35).

### 2.1 Quais variáveis apontam para cada projeto

Toda variável que carrega uma **URL** ou **key** do Supabase deve resolver para **`kbabmewnahysfvlybiak`** em produção:

| Variável | Deve apontar para | Onde vive |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `kbabmewnahysfvlybiak` | Vercel (Prod/Preview), GH `CI_*`, `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | key do `kbabmewnahysfvlybiak` | Vercel (Prod/Preview), GH `CI_*`, `.env.local` |
| `SUPABASE_URL` (Edge, auto) | `kbabmewnahysfvlybiak` | injetado pela plataforma no projeto `jinlong` |
| `SUPABASE_SERVICE_ROLE_KEY` (Edge, auto) | key do `kbabmewnahysfvlybiak` | injetado pela plataforma no projeto `jinlong` |
| `DATABASE_URL` / `SUPABASE_MIGRATION_CHECK_PROJECT_REF` | `kbabmewnahysfvlybiak` | CLI local / GH Actions |

### 2.2 Riscos de divergência

1. **Preview apontando para projeto diferente de Production.** Se as env vars de Preview na Vercel resolverem para `ageguard` (ou outro), o app de preview e o de produção passam a ter **duas fontes de dados** → comportamento divergente e risco de escrever em base errada. **Verificar no dashboard.**
2. **`ageguard` recebendo tráfego de produção do pdv-importados.** O pdv-importados **não deve** apontar para `ageguard` em nenhuma camada de produção. `ageguard` só é aceitável como projeto de outro produto/staging **intencional**.
3. **Edge Function no projeto errado.** Deploy de `sync-outbox`/`fiscal-worker`/`validar-gerente` deve ocorrer **apenas** em `kbabmewnahysfvlybiak`. Um deploy acidental em `ageguard` cria uma segunda autoridade silenciosa.
4. **`DATABASE_URL` / migrations divergentes.** Migrations aplicadas via CLI devem usar o ref `kbabmewnahysfvlybiak`; conferir `SUPABASE_MIGRATION_CHECK_PROJECT_REF` no CI.

**Regra de ouro:** um único ref de produção (`kbabmewnahysfvlybiak`) em **todas** as camadas. Qualquer aparição de `dusngyacduoihxhkqmhv` num caminho de produção do pdv-importados é uma divergência a corrigir.

---

## 3. Matriz LOCAL vs CLOUD (nomes + status; sem valores)

Colunas de ambiente exigidas: **Vercel Production**, **Vercel Preview**, **GitHub Actions**, **Supabase Edge Secrets** (auto-injetados pela plataforma), **Supabase Custom Secrets** (definidos via `supabase secrets set`), **`.env.local`** (dev), **`.env.example`** (placeholder versionado) e **documentação existente**.

> `Edge Secrets` = variáveis **auto-injetadas** em toda Edge Function (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`). `Custom Secrets` = variáveis **definidas manualmente** que as funções leem via `Deno.env.get(...)`.

### 3.1 Web / cliente e servidor (autoridade: Vercel)

| Variável | Vercel Prod | Vercel Preview | GitHub Actions | Edge Secrets | Custom Secrets | `.env.local` | `.env.example` | Docs |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | `CI_NEXT_PUBLIC_SUPABASE_URL` | — | — | ✅ | ✅ | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | `CI_NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | — | ✅ | ✅ | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ (server-only) | ✅ (server-only) | `PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY` | ✅ (auto) | — | ✅ (dev) | ✅ | ✅ |
| `SUPABASE_URL` (server/Edge) | ? | ? | — | ✅ (auto) | — | opcional | — | ✅ |
| `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_DEFAULT_LANG` / `NEXT_PUBLIC_IDLE_LOGOUT_MINUTES` / `NEXT_PUBLIC_DEBUG_MODE` (não-secret) | ✅ | ✅ | — | — | — | opcional | ✅ | ✅ |
| `USE_UNIFIED_SALES_FLOW` / `STRICT_MANAGER_DISCOUNT_AUTH` (flags) | ✅ | ✅ | — | — | ✅ (Edge lê) | opcional | ✅ | ✅ |

### 3.2 Sync + Fiscal (web ↔ Edge ↔ desktop)

| Variável | Vercel Prod | Vercel Preview | GitHub Actions | Edge Secrets | Custom Secrets | `.env.local` | `.env.example` | Docs |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `SYNC_ENDPOINT` | ✅ | ✅ | `SYNC_ENDPOINT` | — (é a URL da Edge) | — | ✅ | ✅ (pdv-local) | ✅ |
| `SYNC_KEY` | ✅ | ✅ | `SYNC_KEY` | — | ✅ (deve casar) | ✅ (desktop) | ✅ (pdv-local) | ✅ |
| `FISCAL_WORKER_ENDPOINT` | ✅ | ? | — | — | — | opcional | ✅ | ✅ |
| `FISCAL_WORKER_KEY` | ✅ | ? | `FISCAL_WORKER_KEY` | — | ✅ (fiscal-worker) | opcional | ✅ | ✅ |
| `FISCAL_WORKER_URL` | — | — | `FISCAL_WORKER_URL` (cron) | — | — | — | — | ✅ |
| `FISCAL_PROVIDER_TYPE` / `_URL` / `_TOKEN` / `_TIMEOUT_MS` / `FISCAL_DEFAULT_DOC_TYPE` / `FISCAL_FOCUS_REF_FIELD` / `AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE` | ? | ? | — | — | ✅ (Edge lê) | opcional | ✅ (raiz) | ✅ |

### 3.3 Observabilidade

| Variável | Vercel Prod | Vercel Preview | GitHub Actions | Edge Secrets | Custom Secrets | `.env.local` | `.env.example` | Docs |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `SENTRY_DSN` | ✅ (build) | ? | `SENTRY_DSN` | — | ✅ (Edge lê) | opcional | — | ✅ |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | ✅ (build) | ? | `SENTRY_*` | — | — | opcional | — | ✅ |

### 3.4 CI-only (autoridade: GitHub Actions)

| Variável | Vercel Prod | Vercel Preview | GitHub Actions | Edge Secrets | Custom Secrets | `.env.local` | `.env.example` | Docs |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | — | — | ✅ (secrets) | — | — | — | — | ✅ |
| `EXPECTED_VERCEL_PROJECT_ID` | — | — | ✅ (var — fail-fast = `VERCEL_PROJECT_ID`) | — | — | — | — | ✅ |
| `SUPABASE_ACCESS_TOKEN` / `SUPABASE_MIGRATION_CHECK_PROJECT_REF` | — | — | ✅ (secrets) | — | — | — | — | ✅ |
| `PLAYWRIGHT_*` / `RLS_SMOKE_JWT_*` | — | — | ✅ (secrets) | — | — | — | — | ✅ |
| `ENABLE_PLAYWRIGHT_E2E` | — | — | ✅ (var) | — | — | — | — | ✅ |

### 3.5 Migrations / CLI

| Variável | Vercel Prod | Vercel Preview | GitHub Actions | Edge Secrets | Custom Secrets | `.env.local` | `.env.example` | Docs |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `DATABASE_URL` | — | — | (via `SUPABASE_ACCESS_TOKEN`) | — | — | ✅ (CLI) | — | ✅ |

### 3.6 Custom Secrets adicionais lidos pelas Edge Functions (só CLOUD)

Lidos via `Deno.env.get(...)` nas funções `sync-outbox` / `validar-gerente` / `fiscal-worker`, sem contraparte no cliente. Vivem **só** como Supabase Custom Secrets do projeto `jinlong`:

`SYNC_ALLOWED_DEVICE_FINGERPRINTS`, `SYNC_DEVICE_KEYS`, `SYNC_ENFORCE_DEVICE_ALLOWLIST`, `SYNC_OUTBOX_EXPOSE_INTERNAL_ERRORS`, `VALIDAR_GERENTE_ALLOWED_ORIGINS`, `VALIDAR_GERENTE_CORS_STRICT`, `DEFAULT_PDV_LOJA_ID`.

Status: ✅ opcionais/de tuning; nenhuma tem contraparte de cliente. Verificar presença no dashboard só se o comportamento correspondente precisar ser ativado.

---

## 4. Variáveis sem uso no código (NÃO remover — classificar)

Conforme instrução da sprint: variável sem uso **não é removida automaticamente**. É classificada em uma de duas trilhas até confirmação humana:

- **Confirmar uso externo** — pode ser lida por algo fora do repositório (webhook, integração, cron manual, ferramenta de infra). Só descartar após confirmar que ninguém a consome.
- **Candidata a limpeza** — sem nenhum uso conhecido, dentro ou fora do código; forte candidata a remoção **após** confirmação.

| Variável | Refs no repo | Classificação | Racional |
|---|:---:|---|---|
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 0 | **Candidata a limpeza** | Nomenclatura nova da Supabase (publishable/secret keys) **não adotada** neste código; o cliente usa `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Se aparecer num cofre, confirmar que nenhum client novo depende dela antes de limpar. |
| `SB_SERVICE_ROLE` | 0 | **Candidata a limpeza** | Nome alternativo de `SUPABASE_SERVICE_ROLE_KEY`; nenhum código lê `SB_SERVICE_ROLE`. Candidata a limpeza — o oficial é `SUPABASE_SERVICE_ROLE_KEY`. |
| `SYNC_OUTBOX_SECRET` | 0 | **Confirmar uso externo** | Nome sugere segredo do `sync-outbox`, mas a função real usa `SYNC_KEY`. Confirmar que nenhum cliente/desktop antigo ainda envia com esse nome antes de tratar como candidata a limpeza. |
| `SYNC_GATE_SECRET` | 0 | **Candidata a limpeza** | Não existe no código nem nos workflows; nenhum mecanismo de "gate" correspondente. Candidata a limpeza após confirmação. |

> Os quatro nomes têm **0 referências** em todo o repositório (código, workflows, scripts, examples) — só aparecem nesta auditoria. Nenhuma ação de remoção foi aplicada.

---

## 5. Higiene do repositório (auditado e OK)

- **Arquivos de env versionados:** apenas `*.example` + `pdv-importados/.env.test`.
  - `.env.example`, `pdv-importados/.env.example`, `pdv-importados/.env.production.example`, `pdv-local/.env.example` → **placeholders** ✅
  - `pdv-importados/.env.test` → valores **fictícios** (`example.supabase.co` + JWT anon de exemplo público), documentado como mock-only de teste ✅
- **`.gitignore`:** ignora `**/.env`, `**/.env.local`, `**/.env.*.local`, `.env.sentry-build-plugin`; exceção só para `**/.env.example` ✅
- **Nenhuma secret real versionada:** busca por prefixo de JWT fora de `*.example`/`*.test` → **vazio**; as menções a `service_role`/JWT em `pdv-importados/docs/SUPABASE_ENV.md` são **instruções**, não valores ✅
- **`.env.local` em disco:** ausente (não vaza) ✅
- Guard de CI: `gitleaks` (workflow `secret-scan.yml`) roda no range da PR.

**Nenhuma correção de repositório necessária** — a higiene já está correta. As mudanças propostas restantes (§7) são **de dashboard** (Vercel/Supabase/GitHub) e requerem confirmação humana.

---

## 6. Estado de produção (confirmado nesta auditoria)

**Produção está usando:**

- **Vercel:** projeto `pdv-importados` (team `jinlong`) · branch `main` · Node 24.x. **Deploy de produção atual = commit `8deb540` (#193), estado READY** (confirmado via MCP), igual ao HEAD de `main` (sem drift repo↔prod); rollback candidate `c41f241` (#190) disponível. Env vars: **verificar no dashboard** (não legível por API).
- **Advisors Supabase (jinlong):** segurança 114 (0 ERROR; 33 funções `SECURITY DEFINER` executáveis por `anon` a revisar; leaked-password-protection desligado; 2 RLS-sem-policy); performance 266 (0 ERROR; otimização, não bloqueante). Ver `RISK_REGISTER.md` R8–R10, R14.
- **Migrations (jinlong):** 18 rastreadas no ledger; repo tem migrations ausentes em produção (248, 250–253, 256). Ver `DEPLOY_ORDER.md` Passo 1.
- **Supabase:** projeto `jinlong` — ref `kbabmewnahysfvlybiak` (`https://kbabmewnahysfvlybiak.supabase.co`, sa-east-1). Edge Functions ativas: **`sync-outbox`** (v68), **`validar-gerente`** (v43, verify_jwt), **`fiscal-worker`** (v35).
- **GitHub:** Actions Secrets/Variables conforme §3.4 (nomes extraídos dos workflows; valores verificar no dashboard).

---

## 7. Lista de mudanças propostas (NÃO aplicadas — requerem confirmação humana)

**Nenhuma destas foi executada.** Deletar/renomear env var de produção é irreversível e pode derrubar o deploy. Aplicar manualmente, uma a uma, após confirmação.

| # | Mudança proposta | Cofre | Tipo | Pré-condição |
|---|---|---|---|---|
| P1 | Confirmar existência e decidir sobre `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel/Supabase/GH | Candidata a limpeza | Confirmar que nenhum client novo a usa |
| P2 | Confirmar existência e decidir sobre `SB_SERVICE_ROLE` | Vercel/Supabase | Candidata a limpeza | Migrar consumidores para `SUPABASE_SERVICE_ROLE_KEY` |
| P3 | Confirmar existência e decidir sobre `SYNC_OUTBOX_SECRET` | Supabase/Vercel | Confirmar uso externo | Confirmar que nenhum cliente/desktop antigo envia com esse nome |
| P4 | Confirmar existência e decidir sobre `SYNC_GATE_SECRET` | qualquer | Candidata a limpeza | — |
| P5 | Confirmar que todo `*_SUPABASE_URL` de **Production** = `kbabmewnahysfvlybiak` | Vercel | Verificação | — |
| P6 | Confirmar que **Preview** não aponta para projeto Supabase diferente do de Production (a menos que staging intencional) | Vercel | Verificação | Definir se há staging intencional |
| P7 | Confirmar `SUPABASE_SERVICE_ROLE_KEY` presente **só** em Vercel (server-only) e Supabase Edge (auto); **ausente** em pdv-local e em qualquer `NEXT_PUBLIC_*` | Vercel/Supabase | Verificação | — |
| P8 | Confirmar `SYNC_KEY` idêntico entre Vercel/desktop e o Custom Secret de `sync-outbox` no `jinlong` | Vercel/Supabase | Verificação | — |
| P9 | Confirmar que nenhuma Edge Function (`sync-outbox`/`fiscal-worker`/`validar-gerente`) está deployada em `ageguard` | Supabase | Verificação | — |

---

## 8. Checklist final

- [ ] **Vercel Production validado** — env vars conferidas no dashboard; `NEXT_PUBLIC_SUPABASE_URL` = `kbabmewnahysfvlybiak`; sem órfãos
- [ ] **Vercel Preview validado** — mesmo projeto Supabase de Production (ou staging intencional documentado)
- [ ] **Supabase secrets validados** — Edge/Custom Secrets de `sync-outbox`/`fiscal-worker`/`validar-gerente` no projeto `jinlong`; `service_role` só no Edge (auto)
- [ ] **Supabase Project Authority confirmada** — nenhuma Edge Function nem `*_SUPABASE_URL` de produção aponta para `ageguard`
- [ ] **GitHub Actions validado** — `CI_*`, `VERCEL_*`, `SENTRY_*`, `SYNC_*`, `PLAYWRIGHT_*`, `SUPABASE_ACCESS_TOKEN` presentes; `EXPECTED_VERCEL_PROJECT_ID` = `VERCEL_PROJECT_ID`
- [ ] **`.env.local` alinhado** — aponta para `jinlong` Cloud (não Docker local)
- [x] **`.env.example` limpo** — só placeholders (auditado)
- [ ] **Órfãos classificados e decididos** — P1–P4 confirmados antes de qualquer remoção
- [x] **Nenhuma secret exposta no Git** — auditado (só `.example` + `.env.test` fictício)

**Critério de sucesso:** após os itens de dashboard, existe **uma única autoridade de configuração por camada** (Vercel / Supabase Edge+Custom / GitHub Actions / `.env` desktop), com produção ancorada em `jinlong` (`kbabmewnahysfvlybiak`) e **zero** caminhos de produção resolvendo para `ageguard`.
