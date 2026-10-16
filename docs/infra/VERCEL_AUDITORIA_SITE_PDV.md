# Auditoria P0 — deploy Vercel do site (`jinlong-site`) e do ERP/PDV (`pdv-importados`)

**Data:** 2026-10-16 · **Modo:** somente leitura (API Vercel via MCP/CLI autenticada como `naturecode`, `gh`, `curl`, código do repositório).
**Nada foi alterado na Vercel, nos domínios, no Supabase ou em produção.** As correções propostas estão em uma branch e em um PR (ver `VERCEL_PLANO_CORRECAO.md`).

Documentos relacionados: `VERCEL_ARQUITETURA_DEPLOY.md` (arquitetura-alvo) e `VERCEL_PLANO_CORRECAO.md` (mudanças, validação e rollback).

---

## 1. Resumo executivo

| # | Achado | Gravidade | Evidência | Causa raiz |
|---|---|---|---|---|
| A1 | **O site é reconstruído em branches que só mexem no ERP.** 21 dos 25 builds `READY` do site na janela não tinham nenhuma mudança relevante ao site | Média (custo/ruído) | §4.2 | O *Ignored Build Step* do site depende de `VERCEL_GIT_PREVIOUS_SHA`. No **primeiro push de cada branch** (e em branches sem nenhum deploy do site) a variável vem vazia e o script constrói "por segurança" |
| A2 | **O ERP é reconstruído em produção a cada merge na `main`, inclusive merges só de docs ou só do site** | Baixa hoje (1 de 14), cresce quando o site começar a mudar | §4.1 | O *Ignored Build Step* do ERP, configurado só no painel, decide apenas por ambiente (`VERCEL_ENV == production`), sem olhar o que mudou |
| A3 | **O gate de release SSRA (`release-validate.yml`) não roda desde 2026-10-08** | **Alta** (verificação de produção do ERP desligada sem ninguém perceber) | §5 | Com dois projetos no mesmo repositório, a Vercel passou a nomear o ambiente GitHub `Production – pdv-importados`; o workflow filtra `environment == 'production'` e fica sempre `skipped` |
| A4 | O ERP **não tem Preview por PR** (todos os Previews são cancelados de propósito) | Decisão consciente, mas com risco latente | §3, §6 | Política do painel. **As variáveis de Preview do ERP apontam para o Supabase de produção** (`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` em `production+preview`). Ligar Previews hoje significaria rodar código não revisado contra o banco de produção |
| A5 | Configurações sem efeito ou enganosas | Baixa | §3.3 | `vercel.json` da raiz não é lido por nenhum projeto (ambos têm Root Directory); ignore do ERP só no painel (não versionado) |
| A7 | Duas variáveis do ERP com nome truncado não têm efeito (`STRICT_MANAGER_DISCOUNT_AUT`, `NEXT_PUBLIC_IDLE_LOGOUT_MINUTE`) | Média (configuração ignorada em silêncio; o padrão do código para o desconto é o estrito, `true`) | §3.2 | Nome cadastrado na Vercel difere do nome lido pelo código |
| A6 | Domínios: arquitetura-alvo ainda não aplicada | Informativo | §7 | `www.jinlong.app` serve o ERP; `app.jinlong.app` não está vinculado a projeto; o site não tem domínio próprio nem variáveis |

**Deploys cancelados não são erro.** Todos os `CANCELED` analisados são *skips* intencionais (Ignored Build Step ou *skip de projetos não afetados*), sem tempo de build cobrado (§4.3).

---

## 2. Escopo e método

- Time Vercel `jinlong` (nome exibido "NatureCode", `team_C1mGhbvpvDlAAEm05epmTKR0`).
- Configuração lida de `GET /v9/projects/{id}` (campos completos: Root Directory, comandos, ignore, Git).
- Histórico: os **100 deployments mais recentes de cada projeto** (`GET /v6/deployments`), janela **2026-10-10 19:38 → 2026-10-16 10:02 UTC**.
- Logs de build de deployments representativos (`list_deployment_events`).
- Para cada build, `git diff` entre o commit construído e a base correta, para classificar o build como necessário ou não.
- Ambientes e deployments do GitHub (`gh api repos/.../deployments`, `.../environments`) e execuções do workflow `release-validate.yml`.
- Variáveis de ambiente: **apenas nomes, tipo e escopo**. Nenhum valor foi lido ou decifrado.

---

## 3. Configuração atual dos dois projetos

### 3.1 Tabela comparativa

