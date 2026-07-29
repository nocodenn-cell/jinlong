# Auditoria de Infraestrutura — Fase 2 (Go-Live)

**Data:** 2026-07-29
**Escopo:** GitHub · GitHub Actions · Vercel · Supabase · Sentry · Credenciais · Observabilidade · Backup/DR
**Método:** inspeção ao vivo das plataformas (gh API, Vercel CLI/API, Supabase MCP, Sentry API) cruzada com o repositório. Nenhuma credencial foi rotacionada, nenhum recurso foi excluído.

---

## 1. Veredito

**NO-GO para o primeiro cliente.**

O banco está endurecido — a Fase 1 entregou o que prometeu. O problema não está no banco: está na **camada de operação em volta dele**. Três achados isolados bastam para impedir o go-live, e nenhum deles é visível olhando código:

1. O pipeline de CI **não executa há 17 dias** — 300 execuções, zero sucessos. Todo gate documentado como "verde" desde 12/07 nunca rodou.
2. A URL de produção **não é acessível para um cliente** — está atrás do Vercel Deployment Protection (SSO).
3. O worker fiscal roda a cada minuto e **não faz nada** — o Vault está vazio, e o pg_cron reporta "succeeded" mesmo assim.

Os três compartilham a mesma característica: **falham em silêncio e reportam sucesso.** É exatamente a classe de problema que só aparece com cliente real usando.

### Contagem

| Severidade | Qtd | Significado |
|---|---|---|
| **P0** | 6 | Bloqueia produção |
| **P1** | 9 | Corrigir antes do primeiro cliente |
| **P2** | 8 | Importante |
| **P3** | 5 | Melhoria futura |

---

## 2. P0 — Bloqueia produção

### P0-1 · CI/CD morto há 17 dias — todos os gates são ficção

**Evidência:**
```
300 execuções analisadas (18/07 → 29/07)
  success:  0
  failure:  297
  skipped:  3
```
Jobs terminam em 3–5 s com `steps: []` e log inexistente — o runner **nem inicia**. Causa raiz já documentada em `docs/GITHUB_ACTIONS_BILLING_UNBLOCK.md` (2026-07-12): falha de pagamento / spending limit na conta `nocodenn-cell`. **Não foi corrigido**, e a janela cresceu de 1 para 17 dias.

**Por que é P0:** `secret-scan`, `ci-pdv-importados`, `ci-backend-supabase`, o gate de drift de migrations e o SSRA **não rodam desde 12/07**. Todo commit em `main` nesse período entrou sem nenhuma verificação automática. Os documentos de fechamento de CI/CD (`ENCERRAMENTO_CICD_GO_NOGO.md`, `CICD_FINAL_STATE.md`) descrevem um pipeline que, na prática, está desligado.

**Correção:** só na UI de billing — https://github.com/settings/billing → Payment information + Spending limits. O token `gh` atual não tem escopo para isso.
**Validação:** `gh run list --limit 5` deve mostrar `success` ou falha real de teste (duração > 30 s), não falha de 4 s.
**Rollback:** n/a (restauração de serviço).

---

### P0-2 · Produção inacessível — Vercel Deployment Protection ativo

**Evidência:**
```
GET https://pdv-importados-jinlong.vercel.app/
→ 302 https://vercel.com/sso-api?url=...&nonce=...
API do projeto: "live": false
```
Toda requisição à produção é redirecionada para o SSO da Vercel. Um cliente que abrir a URL vê uma tela de login **da Vercel**, não do Jinlong.

**Correção (requer aprovação — altera exposição de produção):** Vercel → Project `pdv-importados` → Settings → Deployment Protection → desabilitar **Vercel Authentication** para o ambiente Production, mantendo-a em Preview.
**Dependência:** só fazer junto de P0-3 (hoje Preview e Production compartilham o mesmo banco; abrir produção sem separar ambientes amplia a superfície).
**Rollback:** reativar a proteção no mesmo painel — efeito imediato, sem redeploy.

---

### P0-3 · Um único projeto Supabase — Preview, E2E e Produção no mesmo banco

