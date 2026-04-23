# Comandos rápidos (pdv-importados)

Na maioria dos fluxos use **working directory** = esta pasta (`pdv-importados`). O monorepo também aceita `npm ci` na **raiz** (`fastproduct/`) e scripts na raiz (`npm run dev:web`, `npm run lint`, etc.) — ver `../README.md`.

| Objetivo | Comando |
|----------|---------|
| Instalar deps | Na raiz: `npm ci` · só aqui: `npm install` (gera lockfile local; evite no CI) |
| Dev (ver porta no terminal) | `npm run dev` |
| Build produção | `npm run build` · depois `npm run start` |
| Lint | `npm run lint` |
| Testes unitários | `npm test` |
| E2E (reutiliza `:3000` se `dev` ativo; senão sobe Next) | `npm run test:e2e` |
| Smoke HTTP (precisa `dev` em outra aba) | `npm run smoke:http` |
| Smoke em outra porta | `$env:SMOKE_BASE_URL="http://localhost:3001"; npm run smoke:http` |
| Seed Auth + `usuarios` (dev/E2E) | `npm run seed:dev-users` — [docs/SEED_DEV_E2E.md](docs/SEED_DEV_E2E.md) |

**Ambiente:** copiar `.env.example` → `.env.local`. Após mudar `.env.local`, **reiniciar** `npm run dev`.

**Supabase:** `NEXT_PUBLIC_SUPABASE_URL` = URL `https://....supabase.co` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` = JWT da anon key (não inverter).

**E2E com login real:** após `seed:dev-users`, use o e-mail do gerente (padrão `e2e-gerente@localhost.test`) e a mesma senha em `PLAYWRIGHT_TEST_EMAIL` / `PLAYWRIGHT_TEST_PASSWORD` (PowerShell: `$env:PLAYWRIGHT_TEST_EMAIL=...`). Ver [docs/SEED_DEV_E2E.md](docs/SEED_DEV_E2E.md).
# trigger ci
