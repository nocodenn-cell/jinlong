# E2E local do módulo Comissão (nunca contra produção)

Harness: Postgres local com a cadeia de migrations + `2026102120*_comissao_*.sql`, PostgREST e um gateway mínimo
(`gateway.mjs`: `/rest/v1` → PostgREST, `/auth/v1` → JWT HS256 local, senha única via `SENHA`). Dados 100% fictícios.

1. `createdb -T <base_com_migrations> com_ui` e aplique as 3 migrations do módulo; `psql -d com_ui -f seed.sql` (rodar a partir desta pasta).
2. `GRANT anon, authenticated, service_role TO authenticator;` e suba o PostgREST (porta 54330, `db-schemas=public`, `jwt-secret=$JWT_SECRET`).
3. `SENHA=... JWT_SECRET=... node gateway.mjs` (porta 54321); gere anon key (role `anon`) com o mesmo segredo.
4. `.env.local` com `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` e a anon key; `next build && next start -p 3311`.
5. `COMISSAO_E2E=1 COMISSAO_E2E_SENHA=... PLAYWRIGHT_BASE_URL=http://127.0.0.1:3311 npx playwright test e2e/comissao-modulo.spec.ts`
