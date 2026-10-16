# Arquitetura de deploy — site institucional + ERP/PDV Jinlong

**Data:** 2026-10-16 · **Status:** recomendação. Nenhum domínio, DNS, Supabase ou projeto Vercel foi alterado.
Base factual: `VERCEL_AUDITORIA_SITE_PDV.md`. Execução e rollback: `VERCEL_PLANO_CORRECAO.md`.
Runbook de migração de domínios já existente (mantido como fonte detalhada): `docs/site/MIGRACAO_SITE_ERP_DOMINIOS.md` e `docs/site/HOMOLOGACAO_APP_JINLONG_APP.md`.

---

## 1. Decisão

**Manter dois projetos Vercel separados, no mesmo monorepo, com builds independentes.** Experiência de produto unificada é resolvida por **domínios e links**, não por juntar os códigos de frontend.

| Domínio | Função | Projeto Vercel | Código |
|---|---|---|---|
| `jinlong.app` | site institucional, apresentação, página inicial | `jinlong-site` | `site/` |
| `www.jinlong.app` | redireciona para `jinlong.app` | `jinlong-site` (redirect de domínio) | — |
| `app.jinlong.app` | ERP: login, administração, PDV | `pdv-importados` | `pdv-importados/` + `shared-core/` + `shared/` |

O site tem uma entrada clara para o sistema ("Entrar" / "Acessar o sistema") apontando para `https://app.jinlong.app/login`, controlada por `NEXT_PUBLIC_ERP_URL` (já suportado em `site/lib/erpLinks.ts`).

> **Diferença em relação ao runbook de 2026-10-08:** lá o domínio canônico do site era `www.jinlong.app` (apex → `www`). O pedido atual inverte (`www` → apex). Tecnicamente as duas formas funcionam na Vercel; a escolha é de marca/SEO e **precisa de aprovação** antes da Fase 4. O código do site só precisa de `NEXT_PUBLIC_SITE_URL` coerente com a escolha.

## 2. Por que não unificar o frontend

| Critério | Dois projetos (recomendado) | Um app só |
|---|---|---|
| Isolamento de falha | build quebrado do site não bloqueia deploy do PDV (e vice-versa) | um erro em qualquer lado derruba os dois |
| Segurança | site sem Supabase, sem segredos, sem variáveis (verificado por `site/lib/platform.test.ts`); CSP restrita | site herdaria o bundle, o middleware de sessão e as variáveis do ERP |
| Rollback | *Instant Rollback* separado por projeto | rollback do site reverte o PDV junto |
| Custo de build | site ≈ 40 s; ERP ≈ 3 min; cada um só quando muda | todo ajuste de texto do site custa um build completo do ERP |
| Cache/desempenho | site estático (SSG), CDN | páginas de marketing dentro de um app com middleware de auth em todas as rotas |
| Ritmo de release | site atualizável a qualquer hora, sem tocar no PDV em horário de loja | qualquer publicação do site é também uma publicação do PDV |

## 3. Fluxo do usuário e dependências de autenticação

```
jinlong.app  ──(link "Entrar")──▶  app.jinlong.app/login  ──▶ /admin | /gerente | /caixa
   (site, estático)                  (ERP, sessão Supabase)
```

O site **não autentica** e nunca chama o Supabase. A navegação site → ERP é só um link, então:

| Aspecto | Precisa mudar? | Detalhe |
|---|---|---|
| Cookies de sessão | Não para funcionar; sim se quiser sessão compartilhada | `@supabase/ssr` sem `domain` → cookies *host-only*. Em `app.jinlong.app` o usuário faz **um novo login** uma vez (decisão aprovada em 2026-10-08). Compartilhar sessão entre hosts exigiria `domain=.jinlong.app` — mudança de auth, não recomendada (o site não precisa de sessão) |
| Callback de recuperação de senha | Sim (configuração, não código) | `redirectTo` = `window.location.origin + /auth/callback` → funciona em qualquer host, mas o Supabase precisa permitir `https://app.jinlong.app/**` nas *Redirect URLs*. `site_url` só muda no corte |
| CORS da Edge `validar-gerente` | Sim (secret) | `VALIDAR_GERENTE_ALLOWED_ORIGINS` precisa incluir `https://app.jinlong.app` |
| Middleware do ERP | Não | sem lógica por host; nenhum domínio fixo no código do ERP |
| Redirects de links antigos | Sim, no corte | site com `ERP_REDIRECT_ORIGIN=https://app.jinlong.app` redireciona `/login`, `/admin/*`, `/caixa/*`, `/gerente/*`, `/api/*`, `/auth/*` com **307** (preserva método e query) — já implementado em `site/lib/erpRedirects.ts` |
| Estado local do PDV | Atenção operacional | carrinho (`pdv-carrinho`) e identificador do terminal ficam no `localStorage` por origem → **corte com caixas fechados** |
| Desktop (Tauri) | Não | fala direto com o Supabase |

Nenhuma dessas mudanças altera o Supabase de produção **neste PR**. Todas estão listadas como pendentes de autorização.

## 4. CI/CD por projeto

| | `pdv-importados` | `jinlong-site` |
|---|---|---|
| Produção | build só se mudou algo fora de `site/`, `docs/`, `.github/`, `*.md` da raiz (lista de exclusão: na dúvida, constrói) | build só se mudou `site/` ou `package.json`/`package-lock.json`/`.npmrc` da raiz (o site é isolado; na dúvida, constrói) |
| Preview por PR | **desligado** (Preview usa segredos do Supabase de produção). Validação de PR = CI `build-and-test` | **ligado**, só quando a branch mexe no site (comparação com o último deploy da branch ou, no primeiro push, com a saída da `main`) |
| Configuração | versionada: `pdv-importados/vercel.json` + `pdv-importados/scripts/vercel-ignore.sh` | versionada: `site/vercel.json` + `site/scripts/vercel-ignore.sh` |
| Gate pós-deploy | SSRA (`release-validate.yml`) no ambiente `Production – pdv-importados` | nenhum (site estático; pendência opcional) |
| Rollback | Instant Rollback do projeto | Instant Rollback do projeto |

Mudanças compartilhadas (`package-lock.json`, `package.json`, `.npmrc` da raiz) constroem **os dois** projetos — comportamento correto, porque mudam o install de ambos.

## 5. Evolução recomendada para Preview do ERP (fora deste PR)

1. Criar Supabase de homologação (ou *branching*) e cadastrar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` **somente no escopo Preview** com valores de homologação.
2. Remover esses nomes do escopo Preview de produção.
3. Só então trocar no `pdv-importados/scripts/vercel-ignore.sh` o `exit 0` de Preview pela mesma lógica de exclusão de caminhos.

## 6. Fases (resumo; detalhes no runbook de domínios)

| Fase | O que | Precisa de aprovação | Rollback |
|---|---|---|---|
| 0 | **Este PR:** ignore steps versionados + SSRA reativado + documentação | merge | `git revert` |
| 1 | Variáveis do site (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ERP_URL`) e validação no Preview | sim | remover variáveis |
| 2 | `app.jinlong.app` → `pdv-importados` **em paralelo** a `www`; Redirect URLs Supabase; secret `validar-gerente` | sim (produção) | remover domínio `app` |
| 3 | Piloto em uma loja | sim | voltar a usar `www` |
| 4 | Corte: `jinlong.app`/`www` → `jinlong-site`; `ERP_REDIRECT_ORIGIN`; `site_url` | sim (produção, janela fora do horário, caixas fechados) | mover `www`/apex de volta ao `pdv-importados` (≈ 1 min) |
