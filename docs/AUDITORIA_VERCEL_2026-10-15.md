# Auditoria Vercel — equipe `jinlong` (NatureCode) — 2026-10-15

Escopo: projetos `pdv-importados` e `jinlong-site`, domínio `jinlong.app`, custos de outubro.
Modo: somente leitura. **Nenhuma alteração foi feita** em Vercel, DNS, Supabase ou produção.
Nenhum valor de segredo foi lido (variáveis listadas apenas por nome/tipo/alvo).

---

## 1. Configuração atual

| Item | `pdv-importados` (ERP/PDV) | `jinlong-site` (site comercial) |
|---|---|---|
| Root Directory | `pdv-importados` | `site` |
| Repositório / branch de produção | `nocodenn-cell/fastproduct` / `main` | mesmo / `main` |
| Install / Build | `npm ci` / `npm run build` | `npm ci` / `npm run build` |
| Ignored Build Step | (dashboard) `if [ "$VERCEL_ENV" == "production" ]; then exit 1; else exit 0; fi` | (`site/vercel.json`) `sh scripts/vercel-ignore.sh` |
| Node | 24.x | 24.x |
| Região das funções | `gru1` (via `pdv-importados/vercel.json`; default do projeto é `iad1`) | `gru1` (via `site/vercel.json`) |
| Build machine | basic, fixa | basic, fixa |
| Deployment Protection | Vercel Auth — *Standard* (`all_except_custom_domains`) | Vercel Auth — **All** (inclui produção) |
| Domínios | `www.jinlong.app`, `pdv-importados.vercel.app`, `v0-pdv-importados.vercel.app` + aliases automáticos | apenas `*.vercel.app` automáticos (sem domínio próprio) |
| Firewall | sem configuração customizada (proteção padrão da plataforma) | idem |
| Web Analytics / Speed Insights | ativo (com dados) / ativo (**sem dados**) | criado / sem dados |
| Variáveis de ambiente | 34 (ver §4.3) | nenhuma |

Supabase de produção: `jinlong` (`sa-east-1`, ACTIVE_HEALTHY). Funções em `gru1` → mesma região. ✔
Plano da equipe: **Pro**, ciclo 29/09 → 29/10.

O `vercel.json` da **raiz** do repositório (`github.silent`, `autoJobCancelation`, `buildCommand`) **não é lido por nenhum projeto** (ambos têm Root Directory definido). É configuração morta.

---

## 2. Diagnóstico (com evidências)

### 2.1 Por que os dois projetos recebem os mesmos commits — **esperado**
Ambos estão ligados ao mesmo repositório (monorepo). Todo push gera um deployment em cada projeto; cada um decide se constrói:

- **pdv-importados**: últimos 100 deployments (10–15/out) = **93 preview CANCELED + 7 production READY**.
  Motivo dos cancelados (API): *"canceled because the Ignored Build Step command is configured to skip this build"*.
  → Previews do ERP **nunca** são construídos; produção constrói **todo** commit em `main`.
- **jinlong-site**: 65 preview CANCELED, 27 preview READY, 6 production CANCELED, 1 production READY.
  Motivo dos production CANCELED: *"canceled because the commit didn't affect this project"* (detecção de projeto afetado da Vercel).

**Conclusão:** os deployments cancelados são **pulos normais**, não falhas. Não há builds duplicados de um mesmo projeto para o mesmo commit.

### 2.2 Ignored Build Step do `jinlong-site` é ineficaz — **confirmado** (impacto financeiro mínimo)
Logs de build (`dpl_D3Lkx…`, `dpl_Eyzbx…`, `dpl_8kmx…`):

- Branch nova: `[ignore-step] sem VERCEL_GIT_PREVIOUS_SHA: executando build` — commit `9a3260c9` é só `docs(ux)`, e `git diff origin/main...9a3260c9 -- site package.json package-lock.json .npmrc` é vazio.
- `main`: `[ignore-step] commit base 18804b3… indisponível: executando build` — o clone da Vercel é raso, o SHA base não está presente.