**Evidência:** existe **um** projeto Supabase (`kbabmewnahysfvlybiak` / `jinlong`, sa-east-1). Na Vercel:
```
NEXT_PUBLIC_SUPABASE_URL       Production, Preview, Development   ← mesmo valor
SUPABASE_SERVICE_ROLE_KEY      Production, Preview
DATABASE_URL                   Production, Preview
```
Consequências diretas, todas verificadas:
- Qualquer deploy de Preview (há **250+ branches** no remoto) escreve no banco de produção.
- A `service_role` key — que **ignora RLS por definição** — está disponível em toda build de Preview.
- Os testes E2E/smoke gravaram no banco de produção (ver P0-4).

**Por que é P0:** não é hipótese. Já aconteceu: os registros de `probe.dono.*@fp-homolog.com` e `smoke.dono.*@fp-homolog.com` em `auth.users` são resíduo de execuções de teste contra produção.

**Correção (requer aprovação — cria ambiente e move credenciais):**
1. Criar projeto Supabase `jinlong-staging` (mesma região).
2. Aplicar as migrations 001→284 no staging.
3. Na Vercel, redefinir para o **escopo Preview apenas**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` → apontando para staging.
4. Repontar `SUPABASE_MIGRATION_CHECK_PROJECT_REF` e os secrets `PLAYWRIGHT_*` / `CI_*` para staging.

**Rollback:** restaurar os valores anteriores por escopo (`vercel env rm <VAR> preview` + `vercel env add`). Guardar `vercel env pull` dos dois escopos antes de mexer.

---

### P0-4 · Banco de produção contém 13 contas de teste com senhas conhecidas

**Evidência:** 15 usuários em `auth.users`; **apenas 1 é real** (`aoliveiradamata@gmail.com`).

| Conta | Último login | Origem |
|---|---|---|
| `demo@jinlong.com` | **2026-07-29 (hoje)** | demo |
| `e2e-admin@fastproduct.dev` | 2026-07-19 | E2E |
| `e2e-gerente@localhost.test` | 2026-07-18 | E2E |
| `e2e-operador@localhost.test` | 2026-07-18 | E2E |
| `e2e-dono@localhost.test` | nunca | E2E |
| `operador.test@example.com` | 2026-07-10 | teste |
| `gerente.test@example.com` | 2026-06-15 | teste |
| `demo-gerente@localhost.test` | 2026-07-10 | demo |
| `demo-operador@localhost.test` | 2026-06-23 | demo |
| `probe.dono.1784431715968@fp-homolog.com` | nunca | probe |
| `probe.dono.1784431787527@fp-homolog.com` | nunca | probe |
| `smoke.dono.1784432057537@fp-homolog.com` | nunca | smoke |
| `cloudagenttest@mailinator.com` | nunca | **não confirmado**, domínio de e-mail descartável público |
| `email-do-test@exemplo.com` | nunca | teste |

As senhas dessas contas estão em `PLAYWRIGHT_TEST_PASSWORD`, `PLAYWRIGHT_CAIXA_TEST_PASSWORD` (GitHub Secrets) e `SEED_DEV_PASSWORD` (Vercel **Production**). São credenciais operacionais válidas para o banco que o primeiro cliente vai usar.

`cloudagenttest@mailinator.com` merece destaque: qualquer pessoa pode ler a caixa postal de `mailinator.com` e disparar um reset de senha.

**Correção (requer aprovação — exclusão de dados):** após P0-3, remover as 13 contas de produção e recriá-las apenas no staging. Sequência segura: `banir` (`banned_until`) → observar 48 h → excluir.
**Rollback:** desbanir é reversível; a exclusão não — daí a janela de observação.

---

### P0-5 · Worker fiscal executa 1.440×/dia sem fazer nada (Vault vazio)

**Evidência:**
```sql
select * from vault.decrypted_secrets;   →  0 linhas
select count(*) from net._http_response; →  0
select status, count(*) from cron.job_run_details
  where start_time > now()-interval '24h';
                                         →  succeeded: 1440
```
`internal.fiscal_worker_invoke()` busca `fiscal_worker_url` e `fiscal_worker_key` no Vault; se ausentes, emite `raise warning` e **retorna sem erro**:
```sql
if v_url is null or v_key is null then
  raise warning 'fiscal_worker_invoke: segredos vault ausentes (...)';
  return;
