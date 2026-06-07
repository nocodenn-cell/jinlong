# Admin Auth Stability Checkpoint (v1)

Baseline de arquitetura para `/admin` — branch `release/admin-auth-stable-v1`.

## Pipeline final confirmado

```
Request → middleware → AdminLayout → AdminShell → Page
```

| Camada | Arquivo | Responsabilidade |
|--------|---------|------------------|
| Edge | `pdv-importados/middleware.ts` | Refresh cookies Supabase; redirect `/login` em rotas protegidas |
| Gate UI | `pdv-importados/app/admin/layout.tsx` | Único redirect de auth na UI (`resolveAdminSession`) |
| Shell | `pdv-importados/app/admin/_components/AdminShell.tsx` | Layout visual (sem auth) |
| Páginas | `app/admin/**/page.tsx` | Dados apenas; `getAdminContext()` cacheado |
| Actions | `app/admin/**/actions.ts` | `assertAdminSession` — sem redirect |
| API | `app/api/gerente/*` | `requireAdminSessionApi` — 401 JSON, sem redirect |

## Regras duras

1. **Layout é o único gate UI** — `redirect()` de autenticação só em `app/admin/layout.tsx`.
2. **Middleware é o único gate edge** — proteção de rota e refresh de sessão só em `middleware.ts`.
3. **API nunca redireciona** — retorno `401`/`403` JSON apenas.
4. **Actions nunca fazem redirect** — `assertAdminSession` retorna erro estruturado.
5. **Segment `/admin` é 100% dinâmico** — em `layout.tsx`:

   ```ts
   export const dynamic = 'force-dynamic'
   export const fetchCache = 'force-no-store'
   export const revalidate = 0
   ```

6. **Single source of truth** — `lib/admin/auth/resolveAdminSession.ts` (Supabase SSR via `createClient`).

## Proibições explícitas (regressão)

- Novo uso direto de `cookies()` em páginas ou layouts `/admin` (usar `resolveAdminSession` / `createClient`).
- Novo `redirect()` de auth fora de `middleware.ts` e `app/admin/layout.tsx`.
- Layout paralelo em `/admin` (ex.: `layout-complex.tsx`, route groups com gate próprio).
- SSG/ISR/cache estrutural no segmento admin.
- `proxy.ts` — substituído por `middleware.ts`; não reintroduzir.

## Validação pré-push

```bash
cd pdv-importados
npm run build
```

Critérios:

- Sem erro `DYNAMIC_SERVER_USAGE` no build.
- Todas as rotas `/admin/*` listadas como `ƒ` (dynamic) no output do build.
- `Middleware` presente no bundle.

## Smoke preview (Vercel)

1. Login → `/admin/dashboard`
2. Refresh da página
3. Logout
4. Acesso direto a `/admin/catalogo` sem sessão → `/login`

## Arquivos do checkpoint v1

- `pdv-importados/middleware.ts`
- `pdv-importados/lib/admin/auth/*`
- `pdv-importados/app/admin/layout.tsx`
- `pdv-importados/app/admin/_components/AdminShell.tsx`
- Remoção: `layout-complex.tsx`, `proxy.ts`
- `pdv-importados/lib/auth/usuarioAtual.ts` (sem redirect em sessão expirada)
- `app/admin/dashboard/page.tsx`, `app/admin/catalogo/page.tsx` (`getAdminContext`)
- `app/admin/estoque/actions.ts`, `app/admin/vendas/actions.ts`
- `app/api/gerente/**/route.ts` (guards API)