Causa raiz: o script segue (corretamente) a regra "na dúvida, constrói", mas na prática a dúvida ocorre quase sempre (branch nova ou clone raso). Resultado: o site é construído em commits que não o tocam (~30–40 s cada).

### 2.3 Produção do ERP reconstrói em todo merge na `main`
O ignore step do ERP só olha `VERCEL_ENV`; merges que mexem apenas em `docs/`, `site/` ou `*.md` também geram build de produção (~3 min) e um novo deploy de produção.
Custo baixo; o risco operacional (redeploy desnecessário em horário de loja) é maior que o custo.

### 2.4 Domínios, TLS e DNS
| Verificação | Resultado |
|---|---|
| `jinlong.app` | registrado na Vercel, NS `ns1/ns2.vercel-dns.com` ✔, expira 04/09/2027, renovação automática ✔ |
| `https://jinlong.app/` | **307** → `https://www.jinlong.app/` (redirecionamento automático; apex não está vinculado a nenhum projeto) |
| `https://www.jinlong.app/` | 307 → `/login` → 200 ✔ |
| TLS apex / www | Let's Encrypt, válido 04/09 → 03/12/2026, SAN correto ✔ (renovação automática pela Vercel) |
| HSTS | `max-age=63072000` ✔ |
| DNS (zona) | 3 CAA + 2 ALIAS (`@` e `*` → `cname.vercel-dns-016.com.`) — todos criados e geridos pela Vercel ("may change without notice") |

**`ipStatus: required-change` (apex)** — hipótese bem fundamentada, **não exige ação**: o apex é servido por um registro ALIAS gerido pelo próprio sistema da Vercel (resolve hoje para `216.150.x.x`, a faixa anycast atual), `misconfigured: false`, certificado válido e o domínio responde. A recomendação `76.76.21.21` é a faixa legada. Em zona gerida pela Vercel, quem mantém esse registro é a própria Vercel; editar manualmente cria um registro fixo que deixa de acompanhar mudanças da plataforma. **Não alterar.** Se o aviso persistir, abrir chamado no suporte Vercel em vez de mexer no DNS.

### 2.5 Segurança
- **Cabeçalhos de segurança ausentes em produção** — confirmado (`curl -I https://www.jinlong.app/login`): não há `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`. Nada em `pdv-importados/next.config.js` nem em `middleware.ts`. Risco: clickjacking da tela de login/PDV.
- **URLs públicas duplicadas da produção**: `pdv-importados.vercel.app` e `v0-pdv-importados.vercel.app` servem o ERP de produção sem a proteção da Vercel (respondem `307 → /login` como o domínio oficial). O app exige login, mas são entradas alternativas (phishing/indexação).
- Deployment Protection: ativa nos dois projetos ✔; `gitForkProtection` ✔; nenhum bypass token configurado ✔.
- Firewall: sem regras customizadas. Não é falha, mas não há rate limit no `/login`.
- `/robots.txt` → 404 no ERP (sem bloqueio explícito de indexação).

### 2.6 Logs e erros de runtime
- `get_runtime_errors` (7 dias, ERP): **nenhum erro**.
- `/api/health` → `{"status":"ok","checks":{"supabase":"ok"}}`, `deploymentId` = deploy de produção atual (`dpl_HkZkk…`, commit `100181b1`).
- `get_runtime_logs` voltou vazio para 24 h mesmo com ~19 mil invocações no mês → **não verificado** (provável limitação da API/retentiva; conferir no painel).

---

## 3. Custos (01/10 → 15/10)

Fonte: `/v1/billing/charges` (FOCUS), 12.420 linhas agregadas.

| Serviço | Projeto | Consumo | Efetivo (US$) | Faturado (US$) |
|---|---|---|---|---|
| Pro (assinatura) | — | — | 10,00 | 0,00 |
| Build CPU Minutes | pdv-importados | 600 min | 2,10 | 0,16 |
| Vercel Agent | — | 1,5 créditos | 1,50 | 0,00 |
| Build CPU Minutes | jinlong-site | 272 min | 0,95 | 0,00 |
| Connect Triggers | pdv-importados | 884 | 0,84 | 0,04 |
| Observability Events | pdv-importados | 128.873 | 0,15 | 0,01 |
| Fluid CPU + memória + transferência | pdv-importados | 0,5 h CPU / 5,7 GB-h | 0,30 | 0,00 |
| Web Analytics | pdv-importados | 1.025 eventos | 0,03 | 0,00 |
| **Total** | | | **15,90** | **0,22** |