end if;
```
Como a função retorna normalmente, o pg_cron registra **`succeeded`** — 1.440 sucessos falsos por dia. `net._http_response` vazio confirma que nenhuma requisição HTTP jamais saiu.

**Por que é P0:** documentos fiscais enfileirados nunca são processados, e **todo painel ou alerta baseado em `cron.job_run_details` mostra verde**. A migração GitHub Actions → pg_cron foi bem desenhada (Vault + `pg_net`, sem chave em código) mas nunca foi finalizada.

**Correção:**
1. Popular o Vault (requer aprovação — introduz credencial):
   ```sql
   select vault.create_secret('https://kbabmewnahysfvlybiak.supabase.co/functions/v1/fiscal-worker', 'fiscal_worker_url');
   select vault.create_secret('<FISCAL_WORKER_KEY>', 'fiscal_worker_key');
   ```
   O valor de `fiscal_worker_key` deve ser idêntico ao secret `FISCAL_WORKER_KEY` da Edge Function.
2. **Trocar o `raise warning` por `raise exception`** para que a ausência de segredo passe a falhar visivelmente no pg_cron.
3. Se o módulo fiscal ainda não entra no piloto: `select cron.unschedule(1);` — melhor desligado e explícito do que ligado e mentindo.

**Validação:** `select count(*) from net._http_response;` > 0 em até 2 min.
**Rollback:** `select cron.unschedule(1)` / `vault.delete_secret`.

---

### P0-6 · Sem branch protection — `main` aceita push direto

**Evidência:**
```
GET /repos/nocodenn-cell/fastproduct/branches/main/protection
→ 403 "Upgrade to GitHub Pro or make this repository public"
GET /repos/nocodenn-cell/fastproduct/rulesets  → 403 (idem)
```
O repositório é **privado no plano GitHub Free**, onde branch protection e rulesets são indisponíveis. Não há regra alguma protegendo `main`: nem PR obrigatório, nem required checks, nem CODEOWNERS efetivo. O `.github/CODEOWNERS` existe mas **não é aplicado** sem branch protection — é documentação, não controle.

Somado a P0-1, o estado real é: **qualquer push vai direto para `main` e dispara deploy de produção, sem revisão e sem CI.**

**Correção (requer decisão do usuário):**
- **A —** GitHub Pro (US$ 4/mês/usuário): habilita protection em repo privado. Menor atrito.
- **B —** Migrar o repo para uma Organization no plano Free: rulesets em repo privado **não** são liberados; só resolve com Team (US$ 4/usuário).
- **C —** Sem custo: compensar com hook local `pre-push` que bloqueia push direto em `main`. Mitiga, não resolve — é contornável.

**Recomendação:** opção A. É o menor custo absoluto e destrava também as Dependabot alerts.

---

## 3. P1 — Corrigir antes do primeiro cliente

### P1-1 · `SUPABASE_SERVICE_ROLE_KEY` e `DATABASE_URL` expostos ao escopo Preview
Coberto por P0-3. Registrado à parte porque, **mesmo mantendo um único banco**, remover essas duas variáveis do escopo Preview já reduz drasticamente o risco. Preview builds raramente precisam de `service_role`.
**Ação:** `vercel env rm SUPABASE_SERVICE_ROLE_KEY preview` (idem `DATABASE_URL`). **Rollback:** `vercel env add`.

### P1-2 · Sem domínio próprio
Domínios ativos: `pdv-importados-jinlong.vercel.app` e `pdv-importados-git-main-jinlong.vercel.app`. Entregar um ERP a um cliente pagante em subdomínio `.vercel.app` é frágil (percepção + acoplamento ao vendor + nenhuma portabilidade se o projeto for renomeado). Nenhum redirect configurado.
**Ação:** registrar domínio, apontar na Vercel, redirect 308 do `.vercel.app`.

### P1-3 · Bug ativo em produção — `/admin/financeiro` quebrada
Sentry `FASTPRODUCT-PDV-2`: *"Attempted to call `parseFinanceiroTab()` from the server but `parseFinanceiroTab` is on the client"* — **16 eventos, visto pela última vez há 2 dias**, culprit `Page Server Component (/admin/financeiro)`. Erro de fronteira Server/Client no Next 15: a página do módulo financeiro falha ao renderizar.
**Ação:** corrigir a fronteira (`'use server'`/`'use client'`) antes do go-live. Módulo financeiro não é opcional num ERP.

### P1-4 · Sentry provavelmente cego no browser
Sintoma: **zero issues de client-side em 30 dias** num PDV usado diariamente — enquanto os 4 issues existentes são todos server-side (`Page Server Component`, `POST /admin/catalogo`, `POST /caixa`).

Causa provável — o assistente do Sentry rodou na **raiz do monorepo**, mas o app Next fica em `pdv-importados/` (Root Directory da Vercel). Resultado:

| Arquivo | Local | Efeito |
|---|---|---|
| `instrumentation-client.js` | **raiz** | nome correto para SDK v10, **caminho morto** — nunca carregado |
| `sentry.server.config.js` | **raiz** | morto, com **DSN hardcoded** |
| `sentry.edge.config.js` | **raiz** | morto, com **DSN hardcoded** |
| `pdv-importados/sentry.client.config.js` | app | nome **legado** para `@sentry/nextjs@10` |
| `pdv-importados/sentry.server.config.js` | app | **ativo** (importado por `instrumentation.ts`) |
| edge config no app | — | **não existe** → erros de middleware/edge não capturados |

`pdv-importados/instrumentation.ts` registra apenas o runtime `nodejs` e **não exporta `onRequestError`**, exigido no Next 15 para capturar erros de React Server Components.

**Ação:** renomear `pdv-importados/sentry.client.config.js` → `pdv-importados/instrumentation-client.ts`; criar `pdv-importados/sentry.edge.config.js`; adicionar o branch `edge` e `export const onRequestError = Sentry.captureRequestError` em `instrumentation.ts`. Validar com um erro proposital em produção.

### P1-5 · Preview e Production indistinguíveis no Sentry
`sentry.*.config.js` do app usam `environment: process.env.NODE_ENV`. Na Vercel, `NODE_ENV === 'production'` **tanto em Preview quanto em Production** — os dois ambientes reportam sob a mesma tag. Impossível saber se um erro veio de cliente real ou de branch de teste.
**Ação:** `environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'`.

