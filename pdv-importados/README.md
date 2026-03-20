# PDV Importados — frontend web

Sistema de ponto de venda para lojas de importados no Brasil (Next.js 15, App Router).

## Idiomas e rotas

- **Traduções:** `src/lib/i18n/*.json` carregadas por `getMessages()` — editar apenas essa pasta (ver `src/lib/i18n/README.md`).
- **URLs sem prefixo de locale:** o painel não usa `/pt/...`; o idioma vem do perfil do usuário (Supabase) + cookie/ações de servidor.
- **Rota de login:** `/login` (`app/login/page.tsx`).
- **Middleware:** `middleware.ts` exige sessão Supabase em `/gerente/*` e `/caixa`; anônimos são redirecionados para `/login?next=...`. Dados continuam protegidos por RLS.

> O bloco `i18n` foi removido de `next.config.js` (era legado do Pages Router; este projeto não usa `pages/` para rotas).

## Funcionalidades

- Login (Supabase Auth) e painel gerente (produtos, idioma PT / 普通话 / 廣東話)
- Integração com Supabase (catálogo, usuários)

## Tecnologias

- Next.js 15 (App Router), TypeScript, Tailwind
- Supabase (Auth + Postgres)
- Zustand (onde aplicável)
- Mensagens do painel: **`getMessages` + JSON** em `src/lib/i18n/` (trilingue).

## Estrutura (resumo)

```
app/
  login/          → /login
  gerente/        → painel gerente
  caixa/          → PDV caixa (quando habilitado)
src/lib/i18n/     → pt.json, zh.json, zh-HK.json (fonte de tradução)
```

## Desenvolvimento

```bash
npm install
cp .env.example .env.local
# Preencher NEXT_PUBLIC_SUPABASE_* — ver docs/SUPABASE_ENV.md
npm run dev
```

Build: `npm run build` · Testes: `npm test` · E2E: `npm run test:e2e`

## Deploy

Ver documentação na raiz do monorepo: `../docs/DEPLOY_VERCEL.md`.