- **Efetivo** = valor de lista do consumo; **faturado** = o que excede o crédito incluso no Pro. Hoje quase tudo cabe no crédito.
- O maior item variável são **builds** (872 min ≈ 79 % do uso variável). O pico em 05–09/10 coincide com muitos merges.
- Observability Plus está ativo no time (`observabilityEvent` cobrado): US$ 0,15 efetivo em 15 dias. Speed Insights ativo no ERP **sem dados** → custo zero.
- "Connect Triggers" (884): **não identificado** — hipótese: gatilhos de integração Git/Connect do ERP. Custo irrelevante; verificar no painel de Usage se crescer.

**Economia possível:** pequena em dólares (ordem de US$ 1–2/mês efetivos, ~US$ 0 faturado enquanto couber no crédito). O ganho real das correções de build é **menos deploys de produção desnecessários** e fila de build mais livre.

---

## 4. Problemas confirmados × hipóteses

### 4.1 Confirmados
1. Variáveis com nome errado (inertes) no ERP:
   - `NEXT_PUBLIC_IDLE_LOGOUT_MINUTE` — o código lê `NEXT_PUBLIC_IDLE_LOGOUT_MINUTES` (`lib/security/idleLogoutMinutes.ts:7`). O logout por inatividade usa o **padrão**, não o valor configurado.
   - `STRICT_MANAGER_DISCOUNT_AUT` — o código lê `STRICT_MANAGER_DISCOUNT_AUTH` (`lib/config/caixaSalesRuntimeConfig.ts`). Usa o padrão (`true`), que é o valor seguro.
2. Variáveis de teste/dev e credenciais não usadas pelo app, presentes em **produção** (e injetadas no build):
   - `SEED_DEV_PASSWORD`, `RLS_SMOKE_JWT_CAIXA`, `RLS_SMOKE_JWT_PAINEL` (usadas só por scripts/E2E).
   - `DATABASE_URL`, `POSTGRES_*` (7), `SUPABASE_JWT_SECRET`, `SUPABASE_SECRET_KEY` — nenhuma referência no código do ERP (vêm da integração Supabase↔Vercel).
   - `NEXT_PUBLIC_DEBUG_MODE` — não é lida pelo app. `NODE_ENV` definida manualmente (a Vercel já define).
   - `SUPABASE_SERVICE_ROLE_KEY` também no alvo *preview* (hoje inócuo porque previews do ERP nunca constroem).
3. Cabeçalhos de segurança ausentes (§2.5).
4. ERP de produção acessível por `pdv-importados.vercel.app` e `v0-pdv-importados.vercel.app` (§2.5).
5. Ignored Build Step do site ineficaz (§2.2); ERP reconstrói produção em commits que não o afetam (§2.3).
6. `vercel.json` da raiz é configuração morta (§1).
7. Região padrão das funções no projeto é `iad1`; só o `vercel.json` garante `gru1`. Se o arquivo for removido/alterado, as funções vão para os EUA, longe do Supabase (`sa-east-1`).

### 4.2 Hipóteses não verificadas
- `ipStatus: required-change` é aviso informativo em zona gerida pela Vercel (§2.4).
- Origem de "Connect Triggers".
- Ausência de runtime logs em 24 h (limitação da API × ausência real de logs).
- Se algum cliente embute o ERP em `<iframe>` (relevante antes de aplicar `X-Frame-Options: DENY`; nada encontrado no repositório).

---

## 5. Correções realizadas
Nenhuma aplicada diretamente em produção. **B** (cabeçalhos de segurança) foi autorizada e implementada em PR, sem merge.
As demais correções mudam produção (variáveis, domínios, cabeçalhos, deploy) ou alteram uma política de segurança documentada (ignore step do site). Seguindo as regras, ficam pendentes de autorização.

---

