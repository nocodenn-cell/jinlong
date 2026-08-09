# Investigação Vercel — Preview em ERROR (2026-08-08)

**Projeto:** `pdv-importados` (`prj_UPGWQN4TmzDQRYm5IB80a8ZxOslO`)  
**Team:** NatureCode / `jinlong` (`team_C1mGhbvpvDlAAEm05epmTKR0`)  
**Método:** API Vercel (MCP) + config no repositório + redeploy controlado. **Sem alteração de env, desconexão de integração, migrations ou Supabase.**

---

## 1. Veredito (atualizado pós-redeploy)

| Pergunta | Resposta |
|----------|----------|
| Falha é `next build` / TypeScript? | **Não** — o build **nunca inicia** (zero eventos em `get_deployment_build_logs`). |
| Falha é commit / diff de app? | **Não** — redeploy na árvore **`826b52d2`** falhou igual (§9). |
| Classe da falha | **Pré-build:** `BUILD_FAILED` + `Resource provisioning failed` (~**632–696 ms**). |
| Conclusão A/B/C | **B** — bloqueio **fora do código** (configuração Vercel / integrações / backend do projeto). Subcausa exata da integração **não confirmada via API** (MCP não expõe installations); hipótese **Provisioning Integrations → Supabase** (§5–§6). |
| UI/UX pode retomar? | **Não** — nenhum Preview **READY** após a regressão. |

---

## 2. Configuração efetiva conhecida

### 2.1 API Vercel (`get_project`, 2026-08-08)

| Campo | Valor |
|-------|--------|
| Framework | `nextjs` |
| Node.js | **24.x** |
| `live` | `false` |
| SSO Preview | `ssoProtection.enabled: true` (`all_except_custom_domains`) |
| Região (deploy ERROR/READY recentes) | **`gru1`** nos metadados de deployment |

**Não exposto pelo MCP:** Root Directory, Install/Build Command, lista de integrações, env vars (nomes/escopos).

### 2.2 Painel (referência jul/2026 — `docs/GO_LIVE_FASE2_RELATORIO_FINAL.md`)

| Campo | Valor documentado |
|-------|-------------------|
| **Root Directory** | `pdv-importados` |
| Install | `npm ci` |
| Output | `.next` |
| Região funções | `gru1` (`pdv-importados/vercel.json`) |

### 2.3 Repositório (sem mudança em `vercel.json` entre READY e ERROR)

| Artefato | Nota |
|----------|------|
| Raiz `vercel.json` | Opção A se Root = `.`; painel documentado usa **Opção B** (`pdv-importados`) |
| `pdv-importados/vercel.json` | `"regions": ["gru1"]` |
| Diff `826b52d2` → primeiro ERROR `7d26339a` | **Zero** diff em `vercel.json` / `pdv-importados/vercel.json` |

---

## 3. Vercel ↔ Supabase (somente leitura)

### 3.1 Supabase (MCP)

| Campo | Valor |
|-------|--------|
| Projeto | prod sa-east-1 (ref redigido; MCP ACTIVE_HEALTHY) |
| Região | `sa-east-1` |
| Status | **ACTIVE_HEALTHY** |
| Branches | 1 (`main`) — **não** pausado |

### 3.2 Integrações (evidência indireta — não desconectadas)

| Camada | Evidência |
|--------|-----------|
| **GitHub** | Apps: Vercel + **Supabase**; check `Supabase Preview` (`docs/ENCERRAMENTO_CICD_GO_NOGO.md`) |
| **Vercel (relato proprietário)** | Integração **Supabase** instalada no marketplace, **produto** vinculado ao projeto |
| **Env manuais (audit jul/2026, `vercel env ls`)** | Chaves Supabase (públicas + service role + Postgres) em **Production + Preview** — mesmo DB prod (P0-3/P1-1) |

### 3.3 Conflito plausível (hipótese, não provada sem painel)

Integrações Supabase na Vercel costumam, em cada Preview:

1. **Provisionar** recurso (branch DB / credenciais) na fase **Provisioning Integrations**.
2. **Sincronizar** env (prefixos Postgres / URL / keys) para o escopo Preview.

