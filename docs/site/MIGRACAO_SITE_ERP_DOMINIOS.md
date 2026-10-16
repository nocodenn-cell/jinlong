# Migração: site comercial em jinlong.app, ERP em app.jinlong.app

**Status (2026-10-08):** Fase 1 parcialmente executada; **nenhum domínio, DNS, Supabase ou projeto do ERP foi alterado.**
- Criado o projeto Vercel `jinlong-site` (time `jinlong`, Root Directory `site`, Vercel Authentication = *all*, sem domínio personalizado, sem variáveis de ambiente).
- *Ignored Build Step* do site em `site/vercel.json`. O do ERP já pulava todo build fora de produção (`if [ "$VERCEL_ENV" == "production" ]; then exit 1; else exit 0; fi`) e **não foi alterado**.
- Decisão de migração aprovada: **novo login obrigatório** e **corte com caixas fechados**. Plano de homologação: `HOMOLOGACAO_APP_JINLONG_APP.md`.
**Levantamento:** 2026-10-08, somente leitura (Vercel CLI, `curl`, código do repositório).

## Atualização 2026-10-16 — canônico no apex (branch `feat/jinlong-site-erp-integration`)

Decisão do responsável: **`jinlong.app` é o canônico do site; `www.jinlong.app` redireciona para ele.** Isto substitui a tabela abaixo (apex → `www`) e as variáveis `…=https://www.jinlong.app` citadas nas fases.

| Domínio | Aplicação | Projeto Vercel |
|---|---|---|
| `jinlong.app` | site institucional (`site/`) | `jinlong-site` |
| `www.jinlong.app` → 307 → `jinlong.app` (caminhos do ERP → 307 direto para `app.jinlong.app`) | — | `jinlong-site` |
| `app.jinlong.app` | ERP/PDV (`pdv-importados/`) | `pdv-importados` |

O que mudou no código do site (o ERP **não** foi alterado):
- "Entrar", Privacidade e Termos apontam por padrão para `https://app.jinlong.app` (`site/lib/erpLinks.ts`). `NEXT_PUBLIC_ERP_URL=https://www.jinlong.app` volta ao ERP atual sem novo código.
- Canonical, sitemap e Open Graph usam `https://jinlong.app` por padrão (`site/lib/siteUrl.ts`).
- Redirect `www.<apex>/*` → `<apex>/*` (307, preserva caminho e query) em `site/next.config.ts`, depois dos redirects do ERP, para que `www.jinlong.app/login` vá ao ERP em **um** salto. Só atua quando o site recebe o host `www`; hoje o `www` é do ERP, então fica inerte.
- `ERP_REDIRECT_ORIGIN` continua **explícita** (sem ela, `/login` no site responde 404). É obrigatória no corte.

Estado verificado em 2026-10-16 (somente leitura): `jinlong.app` → 307 → `www.jinlong.app`; `www.jinlong.app` → 307 → `/login` (ERP, projeto `pdv-importados`); `app.jinlong.app` resolve no DNS (curinga) mas não responde HTTP (não vinculado); `jinlong-site` só tem `jinlong-site.vercel.app`.

### Ordem obrigatória (cada passo de produção exige autorização)
1. **Merge do PR** — sem efeito em produção: o site não tem domínio próprio; o ERP não muda.
2. **Fase 2:** vincular `app.jinlong.app` ao `pdv-importados` (sem remover `www`); Supabase *Redirect URLs* += `https://app.jinlong.app/**`; secret `VALIDAR_GERENTE_ALLOWED_ORIGINS` += `https://app.jinlong.app`; homologar (`HOMOLOGACAO_APP_JINLONG_APP.md`). Até aqui o "Entrar" do site (só em Preview) aponta para um host que ainda não responde — esperado.
3. **Fase 4 (corte, caixas fechados):** no `jinlong-site`, `ERP_REDIRECT_ORIGIN=https://app.jinlong.app` (e `NEXT_PUBLIC_SITE_URL` vazio ou `https://jinlong.app`; **nunca** `www`, senão o redirect www→apex fica inerte) → redeploy → mover `jinlong.app` e `www.jinlong.app` do `pdv-importados` para o `jinlong-site` (ambos como domínios normais, ou `www` como redirect de domínio da Vercel para `jinlong.app`) → Supabase `site_url = https://app.jinlong.app`.
4. Verificação pós-corte (`curl -sI`): `jinlong.app/pt-BR` 200; `www.jinlong.app/` → `jinlong.app/`; `www.jinlong.app/login?next=/caixa` e `jinlong.app/login` → `app.jinlong.app/login…`; `POST /api/*` → 307; `app.jinlong.app/login` 200.