### P1-6 · `NODE_ENV` definido manualmente na Vercel
`NODE_ENV` aparece como variável de ambiente gerenciada (Preview + Production). A Vercel já define `NODE_ENV`; sobrescrevê-la é anti-padrão e pode quebrar build ou tree-shaking se o valor divergir. É também a raiz do P1-5.
**Ação:** remover a variável e confiar no valor da plataforma. **Rollback:** re-adicionar.

### P1-7 · Sem release tracking / source maps versionados no Sentry
`withSentryConfig` está configurado com `org`/`project` por env e `hideSourceMaps: true`, mas nenhum `release` é fixado. Stack traces de produção ficam minificadas e não há correlação erro ↔ deploy.
**Ação:** `release: process.env.VERCEL_GIT_COMMIT_SHA` no `withSentryConfig` e nos `Sentry.init`.

### P1-8 · Credenciais de teste no ambiente Production da Vercel
`RLS_SMOKE_JWT_CAIXA`, `RLS_SMOKE_JWT_PAINEL` (JWTs pré-emitidos) e `SEED_DEV_PASSWORD` estão no escopo **Production**. São artefatos de teste; produção não os consome.
**Ação:** remover do escopo Production, manter em Preview/CI. Verificar antes com `grep -r "RLS_SMOKE_JWT\|SEED_DEV_PASSWORD" pdv-importados/src`.

### P1-9 · Migrations 277–284 aplicadas em produção mas fora do Git — **CORRIGIDO nesta sessão**
As 8 migrations da Fase 1 estavam confirmadas em `supabase_migrations.schema_migrations` (produção) e **untracked** no repositório. O banco estava à frente do repo; qualquer `git clean` teria destruído o código-fonte de mudanças já aplicadas em produção, sem possibilidade de reconstrução. Commitadas nesta sessão.

---

## 4. P2 — Importante

