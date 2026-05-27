# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Monorepo with npm workspaces + Turborepo. Standard commands are in the root `README.md` and `package.json`. Key modules:

| Module | Dev command | Port |
|--------|-------------|------|
| `pdv-importados` (Next.js web POS) | `npm run dev:web` | 3000 |
| `pdv-local` (Tauri/Vite desktop POS) | `npm run dev:desktop` | 4173 |
| `backend` (Supabase Edge Functions) | N/A (type-check only: `npm run check`) | — |
| `shared-core` | N/A (library) | — |

### Environment variable gotcha

The injected secret `NEXT_PUBLIC_SUPABASE_URL` contains only the Supabase **project reference** (e.g. `kbabmewnah...`), not the full URL. The Next.js app validates that it starts with `https://`. Before running `next dev`, `next build`, or any command that reads this env var, you must either:

1. **Unset the process env var** so `.env.local` values take precedence: `unset NEXT_PUBLIC_SUPABASE_URL && unset NEXT_PUBLIC_SUPABASE_ANON_KEY`
2. Or construct the full URL in `.env.local`: `https://<ref>.supabase.co`

The update script generates a proper `.env.local` automatically from the injected secrets.

### Running dev servers

```bash
# Web (Next.js) — must unset env vars first:
unset NEXT_PUBLIC_SUPABASE_URL && unset NEXT_PUBLIC_SUPABASE_ANON_KEY && npm run dev:web

# Desktop (Vite only, no Tauri native shell):
npm run dev:desktop
```

### Running checks

```bash
npm run lint        # ESLint on all workspaces
npm run test        # Vitest on pdv-importados, pdv-local, shared-core
npm run check       # Deno type-check for Edge Functions (downloads deno via npx)
npm run build       # Next.js production build (needs valid Supabase URL in env)
```

### Known flaky tests

`pdv-local/src/hooks/usePdvLocalOutboxSync.test.tsx` — 2 tests (`reprocessa DLQ...`) intermittently timeout at 5s. This is pre-existing and not caused by environment setup.

### SWC native binding

`pdv-local` uses `@vitejs/plugin-react-swc` which requires the platform-specific `@swc/core-linux-x64-gnu` binary. The update script installs it. If `npm ci` is run without it, pdv-local tests and Vite dev will fail with "Failed to load native binding".

### Build requires valid Supabase URL

`next build` statically pre-renders pages that call `assertSupabasePublicEnv()`. The Supabase URL must be a valid `https://` URL. Ensure `.env.local` has the full URL or unset the process-level env var before building.