### Rollback
| Situação | Ação | Tempo |
|---|---|---|
| Problema após o corte | mover `www.jinlong.app` (e `jinlong.app`) de volta ao `pdv-importados`; reverter `site_url` | ≈ 1 min |
| "Entrar" precisa voltar ao ERP antigo | `NEXT_PUBLIC_ERP_URL=https://www.jinlong.app` no `jinlong-site` + redeploy (útil só antes de o `www` ir para o site; depois disso o `www` já é o site e o link apenas ganharia um salto extra) | minutos |
| Deploy ruim do site | *Instant Rollback* do `jinlong-site` (independente do ERP) | segundos |
| Reverter o código | `git revert` do merge | minutos |

Redirects são 307 de propósito: navegadores não os fixam, então o rollback não deixa cache permanente.

## Arquitetura-alvo (versão de 2026-10-08, substituída acima quanto ao canônico)

| Domínio | Aplicação | Projeto Vercel |
|---|---|---|
| `jinlong.app` → 307 → `www.jinlong.app` | site comercial (`site/`) | **novo** (ex.: `jinlong-site`) |
| `www.jinlong.app` | site comercial | novo |
| `app.jinlong.app` | ERP/PDV (`pdv-importados/`) | `pdv-importados` (existente) |

## 1. Situação atual (evidências)

### Vercel
- Time `jinlong` (NatureCode). Projetos: `pdv-importados` e `ageguard`.
- `pdv-importados`: Root Directory `pdv-importados`, install `npm ci`, build `npm run build`, Node 24.x, produção em `www.jinlong.app`.
- Domínio `jinlong.app` registrado e com DNS na Vercel. Registros: `ALIAS @` e `ALIAS *` (curinga) → `cname.vercel-dns-016.com`. Logo, `app.jinlong.app` já resolve; falta só vinculá-lo a um projeto.
- `jinlong.app` responde 307 → `https://www.jinlong.app/`; `www.jinlong.app/` responde 307 → `/login`.
- **Integração Git ativa**: a listagem de deployments mostra Previews criados a partir de pushes de branch. Todo push de branch gera um build de Preview do `pdv-importados` (e, depois de criado, também do projeto do site).
- Proteção de Preview: SSO da Vercel ativo em `pdv-importados` (todas as URLs exceto domínios próprios). Previews de branch não ficam públicos. Ativar o mesmo no projeto do site.
- Aliases adicionais do ERP: `pdv-importados.vercel.app`, `pdv-importados-jinlong.vercel.app`, `v0-pdv-importados.vercel.app`; continuam apontando para o ERP após o corte.
- `vercel.json` da raiz: `github.silent: true`, `autoJobCancelation: true`. Não há *Ignored Build Step* configurado.
- O plano do time (Hobby ou Pro) não aparece na CLI. **Verificar no painel**: o plano Hobby não permite uso comercial.

### Autenticação (Supabase)
- Cookies de sessão do `@supabase/ssr` **sem `domain`** explícito → são *host-only* de `www.jinlong.app`. Não serão enviados a `app.jinlong.app`.
- Recuperação de senha: `redirectTo` = `window.location.origin` + `/auth/callback` (`lib/auth/appOrigin.ts`). O callback troca o código PKCE por sessão; o *code verifier* fica em cookie da origem que iniciou o fluxo.
- `site_url` e *Redirect URLs* reais ficam no painel do Supabase (o `config.toml` do repo só cobre o ambiente local).