| Item | `pdv-importados` (ERP/PDV) | `jinlong-site` (site comercial) |
|---|---|---|
| ID | `prj_UPGWQN4TmzDQRYm5IB80a8ZxOslO` | `prj_Uf0IMVZBHk1NPUW445TXhWsSJzIT` |
| Criado em | 2026-05-02 | 2026-10-08 15:23 UTC |
| Repositório Git | `nocodenn-cell/fastproduct` (GitHub) | `nocodenn-cell/fastproduct` (GitHub) |
| Production Branch | `main` | `main` |
| Root Directory | `pdv-importados` | `site` |
| Incluir arquivos fora do Root Directory | sim | sim |
| Framework Preset | Next.js | Next.js |
| Install Command | `npm ci` | `npm ci` |
| Build Command | `npm run build` (→ `next build`) | `npm run build` (→ `next build`) |
| Output Directory | `.next` | padrão |
| Node | 24.x | 24.x |
| **Ignored Build Step** | **Painel:** `if [ "$VERCEL_ENV" == "production" ]; then exit 1; else exit 0; fi` (não versionado) | **Versionado:** `site/vercel.json` → `sh scripts/vercel-ignore.sh` (painel vazio) |
| *Skip deployments de projetos não afetados* (`enableAffectedProjectsDeployments`) | ligado | ligado |
| Região das funções | `gru1` via `pdv-importados/vercel.json` (padrão do projeto `iad1`) | `gru1` via `site/vercel.json` |
| Máquina de build | basic (2 vCPU, 8 GB), concorrência elástica **desligada** | basic, concorrência elástica **ligada** |
| Proteção de deployment | Vercel Authentication em tudo **exceto domínios próprios** | Vercel Authentication em **tudo** (inclui `jinlong-site.vercel.app`) |
| Comentários Git | em PR e **em cada commit** | só em PR |
| Web Analytics | ligado | desligado |
| Crons | nenhum | nenhum |
| Deploy hooks | nenhum | nenhum |

### 3.2 Variáveis de ambiente (somente nomes e escopos)

**`jinlong-site`: nenhuma variável.** O site usa os padrões do código: `NEXT_PUBLIC_ERP_URL` ausente → links "Entrar" vão para `https://www.jinlong.app` (`site/lib/erpLinks.ts`); `ERP_REDIRECT_ORIGIN` ausente → sem redirecionamentos para o ERP; zh-CN não publicado.

**`pdv-importados`:**