## 6. Pendentes de autorização (ordem sugerida)

| # | Mudança | Benefício | Risco | Reversível |
|---|---|---|---|---|
| A | Criar `NEXT_PUBLIC_IDLE_LOGOUT_MINUTES` e `STRICT_MANAGER_DISCOUNT_AUTH` com os valores pretendidos (sem apagar as antigas) + redeploy | configuração passa a valer | **muda comportamento**: tempo de logout passa a ser o valor configurado. Confirmar o valor desejado antes | sim |
| B | Adicionar em `next.config.js` → `headers()`: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (sem CSP por ora) | fecha clickjacking/sniffing | baixo; quebra só se alguém embutir o ERP em iframe de outro domínio | sim (PR) |
| C | Redirecionar `pdv-importados.vercel.app` e `v0-pdv-importados.vercel.app` → `www.jinlong.app` (308) | uma única entrada pública | checar antes as Redirect URLs do Supabase Auth e scripts que usem essas URLs | sim |
| D | Vincular `jinlong.app` ao projeto como redirect 308 → `www` | redirect permanente explícito (SEO/cache) | baixo | sim |
| E | Ignore step do ERP: pular produção quando o diff toca **só** `docs/`, `site/`, `*.md` (com fallback "na dúvida, constrói") | menos deploys de produção desnecessários | baixo se mantiver o fallback | sim |
| F | Ignore step do site: tentar aprofundar o clone (`git fetch --deepen`) antes de desistir; se falhar, constrói como hoje | menos builds do site | baixo; não verificável sem deploy de teste | sim |
| G | Definir região padrão do projeto ERP = `gru1` | remove dependência só do `vercel.json` | nenhum funcional | sim |
| H | Remover de **produção** variáveis não usadas (§4.1-2), após confirmar com quem roda os scripts de smoke/seed | menor superfície de vazamento | médio se algum script externo depender delas — confirmar antes. Regra atual proíbe apagar sem autorização | parcial (manter backup do valor) |

Não recomendado: desligar `jinlong-site` (é o site comercial em pré-lançamento — Vercel Auth "All" e sem domínio são coerentes com a migração planejada em `docs/site/MIGRACAO_SITE_ERP_DOMINIOS.md`); desligar Observability (custo irrisório e útil em produção com cliente real).

---

## 7. Resultado dos testes (somente leitura, sem login e sem operações)

| Teste | Resultado |
|---|---|
| Build + TypeScript do commit em produção (`100181b1` = HEAD desta branch) | ✔ build de produção na Vercel concluído (`ignoreBuildErrors: false` → tipos checados). Build local não rodado (worktree sem `node_modules`) |
| `/login` | 200 em ~0,4 s |
| `/admin`, `/caixa`, `/gerente` sem sessão | 307 → `/login?next=…` ✔ (guarda de autenticação ativa) |
| `/api/health` | 200, `supabase: ok`, deploy atual ✔ |
| `jinlong.app` / `www.jinlong.app` | disponíveis, TLS válido ✔ |
| `jinlong-site.vercel.app` | 302 → login Vercel (protegido, esperado) |
| Erros de runtime (7 dias) | nenhum |
| Login real / acesso ao PDV autenticado | **não executado** (exigiria credenciais reais; fora das regras) |

Avisos de build sem impacto: depreciações do `@sentry/nextjs` (`disableLogger`, `automaticVercelMonitors`, `sentry.client.config.js`), `npm warn Unknown env config "cache-dir"`, *install-scripts* pendentes de `allowScripts`.

---

## 8. Riscos residuais e recomendações
1. Prioridade alta: **A** (logout por inatividade não segue a configuração) e **B** (cabeçalhos).
2. Revisar variáveis sensíveis em produção (**H**) e rotacionar `SEED_DEV_PASSWORD`/`RLS_SMOKE_JWT_*` se já tiverem sido usados fora do CI.
3. Fazer merges na `main` fora do horário da loja enquanto **E** não for aplicado — cada merge redeploya a produção.
4. Os outros dois projetos do time (`otica360-demo`, `ageguard`) ficaram fora do escopo; consomem pouco (4 min de build no mês).