### Estado do navegador preso à origem
- `localStorage['pdv-carrinho']`: carrinho persistido do caixa (zustand/persist).
- `localStorage['fastproduct_device_fingerprint']`: identificador do terminal, enviado como `terminalId` em movimentações de caixa e como `x-device-fingerprint` nas autorizações de desconto do gerente.
- Em `app.jinlong.app`, os dois começam vazios: carrinho vazio e um **novo** identificador de terminal.

### CORS, CSP e cabeçalhos
- Edge `validar-gerente`: allowlist em `VALIDAR_GERENTE_ALLOWED_ORIGINS` (secret remoto) → **precisa incluir `https://app.jinlong.app`**.
- Edge `sync-outbox`: reflete qualquer `Origin` (não muda com o domínio; observação de segurança fora deste escopo).
- ERP: sem CSP nem `X-Frame-Options` (observação, fora do escopo). Site: CSP restrita, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.

### Desktop (Tauri, `pdv-local`)
- Fala direto com a Edge Function `sync-outbox` via `SYNC_ENDPOINT` (`*.supabase.co`). Não há referência a `jinlong.app` no código do desktop. **Sem impacto** da troca de domínios.

### Isolamento do site
- `site/` não depende de Supabase, Sentry, `shared-core` nem do ERP; lê apenas variáveis `NEXT_PUBLIC_SITE_*`, `NEXT_PUBLIC_ERP_URL`, `ERP_REDIRECT_ORIGIN`, `NODE_ENV` e `VERCEL_ENV`. O teste `site/lib/platform.test.ts` falha se isso mudar.
- A demonstração usa só dados fictícios em memória; o e2e verifica que nenhuma requisição vai ao Supabase.

## 2. Fases

Cada fase só começa com autorização explícita e com a anterior estável.

### Fase 1 — Projeto do site na Vercel, sem domínio
1. Criar projeto `jinlong-site`: Root Directory `site`, install `npm ci`, build `npm run build`, Node 24.x, região `gru1`.
2. Variáveis: `NEXT_PUBLIC_SITE_URL=https://www.jinlong.app`, `NEXT_PUBLIC_ERP_URL=https://www.jinlong.app`. Sem `ERP_REDIRECT_ORIGIN`. Sem `NEXT_PUBLIC_SITE_ZH_REVIEWED` até a revisão nativa.
3. *Ignored Build Step* para não construir à toa:
   - site: `git diff --quiet HEAD^ HEAD -- site package-lock.json`
   - ERP (configuração no painel, sem mudar código): `git diff --quiet HEAD^ HEAD -- pdv-importados shared-core shared package.json package-lock.json`
4. Validar no Preview do site: screenshots, axe e `measure-vitals.mjs` contra a URL de Preview.

**Rollback:** apagar o projeto. Nenhum cliente é afetado.

### Fase 2 — ERP também em app.jinlong.app (em paralelo)
1. Adicionar `app.jinlong.app` ao projeto `pdv-importados`. `www.jinlong.app` continua servindo o ERP.
2. Supabase Auth: incluir `https://app.jinlong.app/**` nas *Redirect URLs*, mantendo as de `www`.
3. Secret `VALIDAR_GERENTE_ALLOWED_ORIGINS`: acrescentar `https://app.jinlong.app`, mantendo `www`.
4. Homologar em `app.jinlong.app`: login, esqueci/redefinir senha, abrir caixa, venda varejo e atacado, desconto com gerente, fechamento, relatórios.

**Rollback:** remover o domínio `app` do projeto. `www` nunca deixou de funcionar.

### Fase 3 — Piloto
Uma loja passa a usar `app.jinlong.app` por alguns dias, com caixa fechado na troca (ver riscos).