| # | Achado | Evidência | Ação |
|---|---|---|---|
| P2-1 | **Dependabot / Secret Scanning / Push Protection / Code Scanning todos desligados** | `vulnerability-alerts` → 404; `secret-scanning/alerts` → 404; `security_and_analysis: null` | `.github/dependabot.yml` **criado nesta sessão** (version updates). *Alerts* exigem UI + P0-6 |
| P2-2 | **4 workflows-fantasma** registrados na API sem arquivo no repo: `architecture-validation.yml`, `ci-agents.yml`, `ci-core.yml`, `ci-visual-baseline.yml` | `gh api .../actions/workflows` lista 9; o repo tem 5 | Poluem a lista de required checks. Remover pela UI após P0-6 |
| P2-3 | **Actions de terceiros em tag mutável** — `dtolnay/rust-toolchain@stable`, `Swatinem/rust-cache@v2` | ref mutável = código do runner pode mudar sem revisão | **Pinadas por SHA nesta sessão** |
| P2-4 | **3 tabelas em `public` sem RLS**: `documentos_fiscais_dlq`, `sync_request_nonces`, `venda_engine_shadow_runs` | RLS `false`, 0 policies | **Não exploráveis hoje** — verificado: nenhum grant a `anon`/`authenticated`. Habilitar RLS como defesa em profundidade |
| P2-5 | **Funções de trigger expostas como RPC** — `tg_documentos_fiscais_eventos_ai/au`, `trg_fn_produtos_margem`, `trg_fn_precos_atacado_margem`, `trg_fn_regras_preco_margem`, `trg_fn_vendas_caixa_aberto`, `trg_fn_itens_venda_limite_desconto` | Advisor: executáveis por `authenticated` via `/rest/v1/rpc/...` | Triggers nunca devem ser chamadas por REST. `REVOKE EXECUTE ... FROM authenticated, anon` — migration 285 |
| P2-6 | **`gtin_lookup_cache` com policies irrestritas** | Advisor `rls_policy_always_true` em `gtin_lookup_cache_update_auth` (UPDATE) e `_upsert_auth` (INSERT) | Qualquer usuário autenticado sobrescreve o cache de GTIN. Restringir por `loja_id`/perfil |
| P2-7 | **`search_path` mutável em 4 funções** — incl. `finalizar_venda_transacional`, `_canonica_v2`, `_v3` | Advisor `function_search_path_mutable` | Vetor de escalonamento em `SECURITY DEFINER`. `SET search_path = ''`. As v2/v3 são legado — verificar se podem ser dropadas |
| P2-8 | **Proteção contra senha vazada desligada** | Advisor `auth_leaked_password_protection` | Supabase → Auth → Password protection → habilitar HaveIBeenPwned. Zero impacto em usuários existentes |

---

## 5. P3 — Melhoria futura