Com **vars manuais** já definidas para Preview (audit), a fase de provisioning/sync pode falhar e surfacear **`Resource provisioning failed`** **antes** do clone — padrão [comunidade Vercel #32451](https://community.vercel.com/t/vercel-deployments-failing-with-resource-provisioning-failed-and-0ms-build-time/32451).

**Checagem pendente no painel (sem desconectar):**

- Project → **Integrations** → Supabase → produto/recurso, ambientes (**Preview** ligado?), opção “branch per preview” / sync env.
- Project → **Settings → Environment Variables** → listar **nomes + escopos**; marcar duplicatas entre vars manuais e integração (Postgres / URL).

---

## 4. Linha do tempo

| Evento | Deployment | Commit | Estado | Δ ms |
|--------|------------|--------|--------|------|
| Último **READY** | `dpl_4znhvKr7EGUMUvZacJZQZGpe6UP3` | `826b52d2` | READY | ~173 s |
| **Primeiro ERROR** (série atual) | `dpl_B2vGH9n1GNj1vZkrXb74ytD9ofBh` | `7d26339a` (docs) | ERROR | **696** |
| Exemplo UI | `dpl_F5Xpdtavyo3B42YKYZuu78UdKSZr` | `14b73bdc` | ERROR | ~689 |
| Redeploy árvore 826b52d | `dpl_FNJESiM1RcDZ42NKHVuVoEUJqsH6` | `187bfe9e` | ERROR | **632** |
| Empty commit (skip monorepo) | `dpl_CpchJmsagMrSuXjYQpGLFqhAd8pi` | `69bf2c22` | **CANCELED** | 0 — [skip unaffected](https://vercel.com/docs/monorepos#skipping-unaffected-projects) |

**Janela da regressão:** entre `createdAt` **1786065421665** (READY) e **1786132919926** (primeiro ERROR) — **~19 h**, **sem** mudança de `vercel.json` no repo.

---

## 5. Etapa da falha (inferência técnica)

| Fase pipeline Vercel | Evidência |
|---------------------|-----------|
| Webhook / criação deployment | OK — deployments aparecem na API |
| **Provisioning Integrations / recursos** | **Falha provável** — mensagem `Resource provisioning failed`, duração sub-segundo, **sem** logs de clone/install/build |
| Clone / `npm ci` / `next build` | **Não executados** em ERROR (logs vazios; contrastar READY §4) |

Alternativa secundária (menor prioridade): flags **legacy backend** pós-mudança de plano ([community #42915](https://community.vercel.com/t/hobby-project-stuck-on-resource-provisioning-failed-legacy-backend-settings/42915)). Billing Vercel Pro descartado pelo proprietário.

---

## 6. Redeploy controlado (critério pedido)

**Branch:** `cursor/vercel-redeploy-826b52d-633a`  
**Base de código:** ancestral **`826b52d2e2cf2e0f8a91bc0aae734a4060950001`** (mesmo SHA do último READY).

| Tentativa | Deployment | Resultado |
|-----------|------------|-----------|
| Empty commit | `dpl_CpchJmsagMrSuXjYQpGLFqhAd8pi` | **CANCELED** (monorepo — sem diff em `pdv-importados`) |
| Touch `pdv-importados/docs/SUPABASE_ENV.md` only | `dpl_FNJESiM1RcDZ42NKHVuVoEUJqsH6` | **ERROR** — `Resource provisioning failed`, **632 ms**, **zero build logs** |

**Diff app vs READY:** 1 arquivo doc, +2 linhas — **não** explica falha de provisioning.

**Conclusão:** problema **comprovadamente externo** à árvore de código que já buildou em `dpl_4znhvKr7`.

---

## 7. Pacote para suporte Vercel (B)

Incluir:

- **Team:** `team_C1mGhbvpvDlAAEm05epmTKR0` (jinlong) · **Project:** `prj_UPGWQN4TmzDQRYm5IB80a8ZxOslO`
- **READY de referência:** `dpl_4znhvKr7EGUMUvZacJZQZGpe6UP3` · SHA `826b52d2` · build ~2 min · logs completos
- **ERROR pós-regressão:** `dpl_B2vGH9n1GNj1vZkrXb74ytD9ofBh` (primeiro), `dpl_FNJESiM1RcDZ42NKHVuVoEUJqsH6` (redeploy árvore good)
- **Mensagem:** `errorCode: BUILD_FAILED`, `errorMessage: Resource provisioning failed`
- **Pedido:** `readyStateReason` / logs internos da fase **Provisioning Integrations**; listar integrações ativas no projeto; verificar conflito env manual × Supabase marketplace em **Preview**

Inspectors:

- https://vercel.com/jinlong/pdv-importados/4znhvKr7EGUMUvZacJZQZGpe6UP3
- https://vercel.com/jinlong/pdv-importados/FNJESiM1RcDZ42NKHVuVoEUJqsH6

---

## 8. Ações manuais recomendadas (ordem — reversíveis)

1. **Integrations → Supabase** (somente inspeção): ambientes Preview, sync env, branch provisioning; screenshot config.
2. Se Preview estiver provisionando branch/recurso e vars manuais já existem: **desabilitar provisionamento Preview na integração** ou **Preview-only env** via staging (P0-3) — **só após** evidência no painel; rollback = reverter toggle / `vercel env add`.
3. **Clear Build Cache** (último OK subiu ~696 MB cache).
4. Abrir ticket §7 se provisioning interno falhar sem causa visível.

---

## 9. O que **não** foi feito (pedido explícito)

- Desconectar/reconectar integração Supabase  
- Alterar env vars de Production/Preview  
- Migrations / `db push` / repair Supabase  
- Mudanças de UI/UX na app  

---

## 10. Estado da missão

| Critério | Status |
|----------|--------|
| Causa exata (qual integração/recurso) | **Hipótese Supabase provisioning** — confirmar no painel |
| Código / config repo | **Descartado** como causa (§6) |
| Preview READY + `/api/health` | **Bloqueado** |
| Retomar UI/UX | **Não** |

**Deployment de validação mais recente:** `dpl_FNJESiM1RcDZ42NKHVuVoEUJqsH6` — **ERROR**  
**URL:** https://pdv-importados-qqqaiblnk-jinlong.vercel.app (inacessível — build não completou)

**Último Preview funcional (histórico):** `dpl_4znhvKr7` — https://pdv-importados-61umtux8c-jinlong.vercel.app (SSO; health exige login/share válido)