### Fase 4 — Corte de domínios (janela fora do horário das lojas, caixas fechados)
1. No site: `NEXT_PUBLIC_ERP_URL=https://app.jinlong.app` e `ERP_REDIRECT_ORIGIN=https://app.jinlong.app`; redeploy.
2. Mover `www.jinlong.app` e `jinlong.app` do projeto `pdv-importados` para `jinlong-site` (manter apex → `www`).
3. Supabase Auth: `site_url = https://app.jinlong.app`.
4. Verificar: `www.jinlong.app/login?next=/caixa` → 307 → `app.jinlong.app/login?next=%2Fcaixa`; `/auth/callback?code=…` preserva a query; `/admin/*`, `/caixa/*`, `/gerente/*`, `/api/*` redirecionam (POST mantém o método com 307).
5. Os redirecionamentos são **307 (temporários)** de propósito: navegadores não os gravam como permanentes, o que mantém o rollback limpo. Depois de estável (sugestão: 30 dias), avaliar 308.

**Rollback (≈ 1 minuto):** mover `www.jinlong.app` de volta ao `pdv-importados`. `app.jinlong.app` continua funcionando em paralelo, então quem já migrou não é afetado. Reverter `site_url` no Supabase.

**Gatilhos de rollback:** falha de login acima do normal, 404 em caminhos do ERP, erros novos no Sentry do ERP, qualquer erro de caixa ou de venda.

## 3. Impactos para clientes (conhecidos e aceitos só com autorização)

| Impacto | Causa | Mitigação |
|---|---|---|
| Novo login uma vez em `app.jinlong.app` | cookies *host-only* de `www` | comunicar antes; corte fora do horário. A alternativa (cookie com `domain=.jinlong.app`) altera o fluxo de auth e exige autorização própria |
| Carrinho em aberto não acompanha | `localStorage` é por origem | corte com caixas fechados e sem vendas em espera |
| Novo identificador de terminal | `fastproduct_device_fingerprint` é por origem | corte com caixas fechados; conferir se algum relatório ou regra depende do `terminalId` antigo |
| Link de redefinição de senha enviado antes do corte falha uma vez | o *code verifier* PKCE ficou em cookie de `www` | o usuário pede um novo link (a tela já mostra "link expirado") |
| Atalhos e favoritos antigos | mudança de host | redirecionamentos 307 do site preservam caminho e query |

## 4. Custos na Vercel

- **Seats**: um projeto a mais não adiciona assento; o custo do plano Pro é por membro.
- **Uso**: o site é estático (SSG) e leve (~210–230 KB por visita no primeiro acesso, as duas páginas são HTML pré-gerado; execução no servidor só no *middleware* da raiz `/` e no 404 de caminhos desconhecidos). O consumo esperado é marginal perto do ERP.
- **Builds**: sem *Ignored Build Step*, cada push construiria os dois projetos; com ele, só o projeto afetado.
- **Plano**: confirmar no painel. Se o time estiver no Hobby, o uso comercial já viola os termos hoje (o ERP é comercial), independentemente do site.

## 5. Autorizações ainda necessárias

1. Push da branch (gera Preview automático do `pdv-importados`) e abertura do PR.
2. Criação do projeto `jinlong-site` na Vercel e configuração de *Ignored Build Step* nos dois projetos.
3. Fase 2: domínio `app.jinlong.app`, Redirect URLs do Supabase, secret `VALIDAR_GERENTE_ALLOWED_ORIGINS`.
4. Fase 4: mover domínios, `site_url` do Supabase, data e janela do corte, comunicação aos clientes.
5. Decisão sobre sessões: aceitar um novo login ou alterar o domínio dos cookies (mudança de auth).
6. Merge.
7. Publicação do zh-CN após revisão nativa (`NEXT_PUBLIC_SITE_ZH_REVIEWED=true`).
8. Valores dos canais (`NEXT_PUBLIC_SITE_WHATSAPP_URL`, `NEXT_PUBLIC_SITE_WECHAT_ID`).