| Escopo | Variáveis |
|---|---|
| production | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` |
| production + preview | `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `NEXT_PUBLIC_DEBUG_MODE`, `NEXT_PUBLIC_IDLE_LOGOUT_MINUTE`, `STRICT_MANAGER_DISCOUNT_AUT`, `USE_UNIFIED_SALES_FLOW`, `NEXT_PUBLIC_DEFAULT_LANG`, `NEXT_PUBLIC_APP_NAME`, `NODE_ENV`, `RLS_SMOKE_JWT_CAIXA`, `RLS_SMOKE_JWT_PAINEL`, `SENTRY_DSN`, `SENTRY_PROJECT`, `SENTRY_ORG`, `SENTRY_AUTH_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN`, `SEED_DEV_PASSWORD`, `NEXT_PUBLIC_ENABLE_DEMO_FLUXO` |
| production + preview + development | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_jinlong_SENTRY_DSN` |

Observações (fora do escopo de correção deste PR, registradas para decisão):
- **Preview usa credenciais de produção** (`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`). É o principal motivo para manter o Preview do ERP desligado (A4).
- `NODE_ENV` definido manualmente em preview/produção: o Next.js já define; valor manual pode mascarar comportamento.
- **Nomes truncados, sem efeito (achado A7):** a Vercel tem `NEXT_PUBLIC_IDLE_LOGOUT_MINUTE` e `STRICT_MANAGER_DISCOUNT_AUT`, mas o código lê `NEXT_PUBLIC_IDLE_LOGOUT_MINUTES` (3 ocorrências) e `STRICT_MANAGER_DISCOUNT_AUTH` (15 ocorrências). Essas duas variáveis **não são lidas** em produção; vale o padrão do código. Para o desconto, o padrão é `STRICT_MANAGER_DISCOUNT_AUTH: true` (`lib/config/caixaSalesRuntimeConfig.ts`), ou seja, o comportamento efetivo é o estrito — seguro, mas se alguém cadastrou a variável para outro valor, ela não vale. O logout por inatividade usa o padrão do código em vez do valor cadastrado. Corrigir exige mudar variáveis de produção e afeta o fluxo comercial do PDV → **não alterado; pendente de decisão** (ver `VERCEL_PLANO_CORRECAO.md`, P5).
- `NEXT_PUBLIC_APP_URL` não existe; no navegador o ERP usa `window.location.origin` (`lib/auth/appOrigin.ts`), então o reset de senha funciona em qualquer host.

### 3.3 Arquivos versionados

| Arquivo | Lido por | Conteúdo relevante | Observação |
|---|---|---|---|
| `vercel.json` (raiz) | **nenhum projeto** | `framework`, `buildCommand: npm run build`, `installCommand: npm install`, `github.silent`, `github.autoJobCancelation` | Inerte: os dois projetos têm Root Directory. Pode enganar quem lê (sugere `npm install`, mas a Vercel usa `npm ci`). Mantido neste PR; remoção sugerida como pendência |
| `pdv-importados/vercel.json` | `pdv-importados` | `regions: ["gru1"]` | Ignore do ERP **não** estava aqui (só no painel) |
| `site/vercel.json` | `jinlong-site` | `regions: ["gru1"]`, `ignoreCommand: sh scripts/vercel-ignore.sh` | — |
| `turbo.json` / `package.json` (workspaces) | ambos (detecção Turbo/workspaces) | — | Base do recurso *skip de projetos não afetados* |

### 3.4 Middleware, redirects e rewrites

- **Site:** `site/middleware.ts` só atua em `/` (307 para o idioma). `site/next.config.ts` só cria redirecionamentos para o ERP quando `ERP_REDIRECT_ORIGIN` estiver definido (hoje não está).
- **ERP:** `pdv-importados/middleware.ts` cuida de sessão Supabase e proteção de rotas; **não tem lógica por host** e não há domínio fixo no código do ERP.
- Nenhum redirect/rewrite configurado no painel da Vercel para os domínios.

---

## 4. Histórico de deployments (janela de 2026-10-10 a 2026-10-16)

### 4.1 `pdv-importados`

| Alvo | Estado | Quantidade |
|---|---|---|
| production | READY | 15 |
| preview | CANCELED | 85 |

- **Todos os Previews são cancelados** antes do build (`buildSkipped: true`, 0 s).
- **Produção constrói em todo merge na `main`** (≈ 170–255 s por build). Comparando cada build de produção com o anterior: **13 de 14 tinham mudanças no ERP**; **1 (`072f130b`) só mudou `docs/`** e foi um build desnecessário.
- Hoje o desperdício é pequeno porque quase todo merge mexe no ERP. Mas **qualquer merge só do site também reconstrói e republica o ERP em produção** — exatamente o cenário que vai aumentar com o site comercial. Além do custo, isso gera um novo *deployment* de produção do ERP (nova entrada no histórico de rollback) sem mudança de código do ERP.

### 4.2 `jinlong-site`

| Alvo | Estado | Quantidade |
|---|---|---|
| production | READY | 1 |
| production | CANCELED | 14 |
| preview | READY | 25 |
| preview | CANCELED | 60 |

- **Produção funciona como esperado:** 14 de 15 merges na `main` foram ignorados com a mensagem do script, por exemplo:
  `[ignore-step] nenhuma mudança relevante ao site desde 100181b1…: ignorando build` → `The deployment was canceled because the Ignored Build Step command returned exit code 0.`
- **Preview constrói à toa.** Classificando os 25 Previews `READY` pelo diff entre o *merge-base* com a `main` e o commit construído:

| Classe | Quantidade | Exemplos |
|---|---|---|
| Sem nenhuma mudança relevante ao site (só ERP/backend/docs) | **20** | `loop/ux-t3-filterbar`, `loop/ux-t2-focus-ring`, `ci/migration-drift-homolog`, `claude/e2e-docs-sprints-*` |
| Com mudança relevante (lockfile/`package.json` da raiz) | 4 | `dependabot/npm_and_yarn/next-15.5.27`, `…/sentry-*`, `…/dev-minor-patch-*`, `cursor/palm-v1-*` |
| Indeterminado (commit fora do histórico local) | 1 | `cursor/auditoria-prontidao-fiscal-*` |

- **Evidência da causa** (build `dpl_D3Lkx6PuL9psqccxY2WGqkVgsuYo`, branch `loop/ux-t3-filterbar`, só ERP):
  ```
  Running "sh scripts/vercel-ignore.sh"
  [ignore-step] sem VERCEL_GIT_PREVIOUS_SHA: executando build
  Running "vercel build"
  ```
  `VERCEL_GIT_PREVIOUS_SHA` é o SHA do último deploy **bem-sucedido do projeto nesta branch**. No primeiro push de uma branch ele não existe; o script atual, corretamente conservador, constrói. Como o build ocorre, a branch passa a ter base e os pushes seguintes são ignorados — por isso o padrão "1 READY + vários CANCELED" por branch.
- Cada build desnecessário custa ≈ 35–47 s de máquina e cria um alias `jinlong-site-git-<branch>-jinlong.vercel.app` (há dezenas, um por branch do ERP).

### 4.3 Cancelamentos: o que são

| Tipo | Como reconhecer | Custo de build |
|---|---|---|
| Ignored Build Step retornou 0 | log "canceled because the Ignored Build Step command returned exit code 0" | segundos de clone; sem build |
| *Skip* de projeto não afetado / Preview do ERP | 0 s, sem logs de build, `buildSkipped: true` | nenhum |
| Substituído por push mais novo (`autoJobCancelation`) | cancelado durante a fila/build | parcial |

Nenhum dos `CANCELED` amostrados tem erro (`errorCode` vazio). **Cancelado ≠ falha.**

---

## 5. GitHub Actions e verificações

- Required checks da `main`: `build-and-test`, `gitleaks`, `Supabase local gates (RLS smoke + scope + REST)`, `edge-functions-typecheck`, `outbox-contract`, `anti-replay-diagnostic-gate`. **Nenhum status da Vercel é obrigatório** — os skips não bloqueiam merge.
- **SSRA (`release-validate.yml`) parado:** última execução real em **2026-10-08 00:14 UTC** (`success`); todas as execuções depois disso são `skipped`. O workflow roda em `deployment_status` e filtra `github.event.deployment.environment == 'production'`. Os ambientes GitHub atuais são:

  | Ambiente GitHub | Criado em | Deployments |
  |---|---|---|
  | `Production` (legado) | 2026-03-20 | 324 |
  | `Production – pdv-importados` | 2026-05-05 | 148 |
  | `Production – jinlong-site` | 2026-10-08 | 25 |
  | `Preview – jinlong-site` | 2026-10-08 | 179 |
  | (e legados `Production/Preview – fastproduct`, `– fastproduct-pdv-importados`) | | |

  Desde que o segundo projeto foi conectado, os deploys de produção do ERP chegam como `Production – pdv-importados` e o filtro nunca casa. Resultado: **o gate "deploymentId da plataforma = `/api/health`" não verifica nenhum deploy de produção do ERP há 8 dias.**
- `ci-pdv-importados.yml` já tem filtro de caminhos e não roda para mudanças só do site. O site **não tem workflow de CI** próprio (testes do site e do ignore step não rodam no GitHub) — pendência, não corrigida aqui para não criar pipeline nova.

---

## 6. Por que o Preview do ERP continua desligado

Ligar Preview por PR no ERP é útil, mas **hoje é inseguro**: o escopo Preview recebe `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` e `NEXT_PUBLIC_SUPABASE_URL` de produção. Um Preview de uma branch não revisada teria acesso total ao banco real (vendas, caixa, financeiro). A política atual (Preview sempre ignorado) é, portanto, a escolha correta até existir um Supabase de homologação no escopo Preview. A validação de PR do ERP continua a cargo do CI (`build-and-test` com build real + testes, Supabase local).

---

## 7. Domínios (estado em 2026-10-16)

| Host | Resposta | Projeto |
|---|---|---|
| `jinlong.app` | 307 → `https://www.jinlong.app/` | domínio do time; DNS na Vercel (`ALIAS @` e `ALIAS *`) |
| `www.jinlong.app` | 307 → `/login`; `/login` 200 | `pdv-importados` (produção) |
| `app.jinlong.app` | sem resposta HTTP (não vinculado) | nenhum |
| `pdv-importados.vercel.app`, `v0-pdv-importados.vercel.app` | ERP | `pdv-importados` |
| `jinlong-site.vercel.app` | 302 para login da Vercel (protegido) | `jinlong-site` |

---

## 8. Consumo e custo

| Item | Na janela (≈ 5,6 dias) | Projeção mensal (mesmo ritmo) |
|---|---|---|
| Builds de produção do ERP | 15 × ≈ 3,3 min ≈ 50 min | ≈ 270 min |
| …dos quais desnecessários | 1 (≈ 3,5 min) | cresce 1 build de ≈ 3 min por merge só de site/docs |
| Builds de Preview do site | 25 × ≈ 40 s ≈ 17 min | ≈ 90 min |
| …dos quais desnecessários | 20 (≈ 15 min) | ≈ 80 min |

- Os valores são de máquina *basic*. O impacto financeiro direto é pequeno; o maior ganho é **fila e concorrência** (builds do site disputando a vez com o ERP em dias de muitos PRs), **ruído** (status e aliases por branch) e **histórico de produção do ERP limpo** (só deploys com mudança real).
- O `jinlong-site` tem **concorrência elástica ligada** (builds extras sob demanda, cobrados à parte). Com os builds desnecessários eliminados, o risco de acionar cobrança elástica cai; desligar é decisão de painel (pendência).
- O plano do time não é exposto pela API usada; confirmar no painel (o plano Hobby não permite uso comercial).