| # | Achado | Ação |
|---|---|---|
| P3-1 | Headers de segurança incompletos — só `Strict-Transport-Security` e `X-Frame-Options`. Faltam CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` | Adicionar em `next.config.js`. CSP exige teste — pode quebrar inline scripts |
| P3-2 | **250+ branches remotas**; `delete_branch_on_merge: false` | Habilitar a flag; arquivar/podar branches `claude/*`, `cursor/*`, `devin/*` mescladas |
| P3-3 | 8 GitHub Environments, 6 são duplicatas órfãs da Vercel (`Preview – fastproduct`, `Production – pdv-importados`, …) para projetos que não existem mais | Remover os órfãos; manter `Production` e `Preview` |
| P3-4 | Versões de Node divergentes: `.nvmrc`=20, `engines`=`>=20 <25`, Vercel=**24.x** | Alinhar `.nvmrc` para 24 — dev e prod no mesmo major |
| P3-5 | CODEOWNERS aponta 5 caminhos inexistentes: `/pdv-importados/src/lib/auth/`, `/pdv-local/Cargo.toml`, `/docs/DECISION-LOG.md`, `/tsconfig.json`, `/npm-audit.log` | Limpar. Regras órfãs dão falsa sensação de cobertura |
| P3-6 | Org Sentry `damatta-jm` / projeto `sentry-lime-envelope` sem uso (produção usa `damatta/fastproduct-pdv`) | Confirmar e remover |
| P3-7 | Logs de auditoria versionados na raiz: `.audit-*.log`, `.v220-*.log`, `.aider.chat.history.md` (430 KB) | `.gitignore` |

---

## 6. Inventário de credenciais

Nenhuma chave foi rotacionada. **Ordem de rotação obrigatória: P0-1 (CI) → P0-3 (staging) → rotação.** Rotacionar com o CI morto significa rotacionar sem rede de segurança.

### 6.1 Produção — impacto alto

| Credencial | Onde vive | Usada por | Impacto da rotação | Procedimento |
|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (Prod + **Preview**), Edge Functions | Rotas server-side, `fiscal-worker`, `sync-outbox` | **Ignora RLS.** Vazamento = acesso total ao banco | Supabase → API → roll `service_role` → atualizar Vercel (**só Production**, ver P1-1) → atualizar env das 3 Edge Functions → redeploy. Janela: ~5 min de erro 500 |
| `DATABASE_URL` | Vercel (Prod + Preview) | Conexão Postgres direta | Perda de conexão até atualizar | Trocar senha do DB no Supabase → atualizar Vercel → redeploy |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel (todos), CI | Browser | **Pública por design** — protegida por RLS. Rotação só se o JWT secret rodar | Rotacionar junto do JWT secret; invalida **todas** as sessões ativas |
| JWT Secret (Supabase) | Supabase interno | Assinatura de todos os tokens | **Desloga todos os usuários.** Invalida `RLS_SMOKE_JWT_*` | Só em janela de manutenção. Requer reemitir anon+service keys |
| `FISCAL_WORKER_KEY` | GitHub Secrets, env da Edge Function, **deveria estar no Vault** (P0-5) | `pg_cron` → `fiscal-worker` | Worker fiscal para | Gerar → atualizar env da Edge → `vault.update_secret('fiscal_worker_key')` → validar `net._http_response` |
| `SYNC_KEY` / `SYNC_GATE_SECRET` / `SYNC_OUTBOX_SECRET` | GitHub Secrets, Edge `sync-outbox`, **PDV local** | HMAC do PDV desktop → nuvem | **PDV local para de sincronizar** até atualizar cada instalação | Exige janela coordenada com as máquinas do cliente. Suportar 2 chaves na transição |
| `VERCEL_TOKEN` | GitHub Secrets | Automação Vercel | Baixo — deploy é pela integração nativa | Vercel → Account → Tokens. **Verificar se ainda é usado** (P3) |
| `SENTRY_AUTH_TOKEN` | GitHub Secrets, Vercel (Prod+Preview) | Upload de source maps no build | Build passa, source maps deixam de subir | Sentry → Auth Tokens. Só precisa de escopo de build |

### 6.2 Teste/desenvolvimento — remover de produção

| Credencial | Onde vive | Problema |
|---|---|---|
| `PLAYWRIGHT_TEST_PASSWORD` / `_EMAIL` | GitHub Secrets | Senha de conta **válida em produção** (P0-4) |
| `PLAYWRIGHT_CAIXA_TEST_PASSWORD` / `_EMAIL` | GitHub Secrets | idem |
| `PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY` | GitHub Secrets | Service role para E2E — **confirmar se aponta para produção** |
| `SEED_DEV_PASSWORD` | **Vercel Production** | Senha de seed em produção (P1-8) |
| `RLS_SMOKE_JWT_CAIXA` / `_PAINEL` | GitHub Secrets + **Vercel Production** | JWTs pré-emitidos em produção (P1-8) |
| `AUTONOMA_SHARED_SECRET` | GitHub Secrets | **Órfão?** — nenhum workflow atual referencia. Candidato a remoção |
| `SYNC_ENDPOINT` | GitHub Secrets | URL, não segredo. Deveria ser *variable* |
| `SENTRY_DSN` / `SENTRY_ORG` / `SENTRY_PROJECT` | GitHub Secrets + Vercel | DSN **não é segredo** (é público por design) e está hardcoded no código morto da raiz |

**Ação recomendada:** auditar `AUTONOMA_SHARED_SECRET`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` e `SYNC_ENDPOINT` contra os 5 workflows vivos — os workflows de deploy que os consumiam foram removidos na remediação de CI/CD (fases A–D). Secrets órfãos são superfície de ataque sem contrapartida.

---

## 7. GitHub Actions — inventário

Os 5 workflows sobreviventes já refletem a remediação das fases A–D (deploy só pela Vercel; `fiscal-cron.yml` removido; sem duplicação push+PR). **A arquitetura está correta — só não está executando (P0-1).**

| Workflow | Finalidade | Trigger | Custo | Risco | Veredito |
|---|---|---|---|---|---|
| `secret-scan.yml` | gitleaks | push + PR em `main` | baixo (ubuntu) | — | **Manter.** Único piso em push direto |
| `ci-pdv-importados.yml` | Build/lint/test/E2E do app web | PR (paths) | médio | — | **Manter.** É o gate de merge |
| `ci-backend-supabase.yml` | Type-check Edge, smoke de migrations, drift local↔remoto, anti-replay | PR (paths) | médio | drift check aponta para o **projeto de produção** (P0-3) | **Manter**, repontar para staging |
| `ci-pdv-local.yml` | Testes do desktop Tauri | push/PR (paths) + semanal + label `run-tauri` | **alto** (windows = 2×) | — | **Manter.** Já otimizado na fase C.2 |
| `release-validate.yml` | SSRA — valida deploy real via `deployment_status` | `deployment_status` | mínimo | — | **Manter.** Bom desenho |

**pg_cron:** a migração `fiscal-cron.yml` → pg_cron **já foi feita e está bem arquitetada** (segredos no Vault, `pg_net`, `SECURITY DEFINER` com `search_path` vazio). Só não foi finalizada — ver P0-5. Nenhum outro workflow deve migrar para pg_cron: os demais são gates de CI, não jobs agendados.

---

## 8. Observabilidade

| Item | Estado | Nota |
|---|---|---|
| Sentry server-side | ✅ funcionando | 4 issues capturados, config do app correta |
| Sentry client-side | ❌ provavelmente cego | P1-4 — zero erros de browser em 30 d |
| Sentry edge/middleware | ❌ ausente | Sem `sentry.edge.config.js` no app |
| Sentry RSC (`onRequestError`) | ❌ ausente | Exigido no Next 15 |
| Separação de ambientes | ❌ | P1-5 — Preview e Prod na mesma tag |
| Releases / source maps | ⚠️ parcial | P1-7 — sem `release` |
| Sampling | ✅ | 10% em prod, replay só com erro, `maskAllText` |
| Alertas | ❌ **nenhum configurado** | Erros existem e ninguém é notificado |
| Health check | ✅ `/api/health` | Consumido pelo SSRA |
| Monitoramento pg_cron | ❌ **enganoso** | P0-5 — reporta sucesso em no-op |
| Logs de infra | ⚠️ | Só retenção padrão Vercel/Supabase |

**Lacuna crítica:** não existe **um único alerta configurado**. Erro em produção hoje não gera notificação para ninguém. Mínimo antes do go-live: alerta Sentry para issue nova em `environment:production` e para taxa de erro acima do baseline → e-mail/WhatsApp.

---

## 9. Backup e recuperação

| Item | Estado |
|---|---|
| Backups automáticos Supabase | Diários (retenção conforme plano — **confirmar plano na UI**) |
| PITR | ❌ indisponível no Free/Pro-base — **requer add-on** |
| Restore testado | ❌ **nunca** |
| Rollback de app | ✅ Vercel Instant Rollback (promover deploy anterior) |
| Rollback de migration | ⚠️ documentado por migration; **não testado ponta a ponta** |
| Runbook de DR | ⚠️ existe `docs/RUNBOOK_ROLLBACK.md`; sem cenário de perda total do banco |

**Ponto crítico:** um ERP/PDV com dados financeiros e fiscais não deveria operar com cliente real **sem PITR**. Sem ele, a janela de perda é de até 24 h. Para um comércio, 24 h de vendas perdidas é irrecuperável — não há de onde reconstruir.

**Ações:** (1) contratar PITR; (2) **executar um restore de teste** para um projeto temporário e cronometrar o RTO — backup não testado não é backup; (3) documentar RPO/RTO acordados com o cliente.

---

## 10. Implementado nesta sessão

Critério aplicado: só mudanças que **não tocam build nem runtime**. Com o CI morto (P0-1), nenhuma alteração de código pode ser testada — implementar mudança de runtime agora violaria o requisito "testada".

| # | Mudança | Arquivo | Rollback |
|---|---|---|---|
| 1 | Migrations 277–284 versionadas (drift banco↔repo) | `backend/supabase/migrations/277..284_*.sql` | `git revert` — não altera o banco |
| 2 | Doc de hardening da Fase 1 versionado | `docs/AUDITORIA_HARDENING_PRE_BASELINE.md` | `git revert` |
| 3 | Dependabot (version updates) | `.github/dependabot.yml` | remover o arquivo |
| 4 | 2 actions de terceiros pinadas por SHA | `.github/workflows/ci-pdv-local.yml` | restaurar `@stable` / `@v2` |
| 5 | `permissions:` explícito em 4 workflows | `ci-backend-supabase`, `ci-pdv-importados`, `ci-pdv-local`, `release-validate` | remover o bloco |
| 6 | Este relatório | `docs/AUDITORIA_INFRA_GO_LIVE_FASE2.md` | — |

**Validação:** os 6 arquivos YAML foram parseados com sucesso (`js-yaml`); os SHAs foram resolvidos via API do GitHub contra as refs `v2` e `stable` reais. Itens 4 e 5 só produzem efeito quando o CI voltar a executar — são inertes até lá.

**Deliberadamente não executado** (requer aprovação): billing, Deployment Protection, criação do staging, rotação de chaves, exclusão de contas de teste, popular o Vault, remoção de env vars, mudanças em código de runtime.

---

## 11. Checklist de Go-Live

### Bloqueantes
- [ ] **P0-1** Billing do GitHub regularizado — `gh run list` mostra `success`
- [ ] **P0-2** Deployment Protection desativada em Production
- [ ] **P0-3** Projeto Supabase staging criado; Preview repontado
- [ ] **P0-4** 13 contas de teste removidas da produção
- [ ] **P0-5** Vault populado + `raise exception` + `net._http_response` > 0 — **ou** cron desagendado
- [ ] **P0-6** Branch protection em `main` (PR + required checks + sem push direto)

### Antes do primeiro cliente
- [ ] **P1-1** `SUPABASE_SERVICE_ROLE_KEY` e `DATABASE_URL` fora do escopo Preview
- [ ] **P1-2** Domínio próprio + redirect
- [ ] **P1-3** `/admin/financeiro` corrigida e verificada
- [ ] **P1-4** Sentry client + edge + `onRequestError` funcionando (erro proposital confirmado)
- [ ] **P1-5** `VERCEL_ENV` separando Preview de Production
- [ ] **P1-6** `NODE_ENV` manual removido da Vercel
- [ ] **P1-7** `release` fixado; source maps correlacionados
- [ ] **P1-8** JWTs de smoke e `SEED_DEV_PASSWORD` fora de Production
- [x] **P1-9** Migrations 277–284 versionadas
- [ ] **PITR contratado e restore testado com RTO cronometrado**
- [ ] **Pelo menos 1 alerta de erro configurado e testado ponta a ponta**
- [ ] Plano de rotação de credenciais executado (§6, na ordem indicada)

### Operação
- [ ] Runbook de DR com cenário de perda total do banco
- [ ] RPO/RTO acordados e documentados com o cliente
- [ ] Contato de plantão e canal de escalonamento definidos

---

## 12. Sequência recomendada

A ordem importa — vários itens dependem uns dos outros.

1. **P0-1 (billing).** Nada mais pode ser validado com o CI morto. Bloqueia tudo.
2. **P0-6 (branch protection).** Sem isso, qualquer correção pode ser desfeita por push direto.
3. **P0-3 (staging).** Pré-requisito de P0-2, P0-4 e P1-1.
4. **P0-4 (contas de teste) + P1-1 (secrets do Preview).** Só fazem sentido com staging pronto.
5. **P1-3, P1-4, P1-5, P1-7 (bug + observabilidade).** Precisam do CI para serem validados.
6. **P0-5 (fiscal).** Popular o Vault ou desagendar — decidir se o módulo fiscal entra no piloto.
7. **PITR + teste de restore.**
8. **P0-2 (abrir produção).** **Por último**, deliberadamente: só abrir a porta quando tudo atrás dela estiver correto.
9. Rotação de credenciais (§6).
10. P2 e P3.
